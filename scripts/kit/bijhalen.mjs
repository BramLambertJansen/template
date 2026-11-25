// Haalt `main` binnen of zet de branch met een fast-forward vooruit zonder beschermde paden te schrijven (spec bijhalen,
// leerpunt #789 deel b). Drie standen: `main` zet een merge met origin/main in de index en MERGE_HEAD, `volg <ref>` zet de
// branch op een opvolger, `terug` breekt een lopende merge van `main` af. Beschermd is wat onder de vaste lijst valt of
// vooraf niet schrijfbaar blijkt; de nieuwe inhoud daarvan komt onder os.tmpdir()/bijhalen/<sha>/ en de agent neemt die
// over met Edit. Volgorde: controles, schrijfbare bestanden, index, refs; faalt een stap, dan zet het script alles terug.
// Het script haalt niets op (de agent doet eerst `git fetch`). Zonder dependencies, zodat het op een kale Node draait.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * @typedef {{ stand: 'main' } | { stand: 'volg', ref: string } | { stand: 'terug' }} BijhalenStand
 * @typedef {{ pad: string, inhoud: Buffer | null, uitvoerbaar: boolean }} WerkmapStap
 * @typedef {{
 *   lees: (pad: string) => { inhoud: Buffer, uitvoerbaar: boolean } | null,
 *   schrijf: (pad: string, inhoud: Buffer, uitvoerbaar: boolean) => void,
 *   verwijder: (pad: string) => void,
 * }} WerkmapIo
 * @typedef {{ pad: string, oudModus: string, nieuwModus: string, nieuwSha: string }} Wijziging
 * @typedef {{ sha: string, boom: string, wijzigingen: Wijziging[], refs: () => void, herstelRefs: () => void }} Plan
 */

export const GEBRUIK = 'Gebruik: node scripts/kit/bijhalen.mjs main | volg <ref> | terug';

const BESCHERMDE_MAPPEN = ['.claude/skills/', '.claude/agents/', '.claude/hooks/'];
const BESCHERMDE_BESTANDEN = ['.claude/settings.json', '.claude/settings.local.json'];
const GEEN = '000000';
const BIJZONDER = ['120000', '160000'];

/** Een weigering of fout met de regels die het script letterlijk meldt. */
class Melding extends Error {
  /** @param {string[]} regels */
  constructor(regels) {
    super(regels[0] ?? '');
    this.regels = regels;
  }
}

/** @param {string} reden @returns {Melding} */
const geweigerd = (reden) => new Melding([`✗ bijhalen geweigerd: ${reden}`]);

/** @param {unknown} fout @returns {string} */
const reden = (fout) => (fout instanceof Error ? fout.message : String(fout));

/** @param {unknown} fout @returns {string} */
const foutcode = (fout) =>
  fout instanceof Error && 'code' in fout && typeof fout.code === 'string' ? fout.code : reden(fout);

/**
 * Valt het pad onder de vaste lijst die de sandbox niet kan schrijven?
 * @param {string} pad pad relatief aan de werkmap-root, met `/`
 * @returns {boolean}
 */
export function isSandboxBeschermd(pad) {
  return BESCHERMDE_BESTANDEN.includes(pad) || BESCHERMDE_MAPPEN.some((map) => pad.startsWith(map));
}

/**
 * Verdeelt paden in schrijfbaar en beschermd, met behoud van de volgorde van de invoer.
 * @param {readonly string[]} paden
 * @param {(pad: string) => boolean} schrijfbaar
 * @returns {{ schrijven: string[], beschermd: string[] }}
 */
export function verdeelPaden(paden, schrijfbaar) {
  /** @type {string[]} */
  const schrijven = [];
  /** @type {string[]} */
  const beschermd = [];
  for (const pad of paden) (isSandboxBeschermd(pad) || !schrijfbaar(pad) ? beschermd : schrijven).push(pad);
  return { schrijven, beschermd };
}

/**
 * Leest de stand uit de argumenten; ongeldige invoer gooit een Error met de gebruiksmelding.
 * @param {readonly string[]} args
 * @returns {BijhalenStand}
 */
