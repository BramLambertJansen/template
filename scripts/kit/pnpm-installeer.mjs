// Eén installatiepad voor pnpm (spec pnpm-sandbox-installatie): de enige plek die pnpm voor een installatie start.
// `worktree-install.mjs` (modus `werkmap`), `cloud-setup.sh` en `bootstrap.sh` (modus `setup`) roepen deze module aan; deze
// module importeert worktree-install.mjs nooit. Getoetst in de strenge kooi (test/scripts/pnpm-installeer.test.ts), zodat
// een nieuwe pnpm die buiten de werkmap schrijft in gate:fast opvalt. Zonder dependencies, zodat het op een kale Node draait.
import { spawn } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { constants, tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Codes in de uitvoer van pnpm die op een netwerkprobleem wijzen (spec pnpm-sandbox-installatie, "Meldingen").
const NETWERKFOUT = /ERR_PNPM_FETCH_|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/;
// Zoveel tekens van het einde van stdout en stderr bewaart `installeer` om de fout in te delen.
const STAART = 64 * 1024;
const GEBRUIK = 'gebruik: node scripts/kit/pnpm-installeer.mjs --modus werkmap|setup [--cloud]';

/**
 * @typedef {'werkmap' | 'setup'} InstallModus
 * @typedef {{ modus: InstallModus, cloud?: boolean }} InstallOpties
 * @typedef {{ command: 'pnpm', args: string[], env: Record<string, string> }} InstallCommando
 */

/**
 * Pure kern: het pnpm-commando met alle schrijfbare mappen onder `basis` (pnpm-sandbox/AC-4).
 * - `werkmap`: store (`--store-dir`) en cache (`--cache-dir`) als vlag, data, cache, state en runtime via XDG onder `basis`.
 *   Gemeten met pnpm 11.28.2 en 11.28.5: `pnpm install` accepteert `--cache-dir` (niet in `pnpm help install`) en
 *   `--state-dir` geeft `Unknown option`. Een CLI-vlag gaat voor op een globale pnpm-config en een XDG-variabele niet;
 *   state heeft geen vlag en loopt via XDG_STATE_HOME.
 * - `setup`: de gewone store, cache en state (spec OV-1); alleen de store-vergrendeling onder `basis`.
 * - In beide: pnpm 12 neemt bij `install` een store-vergrendeling in `$XDG_RUNTIME_DIR/pnpm-store-operation-locks-<uid>`, en
 *   zonder die variabele hard in `/tmp` (ADR 0110, pnpm#16390). `installeer` maakt de map vooraf aan (gemeten met 12.21.0).
 * - `cloud`: `--config.confirm-modules-purge=false` als laatste argument, zodat pnpm zonder TTY een bestaande node_modules
 *   vervangt in plaats van af te breken (spec cloud-werkmap-herstel AC-3).
 * @param {string} basis
 * @param {InstallOpties} opties
 * @returns {InstallCommando}
 */
export function pnpmInstallCommando(basis, { modus, cloud = false }) {
  const purge = cloud ? ['--config.confirm-modules-purge=false'] : [];
  const runtime = path.join(basis, 'xdg-run');
  if (modus === 'setup')
    return { command: 'pnpm', args: ['install', '--frozen-lockfile', ...purge], env: { XDG_RUNTIME_DIR: runtime } };
  return {
    command: 'pnpm',
    args: [
      'install',
      '--frozen-lockfile',
      '--package-import-method=copy',
      `--store-dir=${path.join(basis, 'store')}`,
      `--cache-dir=${path.join(basis, 'cache')}`,
      ...purge,
    ],
    env: {
      XDG_DATA_HOME: path.join(basis, 'data'),
      XDG_CACHE_HOME: path.join(basis, 'xdg-cache'),
      XDG_STATE_HOME: path.join(basis, 'xdg-state'),
      XDG_RUNTIME_DIR: runtime,
    },
  };
}

/** @param {string} pad */
function lstatOfNull(pad) {
  try {
    return lstatSync(pad);
  } catch {
    return null;
  }
}

/** Fout bij het aanmaken van de basismap: `map` en `reden` komen letterlijk in de melding. */
class BasismapFout extends Error {
  /** @param {string} map @param {string} reden */
  constructor(map, reden) {
    super(`${map} niet aan te maken (${reden})`);
  }
}

/** @param {unknown} fout @returns {string} de reden zonder het pad dat de melding al noemt */
function reden(fout) {
  if (!(fout instanceof Error)) return String(fout);
  return fout.message.split(',')[0] ?? fout.message;
}

/**
 * Eigen basismap onder os.tmpdir() voor modus `werkmap`, alleen voor deze gebruiker en hergebruikt tussen installaties (de
 * store blijft staan): aangemaakt met mode 0700 en bij hergebruik gecontroleerd (echte map, geen symlink, eigen uid, niet
 * voor anderen toegankelijk), zodat niemand de store kan voorbereiden.
 * @returns {string}
 */
export function veiligeBasismap() {
  const uid = process.getuid?.();
  const basis = path.join(tmpdir(), `pnpm-worktree-${uid ?? 'gebruiker'}`);
  try {
    mkdirSync(basis, { recursive: true, mode: 0o700 });
  } catch (fout) {
    throw new BasismapFout(basis, reden(fout));
  }
  const stat = lstatOfNull(basis);
  if (stat === null || !stat.isDirectory()) throw new BasismapFout(basis, 'geen gewone map');
  if (uid !== undefined && stat.uid !== uid) throw new BasismapFout(basis, 'van een andere gebruiker');
  if ((stat.mode & 0o077) !== 0) throw new BasismapFout(basis, 'toegankelijk voor anderen, verwacht mode 0700');
  return basis;
}

/**
 * De basismap per modus, met de opruimactie: `werkmap` hergebruikt `veiligeBasismap()`, `setup` krijgt een nieuwe
 * `mkdtemp` onder os.tmpdir() die na afloop weg gaat (alleen de vergrendeling staat erin).
 * @param {InstallModus} modus
 * @returns {{ basis: string, opruimen: () => void }}
 */
function basismap(modus) {
  if (modus === 'werkmap') return { basis: veiligeBasismap(), opruimen: () => undefined };
  const voorvoegsel = path.join(tmpdir(), 'pnpm-setup-');
  try {
    const basis = mkdtempSync(voorvoegsel);
    return { basis, opruimen: () => rmSync(basis, { recursive: true, force: true }) };
  } catch (fout) {
    throw new BasismapFout(voorvoegsel, reden(fout));
  }
}

/**
 * De omgeving van de aanroeper zonder de variabelen die `uit` noemt.
 * @param {RegExp} uit
 * @returns {Record<string, string>}
 */
export function omgevingZonder(uit) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [naam, waarde] of Object.entries(process.env))
    if (waarde !== undefined && !uit.test(naam)) env[naam] = waarde;
  return env;
}

