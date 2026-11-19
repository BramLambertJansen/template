// De deterministische setupstappen van docs/nieuwe-app.md als script (spec docs/template/specs/nieuwe-app-script.md):
// `node scripts/kit/nieuwe-app.mjs <preflight|koppel|poorten|db-bewijs> [opties] [--dry-run]`. Per stap ✓, · of ✗ met herstel,
// en een resultaatbestand `.template/nieuwe-app-<deelcommando>.json` aan de git-root (buiten een repo: ~/setup/.template/).
// Exit 0 als elke stap ok of overgeslagen is, 1 bij een fout, 2 bij verkeerd gebruik (dan geen resultaatbestand).
// Alleen `node:`-modules, zodat het bestand ook los in ~/setup werkt, vóór de clone. Het start nooit een container, een
// pakketbeheerder of een rootcommando en pusht niet; andere programma's alleen met een argumentlijst, zonder shell.
// `repo-instellingen` is bouwstap 2 en bestaat hier nog niet. scripts/dev.mjs importeert `isVrij`: één vrij-regel.
// Getest in test/scripts/nieuwe-app*.test.ts en test/scripts/dev.test.ts.
import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, networkInterfaces, release, type } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const GEBRUIK =
  'Gebruik: node scripts/kit/nieuwe-app.mjs <preflight|koppel|poorten|repo-instellingen|db-bewijs> [opties] [--dry-run]';
// Gelijk aan scripts/kit/app-init.mjs (gekopieerd, niet geïmporteerd: dit bestand werkt los; een test houdt ze gelijk).
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 50;
const MIN_INOTIFY = 524288;

export const STANDAARD_POORTEN = Object.freeze({ pg: 54322, mailUi: 54324, smtp: 54325, api: 8787, web: 5173 });

/** De sleutels die `poorten --env` in de kopie van `.env.example` wijzigt (spec, werking 6). */
export const ENV_SLEUTELS = Object.freeze([
  'PG_PORT',
  'MAIL_UI_PORT',
  'SMTP_PORT',
  'API_PORT',
  'WEB_PORT',
  'DATABASE_URL',
  'AUTH_DATABASE_URL',
  'MIGRATOR_DATABASE_URL',
  'SMTP_URL',
  'APP_ORIGIN',
  'AUTH_BASE_URL',
]);