export function bijhalenArgumenten(args) {
  const [stand, ref] = args;
  if (args.length === 1 && stand === 'main') return { stand: 'main' };
  if (args.length === 1 && stand === 'terug') return { stand: 'terug' };
  if (args.length === 2 && stand === 'volg' && ref !== undefined && ref !== '' && !ref.startsWith('-'))
    return { stand: 'volg', ref };
  throw new Error(GEBRUIK);
}

/** @param {WerkmapStap} stap @param {WerkmapIo} io */
function zetStap(stap, io) {
  if (stap.inhoud === null) io.verwijder(stap.pad);
  else io.schrijf(stap.pad, stap.inhoud, stap.uitvoerbaar);
}

/** Zet herstelstappen zo goed mogelijk terug; een fout hier verdringt de oorspronkelijke fout niet.
 * @param {readonly WerkmapStap[]} herstel @param {WerkmapIo} io */
function herstelStil(herstel, io) {
  for (const stap of herstel) {
    try {
      zetStap(stap, io);
    } catch {
      // Best effort: de oorspronkelijke fout gaat voor.
    }
  }
}

/**
 * Past de stappen toe op de werkmap (`inhoud: null` is verwijderen). Faalt een stap, dan zet de functie de eerdere
 * stappen terug en gooit ze de oorspronkelijke fout door. Geeft de herstelstappen terug (nieuwste eerst), waarmee de
 * aanroeper alles kan terugzetten als een latere stap faalt.
 * @param {readonly WerkmapStap[]} stappen
 * @param {WerkmapIo} io
 * @returns {WerkmapStap[]}
 */
export function pasWerkmapToe(stappen, io) {
  /** @type {WerkmapStap[]} */
  const herstel = [];
  for (const stap of stappen) {
    try {
      const oud = io.lees(stap.pad);
      herstel.unshift({ pad: stap.pad, inhoud: oud?.inhoud ?? null, uitvoerbaar: oud?.uitvoerbaar ?? false });
      zetStap(stap, io);
    } catch (fout) {
      herstelStil(herstel, io);
      throw fout;
    }
  }
  return herstel;
}

/** @returns {Record<string, string>} */
function omgevingZonderGit() {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [naam, waarde] of Object.entries(process.env))
    if (waarde !== undefined && !/^GIT_/i.test(naam)) env[naam] = waarde;
  return env;
}

const MAX_BUFFER = 512 * 1024 * 1024;

/** Eerste niet-lege regel van een foutuitvoer, zonder vervolguitleg. @param {string} tekst @returns {string} */
const eersteRegel = (tekst) =>
  (
    tekst
      .split('\n')
      .map((regel) => regel.trim())
      .find((regel) => regel !== '') ?? ''
  ).replace(/\s+/g, ' ');

/**
 * Voert git uit zonder GIT_*-variabelen van de aanroeper (GIT_DIR, GIT_INDEX_FILE …). Een niet-nul status buiten
 * `toegestaan` is een fout met een korte melding, zonder stacktrace.
 * @param {string} root
 * @param {string[]} args
 * @param {number[]} [toegestaan]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function git(root, args, toegestaan = []) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: omgevingZonderGit(), maxBuffer: MAX_BUFFER });
  if (r.error !== undefined || r.status === null || (r.status !== 0 && !toegestaan.includes(r.status))) {
    throw new Error(`git ${args[0] ?? ''} faalt: ${eersteRegel(r.error?.message ?? r.stderr)}`);
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** @param {string} root @param {string} sha @returns {Buffer} */
function gitBlob(root, sha) {
  const r = spawnSync('git', ['cat-file', 'blob', sha], { cwd: root, env: omgevingZonderGit(), maxBuffer: MAX_BUFFER });
  if (r.error !== undefined || r.status !== 0)
    throw new Error(`git cat-file faalt: ${(r.error?.message ?? r.stderr.toString()).trim()}`);
  return r.stdout;
}

/** @param {string} root @param {string} naam @returns {string} */
const gitPad = (root, naam) => path.resolve(root, git(root, ['rev-parse', '--git-path', naam]).stdout.trim());