/**
 * Waarde van een omgevingsvariabele van de aanroeper, alleen als die een absoluut pad is; leeg of relatief telt als niet gezet.
 * @param {string} naam
 * @returns {string | undefined}
 */
function absoluut(naam) {
  const waarde = process.env[naam];
  return waarde !== undefined && path.isAbsolute(waarde) ? waarde : undefined;
}

/**
 * mise bewaart zijn installaties onder een data- en state-map. XDG_* kan naar de basismap wijzen, dus houdt mise zijn
 * eigen mappen vast: de waarde van de aanroeper, anders afgeleid van de oorspronkelijke XDG_*-variabele, anders onder $HOME.
 * @returns {Record<string, string>}
 */
export function miseMappen() {
  const thuis = absoluut('HOME') ?? userInfo().homedir;
  return {
    MISE_DATA_DIR:
      absoluut('MISE_DATA_DIR') ?? path.join(absoluut('XDG_DATA_HOME') ?? path.join(thuis, '.local/share'), 'mise'),
    MISE_STATE_DIR:
      absoluut('MISE_STATE_DIR') ?? path.join(absoluut('XDG_STATE_HOME') ?? path.join(thuis, '.local/state'), 'mise'),
  };
}

/**
 * De omgeving voor pnpm zonder NODE_OPTIONS en de variabelen npm_config_ en pnpm_config_ van de aanroeper (die kunnen
 * store, registry of scripts omleiden of code voorladen). `extra` gaat voor, ook op een bestaande XDG_RUNTIME_DIR.
 * @param {Record<string, string>} extra
 * @returns {Record<string, string>}
 */