/** Bij welke poort de poort in een URL-sleutel hoort. @type {ReadonlyMap<string, 'pg' | 'smtp' | 'web'>} */
const URL_BIJ = new Map([
  ['DATABASE_URL', 'pg'],
  ['AUTH_DATABASE_URL', 'pg'],
  ['MIGRATOR_DATABASE_URL', 'pg'],
  ['SMTP_URL', 'smtp'],
  ['APP_ORIGIN', 'web'],
  ['AUTH_BASE_URL', 'web'],
]);
// Alles tot en met de dubbele punt vóór de poort (protocol, gebruiker, wachtwoord, host), dan de poort.
const URL_POORT = /^([a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?[^:/?#]*:)(\d+)/i;

/**
 * @typedef {{ pg: number, mailUi: number, smtp: number, api: number, web: number, origin: string }} Poortenset
 * @typedef {(poort: number, host: string) => Promise<boolean>} Bind true: listen lukte (en is weer losgelaten)
 * @typedef {{ bind?: Bind, ipv6?: boolean }} VrijOpties
 * @typedef {{ id: string, status: 'ok' | 'fout' | 'overgeslagen', melding: string, herstel: string | null }} Stap
 * @typedef {{ ok: boolean, stdout: string, stderr: string }} Uitvoer
 * @typedef {(...args: string[]) => Uitvoer} Programma
 * @typedef {{ cwd: string, gitRoot: string | null, root: string, map: string, waarden: Record<string, unknown> }} Context
 */

// --- hulpjes --------------------------------------------------------------------------------------------------------------

/** @param {unknown} waarde @param {string} naam @returns {unknown} */
function veld(waarde, naam) {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([sleutel]) => sleutel === naam)?.[1];
}

/** @param {unknown} fout @param {string} naam */
function tekstVeld(fout, naam) {
  const waarde = veld(fout, naam);
  return typeof waarde === 'string' ? waarde : '';
}

/**
 * Start een programma met een argumentlijst, zonder shell en zonder invoer.
 * @param {string} commando @param {readonly string[]} args @param {string} cwd
 * @returns {Uitvoer}
 */
function voer(commando, args, cwd) {
  try {
    const stdout = execFileSync(commando, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (fout) {
    const stderr = tekstVeld(fout, 'stderr') || (fout instanceof Error ? fout.message : String(fout));
    return { ok: false, stdout: tekstVeld(fout, 'stdout'), stderr };
  }
}

/** @param {string} tekst */
function eersteRegel(tekst) {
  return tekst.trim().split('\n')[0] ?? '';
}

/** @param {string} bestand @returns {string | null} null: niet leesbaar */
function leesTekst(bestand) {
  try {
    return readFileSync(bestand, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} bestand @returns {unknown} */
function leesJson(bestand) {
  const tekst = leesTekst(bestand);
  if (tekst === null) return undefined;
  try {
    return JSON.parse(tekst);
  } catch {
    return undefined;
  }
}

/** `template.repository` uit `.claude/gates.json` van de repo, of undefined. @param {string | null} gitRoot */
function templateRepo(gitRoot) {
  if (gitRoot === null) return undefined;
  const repo = veld(veld(leesJson(path.join(gitRoot, '.claude/gates.json')), 'template'), 'repository');
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : undefined;
}

/** De sha van HEAD, of null buiten een repo of zonder commit. @param {string | null} gitRoot @returns {string | null} */
function huidigeHead(gitRoot) {
  if (gitRoot === null) return null;
  const head = voer('git', ['rev-parse', 'HEAD'], gitRoot);
  return head.ok ? head.stdout.trim() : null;
}

/** @param {Record<string, unknown>} waarden @param {string} naam */
function tekstOptie(waarden, naam) {
  const waarde = waarden[naam];
  return typeof waarde === 'string' ? waarde : undefined;
}

// --- uitvoer per stap en het resultaatbestand ------------------------------------------------------------------------------

class Verloop {
  /** @param {string} commando @param {boolean} dryRun */
  constructor(commando, dryRun) {
    this.commando = commando;
    this.dryRun = dryRun;
    /** @type {Stap[]} */
    this.stappen = [];
    /** @type {Record<string, unknown>} */
    this.gegevens = {};
  }

  /** @param {Stap} stap @param {boolean} schrijvend */
  meld(stap, schrijvend) {
    const voor = this.dryRun && schrijvend ? '(dry-run) ' : '';
    const teken = stap.status === 'ok' ? '✓' : stap.status === 'fout' ? '✗' : '·';
    const staart = stap.status === 'overgeslagen' ? ' (overgeslagen)' : '';
    process.stdout.write(`${voor}${teken} ${stap.melding}${staart}\n`);
    if (stap.herstel !== null) process.stdout.write(`${voor}  → ${stap.herstel}\n`);
    this.stappen.push(stap);
  }

  /** @param {string} id @param {string} melding @param {boolean} [schrijvend] een stap die (zonder --dry-run) schrijft */
  ok(id, melding, schrijvend = false) {
    this.meld({ id, status: 'ok', melding, herstel: null }, schrijvend);
    return true;
  }

  /** @param {string} id @param {string} melding */
  sla(id, melding) {
    this.meld({ id, status: 'overgeslagen', melding, herstel: null }, false);
    return true;
  }

  /** @param {string} id @param {string} melding @param {string} herstel */
  fout(id, melding, herstel) {
    this.meld({ id, status: 'fout', melding, herstel }, false);
    return false;
  }

  /** Schrijft het resultaatbestand en de slotregel; geeft de exitcode. @param {string} bestand @param {string | null} gitRoot */
  sluit(bestand, gitRoot) {
    const fouten = this.stappen.filter((stap) => stap.status === 'fout').length;
    const resultaat = {
      schema: 1,
      commando: this.commando,
      tijd: new Date().toISOString(),
      head: huidigeHead(gitRoot),
      dryRun: this.dryRun,
      uitslag: fouten === 0 ? 'ok' : 'fout',
      stappen: this.stappen,
      gegevens: this.gegevens,
    };
    mkdirSync(path.dirname(bestand), { recursive: true });
    writeFileSync(bestand, `${JSON.stringify(resultaat, null, 2)}\n`);
    const naam = `nieuwe-app-${this.commando}.json`;
    const waar = gitRoot === null ? `~/setup/.template/${naam}` : `.template/${naam}`;
    const slot =
      fouten === 0
        ? `nieuwe-app ${this.commando}: ok (${String(this.stappen.length)} stappen)`
        : `✗ nieuwe-app ${this.commando}: ${String(fouten)} fout(en)`;
    process.stdout.write(`${slot} → ${waar}\n`);
    return fouten === 0 ? 0 : 1;
  }
}

// --- poorten: de vrij-regel, de keuze en .env.local ------------------------------------------------------------------------

/** @type {Bind} */
function echteBind(poort, host) {
  return new Promise((klaar) => {
    const server = createServer();
    server.once('error', () => {
      klaar(false);
    });
    server.listen({ port: poort, host, exclusive: true }, () => {
      server.close(() => {
        klaar(true);
      });
    });
  });
}

function heeftIpv6() {
  return Object.values(networkInterfaces()).some((lijst) => (lijst ?? []).some((adres) => adres.address === '::1'));
}

/**
 * Vrij is: listen lukt op 127.0.0.1 en 0.0.0.0, en als de machine IPv6 heeft ook op ::1 en :: (Vite bindt op localhost,
 * vaak ::1).
 * @param {number} poort @param {VrijOpties} [opties]
 */
export async function isVrij(poort, opties = {}) {
  const bind = opties.bind ?? echteBind;
  const hosts = ['127.0.0.1', '0.0.0.0', ...((opties.ipv6 ?? heeftIpv6()) ? ['::1', '::'] : [])];
  for (const host of hosts) if (!(await bind(poort, host))) return false;
  return true;
}

/** @param {number} plus @returns {Poortenset} */
function poortenset(plus) {
  const p = STANDAARD_POORTEN;
  const web = p.web + plus;
  return {
    pg: p.pg + plus,
    mailUi: p.mailUi + plus,
    smtp: p.smtp + plus,
    api: p.api + plus,
    web,
    origin: `http://localhost:${String(web)}`,
  };
}

/** @param {Poortenset} set */
function vijf(set) {
  return [set.pg, set.mailUi, set.smtp, set.api, set.web];
}

/** De bezette poorten van een set. @param {Poortenset} set @param {VrijOpties} opties */
async function bezette(set, opties) {
  const bezet = [];
  for (const poort of vijf(set)) if (!(await isVrij(poort, opties))) bezet.push(poort);
  return bezet;
}

/**
 * De eerste k in 0..9 waarvoor alle vijf poorten basis + 10·k vrij zijn; anders null.
 * @param {VrijOpties} [opties] @returns {Promise<Poortenset | null>}
 */
export async function kiesPoortenset(opties = {}) {
  for (let k = 0; k < 10; k++) {
    const set = poortenset(10 * k);
    if ((await bezette(set, opties)).length === 0) return set;
  }
  return null;
}

/**
 * De kopie van `.env.example` voor een poortenset: alleen de regels van ENV_SLEUTELS wijzigen; URL's houden protocol,
 * host, gebruiker, wachtwoord en pad.
 * @param {string} voorbeeld @param {Poortenset} poorten
 */
export function maakEnvLocal(voorbeeld, poorten) {
  const vast = new Map([
    ['PG_PORT', String(poorten.pg)],
    ['MAIL_UI_PORT', String(poorten.mailUi)],
    ['SMTP_PORT', String(poorten.smtp)],
    ['API_PORT', String(poorten.api)],
    ['WEB_PORT', String(poorten.web)],
    ['APP_ORIGIN', poorten.origin],
    ['AUTH_BASE_URL', poorten.origin],
  ]);
  return voorbeeld
    .split('\n')
    .map((regel) => {
      const is = regel.indexOf('=');
      const sleutel = is < 1 ? '' : regel.slice(0, is);
      const waarde = vast.get(sleutel);
      if (waarde !== undefined) return `${sleutel}=${waarde}`;
      const soort = URL_BIJ.get(sleutel);
      if (soort === undefined) return regel;
      return `${sleutel}=${metPoort(regel.slice(is + 1), poorten[soort])}`;
    })
    .join('\n');
}

/** @param {string} url @param {number} poort */
function metPoort(url, poort) {
  return url.replace(URL_POORT, (_alles, /** @type {string} */ voor) => `${voor}${String(poort)}`);
}

/** De laatste waarde van een sleutel, zoals een env-bestand telt. @param {string} tekst @param {string} sleutel */
function envWaarde(tekst, sleutel) {
  let waarde;
  for (const regel of tekst.split('\n'))
    if (regel.startsWith(`${sleutel}=`)) waarde = regel.slice(sleutel.length + 1).trim();
  return waarde;
}

/** Een poortsleutel, zoals `port()` in scripts/doctor.sh: alleen een regel met cijfers telt. @param {string} tekst @param {string} sleutel */
function envPoort(tekst, sleutel) {
  let poort;
  for (const regel of tekst.split('\n')) {
    const m = regel.startsWith(`${sleutel}=`) ? /^[0-9]+$/.exec(regel.slice(sleutel.length + 1).trim()) : null;
    if (m !== null) poort = Number(m[0]);
  }
  return poort;
}

/** @param {string | undefined} url */
function urlPoort(url) {
  const m = url === undefined ? null : URL_POORT.exec(url);
  return m === null ? undefined : Number(m[2]);
}

/**
 * De poorten uit een bestaande `.env.local`. Een ontbrekende API_PORT of WEB_PORT krijgt de standaardwaarde; een ontbrekende
 * of onleesbare PG_PORT, MAIL_UI_PORT of SMTP_PORT staat in `ontbreekt` (geen terugval: de sandbox kan het bestand maskeren).
 * @param {string | null} tekst
 * @returns {{ ontbreekt: string[] } | { ontbreekt: [], set: Poortenset, kloptNiet: string[] }}
 */
function leesEnvLocal(tekst) {
  const verplicht = ['PG_PORT', 'MAIL_UI_PORT', 'SMTP_PORT'];
  const inhoud = tekst ?? '';
  const [pg, mailUi, smtp] = verplicht.map((sleutel) => envPoort(inhoud, sleutel));
  if (pg === undefined || mailUi === undefined || smtp === undefined)
    return { ontbreekt: verplicht.filter((sleutel) => envPoort(inhoud, sleutel) === undefined) };
  const api = envPoort(inhoud, 'API_PORT') ?? STANDAARD_POORTEN.api;
  const web = envPoort(inhoud, 'WEB_PORT') ?? STANDAARD_POORTEN.web;
  const set = { pg, mailUi, smtp, api, web, origin: `http://localhost:${String(web)}` };
  // Een URL-sleutel die er niet is, kan niet afwijken; een URL zonder poort of met een andere poort wel.
  const kloptNiet = [...URL_BIJ].flatMap(([sleutel, soort]) => {
    const waarde = envWaarde(inhoud, sleutel);
    return waarde === undefined || urlPoort(waarde) === set[soort] ? [] : [sleutel];
  });
  return { ontbreekt: [], set, kloptNiet };
}

/** Een bestaande `.env.local`: niets kiezen, niets schrijven, alleen de poorten overnemen. @param {Verloop} v @param {string} bestand */
function neemOver(v, bestand) {
  const gelezen = leesEnvLocal(leesTekst(bestand));
  if (!('set' in gelezen)) {
    v.fout(
      'env-bestaand',
      `.env.local niet leesbaar of zonder ${gelezen.ontbreekt.join(', ')}`,
      'draai poorten buiten de sandbox, of geef db-bewijs --pg <poort> uit de overdracht van de eigenaar',
    );
    return;
  }
  if (gelezen.kloptNiet.length > 0) {
    v.fout(
      'env-bestaand',
      `.env.local bestaat met poorten die niet kloppen: ${gelezen.kloptNiet.join(', ')}`,
      'niet overschreven; vraag de eigenaar om de poortaanpassing',
    );
    return;
  }
  const { set } = gelezen;
  v.gegevens = { ...set };
  v.ok('env-bestaand', `.env.local bestaat; poorten overgenomen (pg ${String(set.pg)}, web ${String(set.web)})`);
}

/**
 * `true` alleen als het pad niet bestaat (ENOENT); een onleesbaar of gemaskeerd bestand telt als aanwezig. Een leespoging in
 * plaats van een aparte bestaanscontrole: tussen controleren en schrijven zit dan geen venster (het schrijven gebruikt `wx`).
 * @param {string} bestand
 */
function ontbreekt(bestand) {
  try {
    readFileSync(bestand);
    return false;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }
}

/** @param {Verloop} v @param {Context} ctx */
async function poorten(v, ctx) {
  const bestand = path.join(ctx.root, '.env.local');
  if (!ontbreekt(bestand)) {
    neemOver(v, bestand);
    return;
  }
  const set = await kiesPoortenset();
  if (set === null) {
    v.fout(
      'keuze',
      'geen vrije poortenset tussen +0 en +90',
      'stop een oude stack van deze slug of vraag de eigenaar (docs/nieuwe-app.md, Fout → oorzaak)',
    );
    return;
  }
  v.gegevens = { ...set };
  const plus = set.pg - STANDAARD_POORTEN.pg;
  const [pg, mailUi, smtp, api, web] = vijf(set).map(String);
  v.ok('keuze', `poorten vrij (+${String(plus)}): pg ${pg}, mail-UI ${mailUi}, smtp ${smtp}, api ${api}, web ${web}`);
  if (ctx.waarden['env'] !== true) return;
  const voorbeeld = leesTekst(path.join(ctx.root, '.env.example'));
  if (voorbeeld === null) {
    v.fout('env', '.env.example niet gevonden', 'draai vanuit de app-map (~/code/<slug>)');
    return;
  }
  // `wx`: nooit een bestaand bestand overschrijven, ook niet als het tussen de controle en hier ontstond.
  if (!v.dryRun) writeFileSync(bestand, maakEnvLocal(voorbeeld, set), { flag: 'wx' });
  v.ok('env', '.env.local uit .env.example met de gekozen poorten', true);
}

// --- koppel (playbook 5.1) -------------------------------------------------------------------------------------------------

const HERSTEL_EIGENAAR = 'stop en leg het de eigenaar voor (docs/nieuwe-app.md, 5.1)';

/** De ouders van een commit; leeg als de commit niet bestaat. @param {Programma} git @param {string} rev */
function ouders(git, rev) {
  const r = git('rev-list', '--parents', '-n', '1', rev);
  return r.ok ? r.stdout.trim().split(' ').slice(1) : [];
}

/** @param {Programma} git @param {string} rev */
function revParse(git, rev) {
  const r = git('rev-parse', '--verify', '--quiet', rev);
  return r.ok ? r.stdout.trim() : '';
}

/**
 * Al gekoppeld: HEAD of HEAD~1 (na de hernoem-commit van 5.2) is een merge waarvan de tweede ouder in template/main zit.
 * @param {Verloop} v @param {Programma} git
 */
function alGekoppeld(v, git) {
  if (revParse(git, 'refs/remotes/template/main') === '') return false;
  for (const rev of ['HEAD', 'HEAD~1']) {
    const [, tweede, ...meer] = ouders(git, rev);
    if (tweede === undefined || meer.length > 0) continue;
    if (!git('merge-base', '--is-ancestor', tweede, 'template/main').ok) continue;
    v.gegevens = {
      templateSha: tweede,
      appTree: revParse(git, `${rev}^{tree}`),
      templateTree: revParse(git, `${tweede}^{tree}`),
    };
    v.sla('merge', 'al gekoppeld aan template/main');
    return true;
  }
  return false;
}

/** De remote `template` met push-URL DISABLED; een bestaande met een andere URL is fout. @param {Verloop} v @param {Programma} git @param {string} url */
function remoteKlaar(v, git, url) {
  const bestaand = git('config', '--get', 'remote.template.url');
  const huidig = bestaand.ok ? bestaand.stdout.trim() : null;
  if (huidig !== null && huidig !== url)
    return v.fout('remote', `remote template wijst naar ${huidig}, verwacht ${url}`, HERSTEL_EIGENAAR);
  if (huidig !== null && git('config', '--get', 'remote.template.pushurl').stdout.trim() === 'DISABLED')
    return v.ok('remote', 'remote template bestaat met push-URL DISABLED');
  if (!v.dryRun) {
    const stappen = [
      ...(huidig === null ? [['remote', 'add', 'template', url]] : []),
      ['remote', 'set-url', '--push', 'template', 'DISABLED'],
    ];
    for (const args of stappen) {
      const r = git(...args);
      if (!r.ok)
        return v.fout(
          'remote',
          `git ${args.slice(0, 2).join(' ')} mislukt: ${eersteRegel(r.stderr)}`,
          HERSTEL_EIGENAAR,
        );
    }
  }
  return v.ok('remote', `remote template (${url}) met push-URL DISABLED`, true);
}

/**
 * Haalt template/main op; met --dry-run alleen naar FETCH_HEAD, zonder remote of ref. Geeft de ref, of null bij een fout.
 * @param {Verloop} v @param {Programma} git @param {string} url
 */
function haalOp(v, git, url) {
  const r = v.dryRun ? git('fetch', url, 'main') : git('fetch', 'template');
  const ref = v.dryRun ? 'FETCH_HEAD' : 'template/main';
  if (!r.ok || revParse(git, `${ref}^{commit}`) === '') {
    v.fout(
      'fetch',
      `template/main niet opgehaald: ${eersteRegel(r.stderr) || 'geen branch main'}`,
      'controleer het netwerk en gh auth status; draai koppel opnieuw',
    );
    return null;
  }
  v.ok('fetch', 'template/main opgehaald');
  return ref;
}

/** Harde voorwaarde: de tree van HEAD is die van template/main; anders verbergt `-s ours` het verschil. @param {Verloop} v @param {Programma} git @param {string} ref */
function treeGelijk(v, git, ref) {
  const appTree = revParse(git, 'HEAD^{tree}');
  const templateTree = revParse(git, `${ref}^{tree}`);
  v.gegevens = { templateSha: revParse(git, `${ref}^{commit}`), appTree, templateTree };
  if (appTree === '' || appTree !== templateTree)
    return v.fout(
      'tree',
      'tree van HEAD wijkt af van template/main; niet gekoppeld',
      'stop en leg de eigenaar een herstelkeuze voor (docs/nieuwe-app.md, 5.1)',
    );
  return v.ok('tree', `tree van HEAD gelijk aan die van template/main (${appTree.slice(0, 12)})`);
}

/** @param {Verloop} v @param {Programma} git @param {string} ref */
function koppelMerge(v, git, ref) {
  const kort = git('rev-parse', '--short', ref).stdout.trim();
  if (v.dryRun) return v.ok('merge', `koppeling aan template/main (${kort}) niet uitgevoerd`, true);
  const bericht = `chore: link to template (${kort})`;
  const r = git('merge', '--allow-unrelated-histories', '-s', 'ours', 'template/main', '-m', bericht);
  if (!r.ok) return v.fout('merge', `git merge mislukt: ${eersteRegel(r.stderr)}`, HERSTEL_EIGENAAR);
  const diff = git('diff', 'HEAD~1', '--stat');
  if (ouders(git, 'HEAD').length !== 2 || !diff.ok || diff.stdout.trim() !== '')
    return v.fout(
      'merge',
      'controle na de merge mislukt: verwacht twee ouders en een lege diff met HEAD~1',
      HERSTEL_EIGENAAR,
    );
  return v.ok('merge', `gekoppeld aan template/main (${kort})`, true);
}

/** @param {Verloop} v @param {Context} ctx */
function koppel(v, ctx) {
  const root = ctx.gitRoot;
  if (root === null) return v.fout('werkmap', 'geen git-repo', 'draai vanuit ~/code/<slug>');
  /** @type {Programma} */
  const git = (...args) => voer('git', args, root);
  const status = git('status', '--porcelain');
  if (!status.ok || status.stdout.trim() !== '')
    return v.fout('werkmap', 'werkmap niet schoon', 'commit of herstel eerst; koppel draait alleen op een verse kopie');
  v.ok('werkmap', 'werkmap schoon');
  const repo = templateRepo(root);
  if (repo === undefined)
    return v.fout('template-url', '.claude/gates.json: template.repository ontbreekt', HERSTEL_EIGENAAR);
  const url = `https://github.com/${repo}.git`;
  if (alGekoppeld(v, git)) return true;
  if (git('rev-list', '--count', 'HEAD').stdout.trim() !== '1')
    return v.fout('geschiedenis', 'HEAD is niet de enige, ouderloze commit; niet gekoppeld', HERSTEL_EIGENAAR);
  v.ok('geschiedenis', 'HEAD is de enige commit');
  if (!remoteKlaar(v, git, url)) return false;
  const ref = haalOp(v, git, url);
  if (ref === null || !treeGelijk(v, git, ref)) return false;
  return koppelMerge(v, git, ref);
}

// --- db-bewijs (playbook 8) --------------------------------------------------------------------------------------------------

const HERSTEL_BEVINDING =
  'een afwijking is een bevinding over de template: niet repareren, noteren voor de overdracht (docs/nieuwe-app.md, Fase 8)';
const ROL = 'set local role app_authenticated';
const COMMANDOTAGS = new Set(['BEGIN', 'SET', 'COMMIT', 'ROLLBACK']);

/**
 * @typedef {{ id: string, wie: 'migrator' | 'api', sql: string[], melding: string, klopt: (waarde: string, r: Uitvoer) => boolean }} Bewering
 */

/** De zes beweringen uit playbook 8. @param {number} migraties @param {string} apiGebruiker @returns {Bewering[]} */
function beweringen(migraties, apiGebruiker) {
  const n = String(migraties);
  /** @param {string} verwacht @returns {Bewering['klopt']} */
  const gelijk = (verwacht) => (waarde, r) => r.ok && waarde === verwacht;
  return [
    {
      id: 'migraties',
      wie: 'migrator',
      sql: ['select count(*) from schema_migrations'],
      melding: `alle ${n} migraties uit db/migrations toegepast`,
      klopt: gelijk(n),
    },
    {
      id: 'schemas',
      wie: 'migrator',
      sql: [
        "select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname in ('app','better_auth','tap')",
      ],
      melding: "de schema's app, better_auth en tap bestaan",
      klopt: gelijk('app,better_auth,tap'),
    },
    {
      id: 'geen-superuser',
      wie: 'migrator',
      sql: ['select rolsuper from pg_roles where rolname = current_user'],
      melding: 'de migrator is geen superuser (RLS geldt ook voor hem)',
      klopt: gelijk('f'),
    },
    {
      id: 'api-zonder-rol',
      wie: 'api',
      sql: ['select app.current_user_id()'],
      melding: `${apiGebruiker} ziet zonder rolwissel niets (permission denied for schema app)`,
      klopt: (_waarde, r) => !r.ok && r.stderr.includes('permission denied for schema app'),
    },
    {
      id: 'rol-zonder-gebruiker',
      wie: 'api',
      sql: ['begin', ROL, "select coalesce(app.current_user_id(), '<null>')", 'rollback'],
      melding: 'met SET LOCAL ROLE werkt het schema, zonder gebruiker (<null>)',
      klopt: gelijk('<null>'),
    },
    {
      id: 'rolwissel-lokaal',
      wie: 'api',
      sql: ['begin', ROL, 'commit', 'select current_user'],
      melding: `de rolwissel blijft niet hangen (current_user is ${apiGebruiker})`,
      klopt: gelijk(apiGebruiker),
    },
  ];
}

/**
 * De PG-poort: --pg, anders het resultaat van `poorten`; nooit `.env.local`. Het resultaat telt alleen als het vers is:
 * uitslag ok, geen dry-run en dezelfde head als nu (beide null buiten een repo).
 * @param {Context} ctx
 */
function pgPoort(ctx) {
  const optie = tekstOptie(ctx.waarden, 'pg');
  if (optie !== undefined) return Number(optie);
  const resultaat = leesJson(path.join(ctx.map, '.template', 'nieuwe-app-poorten.json'));
  if (veld(resultaat, 'uitslag') !== 'ok' || veld(resultaat, 'dryRun') !== false) return undefined;
  if (veld(resultaat, 'head') !== huidigeHead(ctx.gitRoot)) return undefined;
  const pg = veld(veld(resultaat, 'gegevens'), 'pg');
  return typeof pg === 'number' && Number.isInteger(pg) ? pg : undefined;
}

/** Gebruikers en wachtwoorden uit `.env.example` (lokale demowaarden), met de PG-poort erin. @param {string} root @param {number} pg */
function databaseUrls(root, pg) {
  const voorbeeld = leesTekst(path.join(root, '.env.example')) ?? '';
  const [migrator, api] = ['MIGRATOR_DATABASE_URL', 'DATABASE_URL'].map((sleutel) => envWaarde(voorbeeld, sleutel));
  if (urlPoort(migrator) === undefined || urlPoort(api) === undefined) return null;
  if (migrator === undefined || api === undefined) return null;
  const gebruiker = /^[a-z]+:\/\/([^:@/]*)/i.exec(api)?.[1] ?? '';
  return { migrator: metPoort(migrator, pg), api: metPoort(api, pg), gebruiker };
}

/** @param {Verloop} v @param {Context} ctx */
function dbBewijs(v, ctx) {
  const pg = pgPoort(ctx);
  if (pg === undefined) return v.fout('pg-poort', 'PG-poort onbekend', 'eerst poorten, of geef --pg <poort>');
  const urls = databaseUrls(ctx.root, pg);
  if (urls === null)
    return v.fout(
      'env-example',
      '.env.example zonder MIGRATOR_DATABASE_URL of DATABASE_URL',
      'draai vanuit de app-map (~/code/<slug>)',
    );
  let migraties = 0;
  try {
    migraties = readdirSync(path.join(ctx.root, 'db/migrations')).filter((naam) => naam.endsWith('.sql')).length;
  } catch {
    // geen map: nul migraties verwacht, de vergelijking meldt het verschil
  }
  for (const bewering of beweringen(migraties, urls.gebruiker)) {
    const url = bewering.wie === 'migrator' ? urls.migrator : urls.api;
    const sql = bewering.sql.flatMap((regel) => ['-c', regel]);
    const r = voer('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...sql], ctx.root);
    const regels = r.stdout.split('\n').map((regel) => regel.trim());
    const waarde = regels.filter((regel) => regel !== '' && !COMMANDOTAGS.has(regel)).at(-1) ?? '';
    if (bewering.klopt(waarde, r)) v.ok(bewering.id, bewering.melding);
    else {
      const kreeg = r.ok ? `uitvoer "${waarde}"` : eersteRegel(r.stderr);
      v.fout(bewering.id, `niet bewezen op poort ${String(pg)}: ${bewering.melding}; ${kreeg}`, HERSTEL_BEVINDING);
    }
  }
  return true;
}

// --- preflight (alleen lezend) ---------------------------------------------------------------------------------------------

/** @param {string} bestand */
function uitvoerbaar(bestand) {
  try {
    accessSync(bestand, constants.X_OK);
    return statSync(bestand).isFile();
  } catch {
    return false;
  }
}

/** @param {string} naam */
function opPad(naam) {
  const mappen = (process.env['PATH'] ?? '').split(path.delimiter);
  return mappen.some((map) => map !== '' && uitvoerbaar(path.join(map, naam)));
}

/** Een veld uit os-release, zonder aanhalingstekens. @param {string} tekst @param {string} naam */
function osVeld(tekst, naam) {
  return new RegExp(`^${naam}=["']?([^"'\\n]*)["']?$`, 'm').exec(tekst)?.[1];
}

/** @param {Verloop} v */
function stapOs(v) {
  const tekst = leesTekst(process.env['NIEUWE_APP_OS_RELEASE'] ?? '/etc/os-release');
  const versie = tekst === null ? undefined : osVeld(tekst, 'VERSION_ID');
  if (tekst !== null && osVeld(tekst, 'ID') === 'ubuntu' && (versie === '24.04' || versie === '26.04'))
    return v.ok('os', `Ubuntu ${versie}`);
  const naam =
    tekst === null
      ? `${type()} ${release()}`
      : `${osVeld(tekst, 'NAME') ?? osVeld(tekst, 'ID') ?? 'onbekend'} ${versie ?? 'onbekend'}`;
  return v.fout(
    'os',
    `besturingssysteem niet ondersteund: ${naam}`,
    'deze setup ondersteunt Ubuntu 24.04 en 26.04 (START-NIEUWE-APP.md)',
  );
}

/** @param {Verloop} v @param {Context} ctx */
function stapMachine(v, ctx) {
  const werkmap = process.env['NIEUWE_APP_WERKMAP'] ?? ctx.cwd;
  if (/^\/mnt\/[a-zA-Z](?:\/|$)/.test(werkmap))
    v.fout(
      'pad',
      `de werkmap staat op een Windows-schijf (${werkmap})`,
      'werk op ext4: ~/setup of ~/code/<slug> (docs/nieuwe-app.md, Harde regels)',
    );
  else v.ok('pad', 'de werkmap staat niet op een Windows-schijf');

  const pid1 = (leesTekst(process.env['NIEUWE_APP_PID1_COMM'] ?? '/proc/1/comm') ?? '').trim();
  if (process.env['WSL_DISTRO_NAME'] === undefined) v.sla('systemd', 'geen WSL: PID 1 niet gecontroleerd');
  else if (pid1 === 'systemd') v.ok('systemd', 'systemd is PID 1');
  else
    v.fout(
      'systemd',
      `systemd is niet PID 1 (${pid1 || 'onbekend'})`,
      'zet systemd aan in /etc/wsl.conf en herstart WSL (docs/nieuwe-app.md, Fase 3)',
    );

  const mist = ['git', 'gh', 'jq', 'bwrap', 'socat', 'psql'].filter((naam) => !opPad(naam));
  if (!uitvoerbaar(path.join(homedir(), '.local/bin/mise'))) mist.push('mise (~/.local/bin/mise)');
  if (mist.length > 0)
    v.fout(
      'tools',
      `gereedschap ontbreekt: ${mist.join(', ')}`,
      'de eigenaar installeert het (docs/nieuwe-app.md, Fase 3)',
    );
  else v.ok('tools', 'git, gh, jq, bwrap, socat, psql en mise aanwezig');

  const bestand = process.env['NIEUWE_APP_INOTIFY_WATCHES'] ?? '/proc/sys/fs/inotify/max_user_watches';
  const watches = Number((leesTekst(bestand) ?? '').trim() || '0');
  if (watches >= MIN_INOTIFY) v.ok('inotify', `inotify max_user_watches ${String(watches)}`);
  else
    v.fout(
      'inotify',
      `inotify max_user_watches ${String(watches)}, verwacht minstens ${String(MIN_INOTIFY)}`,
      'fs.inotify.max_user_watches=524288 (docs/nieuwe-app.md, Fase 3)',
    );
}

/**
 * Buiten een repo is er geen `.claude/gates.json`: dan komt de template uit het curl-blok van START-NIEUWE-APP.md naast dit
 * script of in ~/setup (stap 6 zet beide daar). Geen letterlijke repo hier: een fork past alleen die twee plekken aan.
 */
function templateUitStart() {
  for (const map of [import.meta.dirname, path.join(homedir(), 'setup')]) {
    const tekst = leesTekst(path.join(map, 'START-NIEUWE-APP.md')) ?? '';
    const repo = /raw\.githubusercontent\.com\/([\w.-]+\/[\w.-]+)\/main\//.exec(tekst)?.[1];
    if (repo !== undefined) return repo;
  }
  return undefined;
}

/** @param {Verloop} v @param {Programma} gh @param {string | undefined} repo */
function stapTemplate(v, gh, repo) {
  if (repo === undefined)
    return v.fout(
      'template',
      'template-repo onbekend: geen .claude/gates.json en geen START-NIEUWE-APP.md naast het script',
      'draai preflight vanuit ~/setup (START-NIEUWE-APP.md, stap 6) of vanuit de app-repo',
    );
  const template = gh('api', `repos/${repo}`, '--jq', '.is_template');
  if (template.ok && template.stdout.trim() === 'true') return v.ok('template', `${repo} is een template-repo`);
  if (template.ok)
    return v.fout(
      'template',
      `${repo} is geen template-repo`,
      'overdracht: Settings → Template repository aanzetten (docs/nieuwe-app.md, 4.2)',
    );
  return v.fout(
    'template',
    `${repo} niet te lezen: ${eersteRegel(template.stderr)}`,
    'controleer gh auth status en het netwerk; draai preflight opnieuw',
  );
}

/** @param {Verloop} v @param {Programma} gh @param {Context} ctx */
function stapGithub(v, gh, ctx) {
  const status = gh('auth', 'status');
  const inlog =
    'overdracht: gh auth login --hostname github.com --git-protocol https --web --scopes workflow (docs/nieuwe-app.md, 4.1)';
  if (!status.ok) v.fout('gh-login', 'gh is niet ingelogd', inlog);
  else if (!/Token scopes:.*\bworkflow\b/.test(`${status.stdout}\n${status.stderr}`))
    v.fout('gh-login', 'de gh-login mist de scope workflow', inlog);
  else v.ok('gh-login', 'gh ingelogd met scope workflow');

  stapTemplate(v, gh, templateRepo(ctx.gitRoot) ?? templateUitStart());

  if (tekstOptie(ctx.waarden, 'zichtbaarheid') !== 'private') {
    v.sla('plan', 'zichtbaarheid public: het plan telt niet');
    return;
  }
  const plan = gh('api', 'user', '--jq', '.plan.name');
  const naam = plan.ok ? plan.stdout.trim() : '';
  if (naam === '' || naam === 'null')
    v.fout(
      'plan',
      'plan onbekend',
      'de eigenaar leest het plan af op https://github.com/settings/billing (docs/nieuwe-app.md, 4.1)',
    );
  else {
    v.gegevens['plan'] = naam;
    v.ok('plan', `plan ${naam} (free: geen ruleset op een private repo; docs/nieuwe-app.md, 4.1)`);
  }
}

/** `owner/repo` uit een GitHub-URL, in kleine letters. @param {string} url */
function githubRepo(url) {
  return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1]?.toLowerCase();
}

/** @param {Verloop} v @param {Programma} gh @param {string | undefined} slug */
function stapSlug(v, gh, slug) {
  const overschrijf =
    'stop en vraag de eigenaar; nooit een map of repo overschrijven (docs/nieuwe-app.md, Standaardwaarden)';
  if (slug === undefined) return v.sla('slug', 'geen --slug opgegeven');
  if (!SLUG.test(slug) || slug.length > MAX_SLUG)
    return v.fout(
      'slug',
      `slug "${slug}" ongeldig: kleine letters, cijfers en streepjes, begint met een letter, hooguit ${String(MAX_SLUG)} tekens`,
      'kies een geldige slug (docs/nieuwe-app.md, Standaardwaarden)',
    );
  const gebruiker = gh('api', 'user', '--jq', '.login');
  const login = gebruiker.ok ? gebruiker.stdout.trim() : '';
  if (login === '')
    return v.fout('slug', 'de gh-login is niet te lezen', 'controleer gh auth status; draai preflight opnieuw');
  v.gegevens['login'] = login;
  const map = path.join(homedir(), 'code', slug);
  if (existsSync(map)) {
    const origin = githubRepo(voer('git', ['config', '--get', 'remote.origin.url'], map).stdout);
    if (origin === `${login}/${slug}`.toLowerCase()) return v.sla('slug', 'hervatting: controleer SETUP-PROGRESS.md');
    return v.fout('slug', `~/code/${slug} bestaat met een andere origin`, overschrijf);
  }
  const repo = gh('api', `repos/${login}/${slug}`, '--jq', '.full_name');
  if (repo.ok) return v.fout('slug', `${login}/${slug} bestaat al op GitHub`, overschrijf);
  if (!repo.stderr.includes('404'))
    return v.fout(
      'slug',
      `${login}/${slug} niet te controleren: ${eersteRegel(repo.stderr)}`,
      'controleer gh auth status en het netwerk; draai preflight opnieuw',
    );
  return v.ok('slug', `slug ${slug} is vrij: ~/code/${slug} en ${login}/${slug} bestaan niet`);
}

/** @param {Verloop} v @param {Context} ctx */
async function preflight(v, ctx) {
  /** @type {Programma} */
  const gh = (...args) => voer('gh', args, ctx.cwd);
  stapOs(v);
  stapMachine(v, ctx);
  stapGithub(v, gh, ctx);
  stapSlug(v, gh, tekstOptie(ctx.waarden, 'slug'));
  const bezet = await bezette(poortenset(0), {});
  if (bezet.length === 0) v.ok('poorten', 'de vijf standaardpoorten zijn vrij');
  else v.sla('poorten', `standaardpoort bezet (${bezet.join(', ')}): poorten verschuift naar een vrije set`);
}

// --- ingang ------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ opties: Record<string, { type: 'string' | 'boolean' }>, voer: (v: Verloop, ctx: Context) => unknown }} Deelcommando
 */
/** @type {ReadonlyMap<string, Deelcommando>} */
const DEELCOMMANDOS = new Map([
  ['preflight', { opties: { slug: { type: 'string' }, zichtbaarheid: { type: 'string' } }, voer: preflight }],
  ['koppel', { opties: {}, voer: koppel }],
  ['poorten', { opties: { env: { type: 'boolean' } }, voer: poorten }],
  ['db-bewijs', { opties: { pg: { type: 'string' } }, voer: dbBewijs }],
]);

/** @param {string | null} reden @returns {2} */
function gebruik(reden) {
  if (reden !== null) process.stderr.write(`✗ nieuwe-app: ${reden}\n`);
  process.stderr.write(`${GEBRUIK}\n`);
  return 2;
}

/**
 * De opties van een deelcommando; een tekst bij verkeerd gebruik.
 * @param {Deelcommando} deelcommando @param {string[]} args
 * @returns {Record<string, unknown> | string}
 */
function leesOpties(deelcommando, args) {
  /** @type {Record<string, unknown>} */
  let waarden;
  try {
    const options = { ...deelcommando.opties, 'dry-run': { type: /** @type {const} */ ('boolean') } };
    waarden = parseArgs({ args, options, strict: true, allowPositionals: false }).values;
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
  const pg = tekstOptie(waarden, 'pg');
  if (pg !== undefined && !(/^[0-9]{1,5}$/.test(pg) && Number(pg) >= 1 && Number(pg) <= 65535))
    return `--pg ${pg}: geen poort (1 tot en met 65535)`;
  const zichtbaarheid = tekstOptie(waarden, 'zichtbaarheid');
  if (zichtbaarheid !== undefined && zichtbaarheid !== 'public' && zichtbaarheid !== 'private')
    return `--zichtbaarheid ${zichtbaarheid}: kies public of private`;
  return waarden;
}

/** @param {string[]} argv @returns {Promise<number>} de exitcode */
async function main(argv) {
  const [naam = '', ...rest] = argv;
  const deelcommando = DEELCOMMANDOS.get(naam);
  if (deelcommando === undefined)
    return gebruik(naam === 'repo-instellingen' ? 'repo-instellingen bestaat nog niet (bouwstap 2)' : null);
  const cwd = process.cwd();
  const top = voer('git', ['rev-parse', '--show-toplevel'], cwd);
  const gitRoot = top.ok && top.stdout.trim() !== '' ? top.stdout.trim() : null;
  const map = gitRoot ?? path.join(homedir(), 'setup');
  const bestand = path.join(map, '.template', `nieuwe-app-${naam}.json`);
  // Eerst het eigen oude resultaat weg: een afgebroken run of verkeerd gebruik laat geen oud bestand staan.
  rmSync(bestand, { force: true });
  const waarden = leesOpties(deelcommando, rest);
  if (typeof waarden === 'string') return gebruik(waarden);
  const v = new Verloop(naam, waarden['dry-run'] === true);
  try {
    await deelcommando.voer(v, { cwd, gitRoot, root: gitRoot ?? cwd, map, waarden });
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    v.fout('onverwacht', `onverwachte fout: ${melding}`, 'lees de melding; blijft het, stop en vraag de eigenaar');
  }
  return v.sluit(bestand, gitRoot);
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