/** @param {string} root @param {string} ref @returns {string | null} */
function commitVan(root, ref) {
  const r = git(root, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], [1, 128]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/** @param {string} root @param {string} a @param {string} b @returns {boolean} */
const isVoorouder = (root, a, b) => git(root, ['merge-base', '--is-ancestor', a, b], [1]).status === 0;

/**
 * Schrijfbaar volgens het bestandssysteem: W_OK op het pad zelf, of anders op de diepste bestaande voorouder.
 * @param {string} root @param {string} pad @returns {boolean}
 */
function schrijfbaar(root, pad) {
  let huidig = path.join(root, pad);
  for (;;) {
    try {
      accessSync(huidig, constants.W_OK);
      return true;
    } catch (fout) {
      const code = foutcode(fout);
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return false;
    }
    const ouder = path.dirname(huidig);
    if (ouder === huidig) return false;
    huidig = ouder;
  }
}

/** @param {string} vol @returns {boolean} */
function bestaat(vol) {
  try {
    lstatSync(vol);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schrijft een werkmapbestand via één fd: openen zonder een symlink te volgen, schrijven en de modus zetten op dezelfde
 * fd, zodat er tussen controle en gebruik geen pad opnieuw wordt opgezocht.
 * @param {string} vol @param {{ inhoud: Buffer, uitvoerbaar: boolean }} staat
 */
function schrijfWerkmapBestand(vol, { inhoud, uitvoerbaar }) {
  mkdirSync(path.dirname(vol), { recursive: true });
  const fd = openSync(vol, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o666);
  try {
    writeFileSync(fd, inhoud);
    const modus = fstatSync(fd).mode & 0o777;
    fchmodSync(fd, uitvoerbaar ? modus | ((modus & 0o444) >> 2) : modus & ~0o111);
  } finally {
    closeSync(fd);
  }
}

/**
 * De basismap `<os.tmpdir()>/bijhalen`: een echte map (geen symlink) van deze gebruiker, alleen voor de eigenaar
 * (zoals veiligeBasismap() in pnpm-installeer.mjs). Een eigen map met te ruime rechten wordt eerst dichtgezet.
 * @returns {string}
 */
function veiligeTmpBasis() {
  const basis = path.join(tmpdir(), 'bijhalen');
  mkdirSync(basis, { recursive: true, mode: 0o700 });
  const uid = process.getuid?.();
  const ruim = () => {
    const stat = lstatSync(basis);
    if (!stat.isDirectory()) throw new Error(`${basis} is geen gewone map`);
    if (uid !== undefined && stat.uid !== uid) throw new Error(`${basis} is van een andere gebruiker`);
    return (stat.mode & 0o077) !== 0;
  };
  if (ruim()) chmodSync(basis, 0o700);
  if (ruim()) throw new Error(`${basis} is toegankelijk voor anderen (verwacht mode 0700)`);
  return basis;
}

/**
 * Schrijft een nieuw tmp-bestand onder de veilige basismap: `wx` (nooit een bestaand bestand of symlink) en mode 0600,
 * of 0700 als de inhoud uitvoerbaar is.
 * @param {string} vol @param {{ inhoud: Buffer, uitvoerbaar: boolean }} staat
 */
function schrijfTmpBestand(vol, { inhoud, uitvoerbaar }) {
  mkdirSync(path.dirname(vol), { recursive: true, mode: 0o700 });
  writeFileSync(vol, inhoud, { flag: 'wx', mode: uitvoerbaar ? 0o700 : 0o600 });
}

/** Verwijdert een bestand en daarna de lege mappen erboven, tot de root (zoals git). @param {string} root @param {string} pad */
function verwijderBestand(root, pad) {
  const vol = path.join(root, pad);
  rmSync(vol, { force: true });
  let map = path.dirname(vol);
  while (map !== root && map.startsWith(`${root}${path.sep}`)) {
    try {
      rmdirSync(map);
    } catch {
      return;
    }
    map = path.dirname(map);
  }
}

/**
 * Leest een bestand via één fd zonder een symlink te volgen (ELOOP is een fout). Afwezig (ENOENT, ENOTDIR) geeft null.
 * @param {string} vol @returns {{ inhoud: Buffer, modus: number, gewoon: boolean } | null}
 */
function leesZonderSymlink(vol) {
  let fd;
  try {
    fd = openSync(vol, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (fout) {
    const code = foutcode(fout);
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw fout;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { inhoud: Buffer.alloc(0), modus: stat.mode, gewoon: false };
    return { inhoud: readFileSync(fd), modus: stat.mode, gewoon: true };
  } finally {
    closeSync(fd);
  }
}

/** @param {string} vol @returns {{ inhoud: Buffer, uitvoerbaar: boolean } | null} */
function leesBestand(vol) {
  const staat = leesZonderSymlink(vol);
  if (staat === null) return null;
  if (!staat.gewoon) throw new Error('geen gewoon bestand');
  return { inhoud: staat.inhoud, uitvoerbaar: (staat.modus & 0o100) !== 0 };
}

/** Inhoud van een gewoon bestand, of null als het ontbreekt. @param {string} vol @returns {Buffer | null} */
const inhoudOfNull = (vol) => leesBestand(vol)?.inhoud ?? null;

/**
 * @template T
 * @param {string} pad @param {() => T} actie @returns {T}
 */
function metPad(pad, actie) {
  try {
    return actie();
  } catch (fout) {
    throw new Error(`${pad}: ${foutcode(fout)}`, { cause: fout });
  }
}

/**
 * Is een bestaande map tussen de root en het pad een symlink? Dan zou schrijven of verwijderen buiten de werkmap kunnen
 * belanden (R-TOOL-03).
 * @param {string} root @param {string} pad @returns {boolean}
 */
function heeftSymlinkVoorouder(root, pad) {
  let map = root;
  for (const deel of pad.split('/').slice(0, -1)) {
    map = path.join(map, deel);
    try {
      if (lstatSync(map).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** @param {string} root @param {string} pad */
function eisGeenSymlinkVoorouder(root, pad) {
  if (heeftSymlinkVoorouder(root, pad)) throw new Error('een map op het pad is een symlink');
}

/** De echte werkmap; schrijven en verwijderen volgen nooit een symlink in een voorouder. @param {string} root @returns {WerkmapIo} */
function werkmapIo(root) {
  return {
    lees: (pad) => metPad(pad, () => leesBestand(path.join(root, pad))),
    schrijf: (pad, inhoud, uitvoerbaar) =>
      metPad(pad, () => {
        eisGeenSymlinkVoorouder(root, pad);
        schrijfWerkmapBestand(path.join(root, pad), { inhoud, uitvoerbaar });
      }),
    verwijder: (pad) =>
      metPad(pad, () => {
        eisGeenSymlinkVoorouder(root, pad);
        verwijderBestand(root, pad);
      }),
  };
}

/** Leest raw-diffuitvoer met `-z`: `:<oud> <nieuw> <oudsha> <nieuwsha> <status>\0<pad>\0`. @param {string} uit @returns {Wijziging[]} */
function leesRaw(uit) {
  const delen = uit.split('\0');
  /** @type {Wijziging[]} */
  const lijst = [];
  for (let i = 0; i + 1 < delen.length; i += 2) {
    const [oudModus = '', nieuwModus = '', , nieuwSha = ''] = (delen[i] ?? '').slice(1).split(' ');
    lijst.push({ pad: delen[i + 1] ?? '', oudModus, nieuwModus, nieuwSha });
  }
  return lijst;
}

/** @param {string} root @param {string[]} args @returns {Wijziging[]} */
const wijzigingen = (root, args) =>
  leesRaw(git(root, [...args.slice(0, 1), '-r', '-z', '--no-renames', '--no-abbrev', ...args.slice(1)]).stdout);

/** @param {string} kop @param {string[]} paden @returns {Melding} */
const lijstMelding = (kop, paden) => new Melding([kop, ...paden]);

/** Controles op de schrijfbare paden van het plan: symlinks of submodules, en ongetrackte bestanden die het doel toevoegt.
 * @param {string} root @param {readonly Wijziging[]} gewoon */
function controleerGewoon(root, gewoon) {
  const bijzonder = gewoon.filter((w) => BIJZONDER.includes(w.oudModus) || BIJZONDER.includes(w.nieuwModus));
  if (bijzonder.length > 0)
    throw lijstMelding(
      '✗ bijhalen geweigerd: symlink of submodule op een gewijzigd pad:',
      bijzonder.map((w) => w.pad),
    );
  const viaSymlink = gewoon.filter((w) => heeftSymlinkVoorouder(root, w.pad));
  if (viaSymlink.length > 0)
    throw lijstMelding(
      '✗ bijhalen geweigerd: een map op het pad is een symlink:',
      viaSymlink.map((w) => w.pad),
    );
  const ongetrackt = gewoon.filter((w) => w.oudModus === GEEN && bestaat(path.join(root, w.pad)));
  if (ongetrackt.length > 0)
    throw lijstMelding(
      '✗ bijhalen geweigerd: ongetrackte bestanden zouden overschreven worden:',
      ongetrackt.map((w) => w.pad),
    );
}

/** @param {string} pad @returns {string} */
const shellPad = (pad) => (/^[\w./@+-]+$/.test(pad) ? pad : `'${pad.replaceAll("'", "'\\''")}'`);

/**
 * Schrijft de nieuwe inhoud van de beschermde paden naar `<os.tmpdir()>/bijhalen/<sha>/` (eerst leeggemaakt) en geeft
 * het blok voor de agent.
 * @param {string} root @param {string} sha @param {readonly Wijziging[]} beschermd @returns {string[]}
 */
function bewaarBeschermd(root, sha, beschermd) {
  const basis = path.join(veiligeTmpBasis(), sha);
  rmSync(basis, { recursive: true, force: true });
  if (beschermd.length === 0) return [];
  const regels = beschermd.map((w) => {
    if (w.nieuwModus === GEEN) return `${w.pad} verwijderen (eigenaar)`;
    const doel = path.join(basis, w.pad);
    schrijfTmpBestand(doel, { inhoud: gitBlob(root, w.nieuwSha), uitvoerbaar: w.nieuwModus === '100755' });
    return `${w.pad} ← ${doel}`;
  });
  const paden = beschermd.map((w) => shellPad(w.pad)).join(' ');
  const kop = `Beschermd, bijwerken met Edit (eigenaarakkoord); daarna moet git diff --quiet -- ${paden} slagen en mag geen verwijderd pad nog bestaan:`;
  return [kop, ...regels];
}

/** @param {string} root @param {Wijziging} w @returns {WerkmapStap} */
const stapVoor = (root, w) => ({
  pad: w.pad,
  inhoud: w.nieuwModus === GEEN ? null : gitBlob(root, w.nieuwSha),
  uitvoerbaar: w.nieuwModus === '100755',
});

/**
 * Voert een plan uit in de vaste volgorde: controles, schrijfbare bestanden, index, refs. Faalt de index of een ref, dan
 * gaan werkmap en index terug naar de toestand van vóór de bestanden. Geeft het blok met beschermde paden.
 * @param {string} root @param {Plan} plan @returns {string[]}
 */
function voerUit(root, plan) {
  const { beschermd } = verdeelPaden(
    plan.wijzigingen.map((w) => w.pad),
    (pad) => schrijfbaar(root, pad),
  );
  const isBeschermd = new Set(beschermd);
  const gewoon = plan.wijzigingen.filter((w) => !isBeschermd.has(w.pad));
  controleerGewoon(root, gewoon);
  const stappen = gewoon.map((w) => stapVoor(root, w));
  const blok = bewaarBeschermd(
    root,
    plan.sha,
    plan.wijzigingen.filter((w) => isBeschermd.has(w.pad)),
  );
  const io = werkmapIo(root);
  const voor = { bestanden: stappen.map((stap) => huidigeStap(io, stap.pad)), index: leesIndex(root) };
  try {
    pasWerkmapToe(stappen, io);
  } catch (fout) {
    throw herstelMelding(`schrijven faalt (${reden(fout)})`, nietHersteld(voor.bestanden, io));
  }
  try {
    git(root, ['read-tree', plan.boom]);
    plan.refs();
  } catch (fout) {
    throw herstelMelding(reden(fout), herstelAlles(plan, voor, io));
  }
  try {
    git(root, ['update-index', '-q', '--refresh'], [1]);
  } catch {
    // Alleen statinformatie; de stappen zijn geslaagd (K1).
  }
  return blok;
}

/** @param {WerkmapIo} io @param {string} pad @returns {WerkmapStap} */
function huidigeStap(io, pad) {
  const staat = io.lees(pad);
  return { pad, inhoud: staat?.inhoud ?? null, uitvoerbaar: staat?.uitvoerbaar ?? false };
}

/** Paden die niet (meer) op hun oude toestand staan. @param {readonly WerkmapStap[]} voor @param {WerkmapIo} io @returns {string[]} */
function nietHersteld(voor, io) {
  return voor
    .filter((oud) => {
      try {
        const nu = huidigeStap(io, oud.pad);
        if (oud.inhoud === null || nu.inhoud === null) return oud.inhoud !== nu.inhoud;
        return !oud.inhoud.equals(nu.inhoud) || oud.uitvoerbaar !== nu.uitvoerbaar;
      } catch {
        return true;
      }
    })
    .map((oud) => oud.pad);
}

/** @param {string} root @returns {{ vol: string, inhoud: Buffer | null }} */
function leesIndex(root) {
  const vol = gitPad(root, 'index');
  return { vol, inhoud: inhoudOfNull(vol) };
}

/** Zet het indexbestand byte voor byte terug als het veranderd is. @param {{ vol: string, inhoud: Buffer | null }} index */
function herstelIndex({ vol, inhoud }) {
  const nu = inhoudOfNull(vol);
  if (inhoud === null || nu === null ? inhoud === nu : inhoud.equals(nu)) return;
  if (inhoud === null) {
    rmSync(vol, { force: true });
    return;
  }
  const tijdelijk = `${vol}.bijhalen-herstel`;
  rmSync(tijdelijk, { force: true });
  writeFileSync(tijdelijk, inhoud, { flag: 'wx' });
  renameSync(tijdelijk, vol);
}

/**
 * Zet refs, werkmap en index terug na een fout in stap 3 of 4; geeft wat niet terug kon.
 * @param {Plan} plan
 * @param {{ bestanden: WerkmapStap[], index: { vol: string, inhoud: Buffer | null } }} voor
 * @param {WerkmapIo} io
 * @returns {string[]}
 */
function herstelAlles(plan, voor, io) {
  /** @type {string[]} */
  const mislukt = [];
  try {
    plan.herstelRefs();
  } catch (fout) {
    mislukt.push(`refs (${reden(fout)})`);
  }
  herstelStil(voor.bestanden, io);
  mislukt.push(...nietHersteld(voor.bestanden, io));
  try {
    herstelIndex(voor.index);
  } catch (fout) {
    mislukt.push(`index (${reden(fout)})`);
  }
  return mislukt;
}

/** @param {string} tekst @param {string[]} mislukt @returns {Melding} */
function herstelMelding(tekst, mislukt) {
  if (mislukt.length === 0) return new Melding([`✗ bijhalen: ${tekst}; alles is teruggezet`]);
  return lijstMelding(`✗ bijhalen: ${tekst}; niet teruggezet:`, mislukt);
}

/**
 * Controles vooraf voor `main` en `volg`: geen lopende merge, HEAD op een branch, schone werkmap en index.
 * @param {string} root @returns {{ branchRef: string, branch: string, head: string }}
 */
function controleerSchoon(root) {
  if (existsSync(gitPad(root, 'MERGE_HEAD')))
    throw geweigerd(
      'er loopt al een merge (MERGE_HEAD); rond die af met git commit -F <bestand> of breek af met bijhalen.mjs terug',
    );
  const ref = git(root, ['symbolic-ref', '-q', 'HEAD'], [1]);
  if (ref.status !== 0) throw geweigerd('HEAD staat niet op een branch');
  const vuil =
    git(root, ['diff', '--quiet'], [1]).status !== 0 ||
    git(root, ['diff', '--cached', '--quiet', 'HEAD'], [1]).status !== 0;
  if (vuil) throw geweigerd('werkmap of index heeft wijzigingen; commit of herstel die eerst');
  const branchRef = ref.stdout.trim();
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  return { branchRef, branch: branchRef.replace(/^refs\/heads\//, ''), head };
}

/**
 * De samengevoegde boom van HEAD en het doel via `git merge-tree --write-tree -z --name-only`.
 * @param {string} root @param {string} head @param {string} doel @returns {string}
 */
function mergeBoom(root, head, doel) {
  const args = ['merge-tree', '--write-tree', '-z', '--name-only', head, doel];
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: omgevingZonderGit(), maxBuffer: MAX_BUFFER });
  const delen = (r.stdout ?? '').split('\0');
  if (r.status === 0) return delen[0] ?? '';
  if (r.status === 1) {
    const eind = delen.indexOf('', 1);
    const paden = [...new Set(delen.slice(1, eind < 0 ? undefined : eind))];
    throw lijstMelding(`✗ bijhalen: conflict in ${String(paden.length)} bestand(en); er is niets veranderd:`, paden);
  }
  const tekst = (r.error?.message ?? r.stderr ?? '').trim().replace(/\s+/g, ' ');
  throw new Melding([`✗ bijhalen: git merge-tree faalt: ${tekst}; er is niets veranderd`]);
}

/** @param {string} root @param {string} doel @param {string} branch @returns {Pick<Plan, 'refs' | 'herstelRefs'>} */
function mergeRefs(root, doel, branch) {
  const mergeHead = gitPad(root, 'MERGE_HEAD');
  const mergeMsg = gitPad(root, 'MERGE_MSG');
  const geraakt = { head: false, msg: false };
  /** @type {Buffer | null} */
  let oudMsg = null;
  return {
    refs: () => {
      // Eén fd zonder symlink te volgen; een symlink of iets anders dan een gewoon bestand is een fout.
      oudMsg = metPad('MERGE_MSG', () => inhoudOfNull(mergeMsg));
      // `wx`: een MERGE_HEAD die er al was (ook een symlink) wordt nooit overschreven.
      metPad('MERGE_HEAD', () => writeFileSync(mergeHead, `${doel}\n`, { flag: 'wx' }));
      geraakt.head = true;
      geraakt.msg = true;
      const bericht = Buffer.from(`Merge remote-tracking branch 'origin/main' into ${branch}\n`);
      metPad('MERGE_MSG', () => schrijfWerkmapBestand(mergeMsg, { inhoud: bericht, uitvoerbaar: false }));
    },
    herstelRefs: () => {
      if (geraakt.head) rmSync(mergeHead, { force: true });
      if (!geraakt.msg) return;
      if (oudMsg === null) rmSync(mergeMsg, { force: true });
      else schrijfWerkmapBestand(mergeMsg, { inhoud: oudMsg, uitvoerbaar: false });
    },
  };
}

/** @param {string} root @returns {string[]} */
function standMain(root) {
  const { branch, head } = controleerSchoon(root);
  const doel = commitVan(root, 'refs/remotes/origin/main');
  if (doel === null) throw geweigerd('origin/main is geen commit');
  if (doel === head || isVoorouder(root, doel, head)) return ['✓ niets bij te halen'];
  if (isVoorouder(root, head, doel))
    throw geweigerd('HEAD loopt alleen achter op origin/main; gebruik bijhalen.mjs volg origin/main');
  const boom = mergeBoom(root, head, doel);
  const plan = {
    sha: doel,
    boom,
    wijzigingen: wijzigingen(root, ['diff-tree', head, boom]),
    ...mergeRefs(root, doel, branch),
  };
  const blok = voerUit(root, plan);
  return [
    `✓ merge staat in de index (MERGE_HEAD ${doel}); werk de beschermde bestanden bij en rond af met git commit -F <bestand>`,
    ...blok,
  ];
}

/** @param {string} root @param {string} ref @returns {string[]} */
function standVolg(root, ref) {
  const { branchRef, branch, head } = controleerSchoon(root);
  const doel = commitVan(root, ref);
  if (doel === null) throw geweigerd(`${ref} is geen commit`);
  if (doel === head) return ['✓ niets bij te halen'];
  if (!isVoorouder(root, head, doel)) throw geweigerd(`${ref} is geen opvolger van HEAD; gebruik bijhalen.mjs main`);
  const plan = {
    sha: doel,
    boom: doel,
    wijzigingen: wijzigingen(root, ['diff-tree', head, doel]),
    refs: () => void git(root, ['update-ref', '-m', `bijhalen: volg ${ref}`, branchRef, doel, head]),
    herstelRefs: () => undefined,
  };
  const blok = voerUit(root, plan);
  return [`✓ ${branch} staat op ${doel}`, ...blok];
}

/** @param {string} root @returns {Pick<Plan, 'refs' | 'herstelRefs'>} */
function terugRefs(root) {
  const bewaard = ['MERGE_HEAD', 'MERGE_MSG', 'MERGE_MODE'].map((naam) => {
    const vol = gitPad(root, naam);
    return { vol, inhoud: metPad(naam, () => inhoudOfNull(vol)) };
  });
  return {
    refs: () => {
      for (const { vol } of bewaard) rmSync(vol, { force: true });
    },
    herstelRefs: () => {
      // De bestanden zijn net verwijderd; `wx` volgt nooit een symlink die er intussen is neergezet.
      for (const { vol, inhoud } of bewaard) if (inhoud !== null) writeFileSync(vol, inhoud, { flag: 'wx' });
    },
  };
}

/** @param {string} uit @returns {string[]} */
const nulPaden = (uit) => uit.split('\0').filter((pad) => pad !== '');

/** @param {string} root @returns {string[]} */
function standTerug(root) {
  if (!existsSync(gitPad(root, 'MERGE_HEAD'))) throw geweigerd('er loopt geen merge; niets terug te zetten');
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  // Eigen werk na `main`: de werkmap wijkt af van de index, of de index van de boom die `main` erin zette.
  const boom = mergeBoom(root, head, git(root, ['rev-parse', 'MERGE_HEAD']).stdout.trim());
  const afwijkend = new Set([
    ...nulPaden(git(root, ['diff', '--name-only', '-z']).stdout),
    ...nulPaden(git(root, ['diff-index', '--cached', '--name-only', '-z', boom]).stdout),
  ]);
  const { schrijven } = verdeelPaden([...afwijkend], (pad) => schrijfbaar(root, pad));
  if (schrijven.length > 0)
    throw lijstMelding(
      '✗ bijhalen geweigerd: deze bestanden zijn na bijhalen gewijzigd; commit, herstel of bewaar ze eerst:',
      schrijven,
    );
  // -R: van de index naar HEAD, zodat de nieuwe kant HEAD is.
  const plan = {
    sha: head,
    boom: head,
    wijzigingen: wijzigingen(root, ['diff-index', '--cached', '-R', head]),
    ...terugRefs(root),
  };
  const blok = voerUit(root, plan);
  return ['✓ merge afgebroken; index en schrijfbare bestanden staan weer op HEAD', ...blok];
}

/** @param {string} root @param {BijhalenStand} stand @returns {string[]} */
function voerStandUit(root, stand) {
  switch (stand.stand) {
    case 'main':
      return standMain(root);
    case 'volg':
      return standVolg(root, stand.ref);
    case 'terug':
      return standTerug(root);
  }
}

/** @returns {number} */
function uitvoeren() {
  /** @type {BijhalenStand} */
  let stand;
  try {
    stand = bijhalenArgumenten(process.argv.slice(2));
  } catch {
    console.error(GEBRUIK);
    return 1;
  }
  try {
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).stdout.trim();
    console.log(voerStandUit(root, stand).join('\n'));
    return 0;
  } catch (fout) {
    console.error(fout instanceof Melding ? fout.regels.join('\n') : `✗ bijhalen: ${reden(fout)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = uitvoeren();