export function pnpmOmgeving(extra) {
  return { ...omgevingZonder(/^((npm|pnpm)_config_|NODE_OPTIONS$)/i), ...miseMappen(), ...extra };
}

/**
 * De meldingsregels na een mislukte installatie (spec pnpm-sandbox-installatie, "Meldingen", letterlijk).
 * @param {number} status
 * @param {string} uitvoer de staart van stdout en stderr van pnpm
 * @param {boolean} cloud
 * @returns {string[]}
 */
export function foutmelding(status, uitvoer, cloud) {
  const kop = `✗ pnpm install mislukt (exit ${String(status)}):`;
  if (!NETWERKFOUT.test(uitvoer)) return [`${kop} zie de pnpm-fout hierboven → docs/ENVIRONMENT.md, Problemen.`];
  const regels = [`${kop} waarschijnlijk geen netwerk → docs/ENVIRONMENT.md, Problemen.`];
  if (cloud)
    regels.push('  → staat netwerktoegang van de omgeving op Trusted (claude.ai/code)? Is de proxy bereikbaar?');
  return regels;
}

/**
 * De stdio voor pnpm: met een terminal erft pnpm hem (voortgangsbalk en kleur), anders lopen stdout en stderr via de module,
 * die ze doorstuurt en de staart bewaart om de fout in te delen (pnpm-sandbox/AC-8).
 * @param {boolean} terminal
 * @returns {['inherit', 'inherit' | 'pipe', 'inherit' | 'pipe']}
 */
export function stdioVoor(terminal) {
  return terminal ? ['inherit', 'inherit', 'inherit'] : ['inherit', 'pipe', 'pipe'];
}

/** Signalen die de module tijdens de run vangt en aan pnpm doorgeeft (spec pnpm-sandbox-installatie, "Signalen"). */
/** @type {NodeJS.Signals[]} */
const DOORGEGEVEN = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Vangt SIGINT, SIGTERM en SIGHUP zolang pnpm draait en stuurt ze door naar `kind`; `stop()` haalt de handlers weg en
 * geeft het eerst gevangen signaal terug (of null).
 * @param {import('node:child_process').ChildProcess} kind
 * @returns {{ stop: () => NodeJS.Signals | null }}
 */
function stuurSignalenDoor(kind) {
  /** @type {NodeJS.Signals | null} */
  let gevangen = null;
  /** @param {NodeJS.Signals} sig */
  const handler = (sig) => {
    gevangen ??= sig;
    kind.kill(sig);
  };
  for (const sig of DOORGEGEVEN) process.on(sig, handler);
  return {
    stop: () => {
      for (const sig of DOORGEGEVEN) process.off(sig, handler);
      return gevangen;
    },
  };
}

/**
 * @typedef {{ status: number, uitvoer: string } | { signaal: NodeJS.Signals } | { fout: Error }} PnpmUitslag
 */

/**
 * Start pnpm in `process.cwd()`. Zonder terminal stuurt de module stdout en stderr meteen door en bewaart van beide de staart;
 * met een terminal erft pnpm hem en blijft de staart leeg. Stopt pnpm door een signaal, of ving de module er een, dan is
 * de uitslag dat signaal.
 * @param {InstallCommando} commando
 * @returns {Promise<PnpmUitslag>}
 */
function draaiPnpm({ command, args, env }) {
  return new Promise((klaar) => {
    const kind = spawn(command, args, {
      cwd: process.cwd(),
      stdio: stdioVoor(process.stdout.isTTY === true),
      env: pnpmOmgeving(env),
    });
    const signalen = stuurSignalenDoor(kind);
    let staart = '';
    /** @param {NodeJS.WriteStream} doel @returns {(stuk: Buffer) => void} */
    const door = (doel) => (stuk) => {
      doel.write(stuk);
      staart = (staart + stuk.toString('utf8')).slice(-STAART);
    };
    kind.stdout?.on('data', door(process.stdout));
    kind.stderr?.on('data', door(process.stderr));
    kind.on('error', (fout) => {
      signalen.stop();
      klaar({ fout });
    });
    kind.on('close', (status, sig) => {
      const signaal = signalen.stop() ?? sig;
      klaar(signaal === null ? { status: status ?? 1, uitvoer: staart } : { signaal });
    });
  });
}

/**
 * De exitcode voor een signaal: 128 plus het signaalnummer (spec pnpm-sandbox-installatie, "Meldingen").
 * @param {NodeJS.Signals} signaal
 * @returns {number}
 */
export function signaalExitcode(signaal) {
  return 128 + (constants.signals[signaal] ?? 0);
}

/**
 * Installeert met pnpm in `process.cwd()` en geeft de exitcode van pnpm terug; 1 als de basismap niet aan te maken is of
 * pnpm niet start (dan is pnpm niet gestart); 128 plus het signaalnummer als pnpm of de module een signaal kreeg. De enige plek die pnpm voor een installatie start (pnpm-sandbox/AC-5).
 * @param {InstallOpties} opties
 * @returns {Promise<number>}
 */
export async function installeer({ modus, cloud = false }) {
  let map;
  try {
    map = basismap(modus);
  } catch (fout) {
    console.error(`✗ pnpm-installeer: ${fout instanceof Error ? fout.message : String(fout)}; controleer TMPDIR`);
    return 1;
  }
  try {
    const commando = pnpmInstallCommando(map.basis, { modus, cloud });
    const runtime = commando.env['XDG_RUNTIME_DIR'] ?? path.join(map.basis, 'xdg-run');
    try {
      // pnpm maakt XDG_RUNTIME_DIR niet zelf aan en valt dan terug op /tmp; 0700 zoals een echte runtime-map.
      mkdirSync(runtime, { recursive: true, mode: 0o700 });
    } catch (fout) {
      console.error(`✗ pnpm-installeer: ${runtime} niet aan te maken (${reden(fout)}); controleer TMPDIR`);
      return 1;
    }
    const r = await draaiPnpm(commando);
    if ('fout' in r) {
      console.error(`✗ pnpm-installeer: pnpm ontbreekt of start niet (${r.fout.message}); zie scripts/bootstrap.sh`);
      return 1;
    }
    if ('signaal' in r) {
      console.error(`✗ pnpm install gestopt door ${r.signaal}`);
      return signaalExitcode(r.signaal);
    }
    if (r.status !== 0) for (const regel of foutmelding(r.status, r.uitvoer, cloud)) console.error(regel);
    return r.status;
  } finally {
    map.opruimen();
  }
}

/**
 * De opties uit de argumenten van de CLI, of null bij een ongeldige aanroep.
 * @param {string[]} argv
 * @returns {InstallOpties | null}
 */
export function leesArgumenten(argv) {
  const [vlag, modus, ...rest] = argv;
  if (vlag !== '--modus' || (modus !== 'werkmap' && modus !== 'setup')) return null;
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== '--cloud')) return null;
  return { modus, cloud: rest[0] === '--cloud' };
}

/**
 * CLI: `--modus werkmap|setup [--cloud]`.
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  const opties = leesArgumenten(argv);
  if (opties === null) {
    console.error(GEBRUIK);
    return 2;
  }
  return installeer(opties);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
