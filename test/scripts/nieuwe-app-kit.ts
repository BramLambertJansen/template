// Gedeelde fixtures voor de tests van scripts/kit/nieuwe-app.mjs (spec docs/template/specs/nieuwe-app-script.md, namespace
// nieuwe-app-script, bouwstap 1), geschreven vóór de bouw. Geen netwerk en geen docker: tijdelijke git-repo's, een nep-template
// als lokale repo (via `url.<pad>.insteadOf` in de fixture-repo) en nep-commando's (`gh`, `psql`, `docker`, `pnpm`, `npm`,
// `sudo`, `mise`) in een eigen `bin`-map die als enige op `PATH` staat.
//
// De interface die de developer bouwt in scripts/kit/nieuwe-app.mjs (alleen `node:`-imports, ingang achter `import.meta.main`):
//
//   CLI: node scripts/kit/nieuwe-app.mjs <preflight|koppel|poorten|db-bewijs> [opties] [--dry-run]; exit 0 / 1 / 2; uitvoer,
//        slotregel en resultaatbestand letterlijk zoals de spec ("Werking" 2 en 3, "Hergebruik en UX").
//   Stap-id's: preflight `os pad systemd tools inotify gh-login template plan slug poorten`; poorten `env-bestaand` (en vrij te
//        kiezen voor de rest); db-bewijs `migraties schemas geen-superuser api-zonder-rol rol-zonder-gebruiker rolwissel-lokaal`.
//   Exports (voor de unit-tests en voor scripts/dev.mjs, dat `isVrij` importeert; importeren heeft geen bijwerking):
//     export const STANDAARD_POORTEN: { pg: 54322; mailUi: 54324; smtp: 54325; api: 8787; web: 5173 }
//     export const ENV_SLEUTELS: readonly string[]   // de elf sleutels van werking 6, in `.env.example`-volgorde
//     export type Bind = (poort: number, host: string) => Promise<boolean>   // true: listen lukte (en is weer losgelaten)
//     export function isVrij(poort: number, opties?: { bind?: Bind; ipv6?: boolean }): Promise<boolean>
//         // lukt bind op '127.0.0.1' en '0.0.0.0', en bij ipv6 (default: de machine heeft ::1) ook op '::1' en '::'
//     export function kiesPoortenset(opties?: { bind?: Bind; ipv6?: boolean }):
//         Promise<{ pg; mailUi; smtp; api; web; origin } | null>   // eerste k in 0..9 met alle vijf basis + 10k vrij; anders null
//     export function maakEnvLocal(voorbeeld: string, poorten: { pg; mailUi; smtp; api; web; origin }): string
//   Ondersteunde testvariabelen (alleen voor tests, zoals DOCTOR_OS_RELEASE in scripts/doctor.sh): NIEUWE_APP_OS_RELEASE
//   (pad van een os-release-bestand), NIEUWE_APP_PID1_COMM (pad van een bestand met de naam van PID 1), NIEUWE_APP_INOTIFY_WATCHES
//   (pad van een bestand met fs.inotify.max_user_watches), NIEUWE_APP_WERKMAP (de werkmap voor de stap `pad`, default
//   process.cwd()), NIEUWE_APP_BEZETTE_POORTEN (komma-lijst; gezet, ook leeg, vervangt de echte bind van `poorten`,
//   #856). WSL is: WSL_DISTRO_NAME is gezet. De remote-URL van `template` lees je met `git config --get
//   remote.template.url`, niet met `git remote get-url`: dat laatste past `url.<x>.insteadOf` toe, dat de fixtures gebruiken.
//   `gh` wordt alleen als commando gebruikt (`gh auth status`, `gh api <pad> [--jq <pad>]`, `gh repo view`), `psql` met een
//   `postgres://`-URL of -h/-p/-U, en psql-uitvoer kan commandotags (BEGIN, SET, ROLLBACK) bevatten zoals de echte psql.
//
// Dat de tester scripts/kit/nieuwe-app.mjs niet mag schrijven (rolhek), is de reden dat de module dynamisch wordt geladen:
// ontbreekt het bestand, dan falen de tests op een assertie met een duidelijke melding in plaats van op een importfout.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import { z } from 'zod';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

export const ROOT = path.join(import.meta.dirname, '../..');
export const SCRIPT = path.join(ROOT, 'scripts/kit/nieuwe-app.mjs');
export const MIST = 'scripts/kit/nieuwe-app.mjs bestaat niet: de developer bouwt het (spec nieuwe-app-script)';

export interface Poortenset {
  pg: number;
  mailUi: number;
  smtp: number;
  api: number;
  web: number;
  origin: string;
}
export type Bind = (poort: number, host: string) => Promise<boolean>;
export interface VrijOpties {
  bind?: Bind;
  ipv6?: boolean;
}
export interface NieuweAppModule {
  bestaat: boolean;
  STANDAARD_POORTEN: Record<'pg' | 'mailUi' | 'smtp' | 'api' | 'web', number>;
  ENV_SLEUTELS: readonly string[];
  isVrij: (poort: number, opties?: VrijOpties) => Promise<boolean>;
  kiesPoortenset: (opties?: VrijOpties) => Promise<Poortenset | null>;
  maakEnvLocal: (voorbeeld: string, poorten: Poortenset) => string;
}

export async function laadModule(): Promise<NieuweAppModule> {
  if (existsSync(SCRIPT)) {
    const mod: unknown = await import(pathToFileURL(SCRIPT).href);
    return {
      ...unsafeCast<Omit<NieuweAppModule, 'bestaat'>>(mod, 'dynamische import; de vorm staat in NieuweAppModule'),
      bestaat: true,
    };
  }
  return {
    bestaat: false,
    STANDAARD_POORTEN: { pg: 0, mailUi: 0, smtp: 0, api: 0, web: 0 },
    ENV_SLEUTELS: [],
    isVrij: () => Promise.resolve().then(() => expect.fail(MIST)),
    kiesPoortenset: () => Promise.resolve().then(() => expect.fail(MIST)),
    maakEnvLocal: () => expect.fail(MIST),
  };
}

export function eisScript(): void {
  expect(existsSync(SCRIPT), MIST).toBe(true);
}

// --- tijdelijke mappen en luisteraars ------------------------------------------------------------------------------------

const dirs: string[] = [];
const luisteraars: Server[] = [];

export function tijdelijk(voorvoegsel: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), voorvoegsel));
  dirs.push(dir);
  return dir;
}

/** Sluit alle luisteraars en verwijder alle tijdelijke mappen; aanroepen in afterEach. */
export async function ruimOp(): Promise<void> {
  await Promise.all(
    luisteraars.splice(0).map(
      (server) =>
        new Promise<void>((klaar) => {
          server.close(() => {
            klaar();
          });
        }),
    ),
  );
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Houd poort `poort` op `host` bezet tot ruimOp; false als dat niet lukt (de poort was al bezet of het adres bestaat niet). */
export function luister(poort: number, host: string): Promise<boolean> {
  return new Promise((klaar) => {
    const server = createServer();
    server.once('error', () => {
      klaar(false);
    });
    server.listen(poort, host, () => {
      luisteraars.push(server);
      klaar(true);
    });
  });
}

/** Een poort die nu vrij is (en na afloop weer losgelaten). */
export function vrijePoort(): Promise<number> {
  return new Promise((klaar, mislukt) => {
    const server = createServer();
    server.once('error', mislukt);
    server.listen(0, '127.0.0.1', () => {
      const adres = server.address();
      const poort = typeof adres === 'object' && adres !== null ? adres.port : 0;
      server.close(() => {
        klaar(poort);
      });
    });
  });
}

// --- git -------------------------------------------------------------------------------------------------------------------

/** Echte git in `cwd`; faalt de test bij een foutcode. De gitconfig van de machine telt niet (test/setup/git-env.ts). */
export function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
  return r.stdout.trim();
}

export function vindCommando(naam: string): string {
  for (const map of (process.env['PATH'] ?? '').split(path.delimiter)) {
    const kandidaat = path.join(map, naam);
    if (existsSync(kandidaat)) return kandidaat;
  }
  throw new Error(`${naam} staat niet op PATH`);
}

// --- de template en de app-fixture ---------------------------------------------------------------------------------------

/** Zoals `.env.example` na OV-6 (API_PORT en WEB_PORT erin); de tests lezen voor AC-7 en AC-16 ook de echte. */
export const ENV_EXAMPLE = `# Lokale demo-waarden. Nooit echte geheimen.
APP_ENV=local
APP_ORIGIN=http://localhost:5173
PG_PORT=54322
MAIL_UI_PORT=54324
SMTP_PORT=54325
API_PORT=8787
WEB_PORT=5173

MIGRATOR_DATABASE_URL=postgres://app_migrator:app_migrator@127.0.0.1:54322/app?sslmode=disable
DATABASE_URL=postgres://api_user:api_user@127.0.0.1:54322/app
AUTH_DATABASE_URL=postgres://auth_service:auth_service@127.0.0.1:54322/app
AUTH_BASE_URL=http://localhost:5173
AUTH_SECRET=local-demo-secret-change-per-environment-000000
SMTP_URL=smtp://127.0.0.1:54325
`;

export const PLUS_TIEN: Poortenset = {
  pg: 54332,
  mailUi: 54334,
  smtp: 54335,
  api: 8797,
  web: 5183,
  origin: 'http://localhost:5183',
};

/** De uitkomst die het script voor een poortenset moet geven, onafhankelijk geschreven (orakel voor AC-7 en AC-8). */
export function envLocalVoor(poorten: Poortenset, voorbeeld = ENV_EXAMPLE): string {
  const vervang: Record<string, string> = {
    PG_PORT: String(poorten.pg),
    MAIL_UI_PORT: String(poorten.mailUi),
    SMTP_PORT: String(poorten.smtp),
    API_PORT: String(poorten.api),
    WEB_PORT: String(poorten.web),
    APP_ORIGIN: poorten.origin,
    AUTH_BASE_URL: poorten.origin,
  };
  return voorbeeld
    .split('\n')
    .map((regel) => {
      const [sleutel = '', ...rest] = regel.split('=');
      const waarde = rest.join('=');
      const vast = vervang[sleutel];
      if (vast !== undefined) return `${sleutel}=${vast}`;
      if (['MIGRATOR_DATABASE_URL', 'DATABASE_URL', 'AUTH_DATABASE_URL'].includes(sleutel))
        return `${sleutel}=${waarde.replace(':54322/', `:${String(poorten.pg)}/`)}`;
      if (sleutel === 'SMTP_URL') return `${sleutel}=${waarde.replace(':54325', `:${String(poorten.smtp)}`)}`;
      return regel;
    })
    .join('\n');
}

export const MIGRATIES = 3;
const TEMPLATE_REPO = 'owner/template';
const TEMPLATE_URL = `https://github.com/${TEMPLATE_REPO}.git`;

function templateBestanden(): Record<string, string> {
  const migraties = Object.fromEntries(
    Array.from({ length: MIGRATIES }, (_leeg, i) => [
      `db/migrations/2026010100000${String(i)}_m${String(i)}.sql`,
      '-- migratie\n',
    ]),
  );
  return {
    'README.md': '# App-template\n',
    'package.json': '{ "name": "app-template" }\n',
    // Zoals de echte .gitignore: resultaatbestanden (.template/) en .env.local horen niet bij de werkmap.
    '.gitignore': '.template/\n.env.*\n!.env.example\n',
    '.claude/gates.json': `{ "template": { "repository": "${TEMPLATE_REPO}" } }\n`,
    '.env.example': ENV_EXAMPLE,
    ...migraties,
  };
}

function schrijfBestanden(dir: string, bestanden: Record<string, string>): void {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

export interface GhDb {
  authStatus: string;
  scopes: string;
  api: Record<string, unknown>;
}

function standaardGh(): GhDb {
  return {
    authStatus:
      "github.com\n  ✓ Logged in to github.com account tester (keyring)\n  - Active account: true\n  - Git operations protocol: https\n  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'\n",
    scopes: 'gist, read:org, repo, workflow',
    api: {
      user: { login: 'tester', plan: { name: 'free' } },
      [`repos/${TEMPLATE_REPO}`]: { is_template: true, full_name: TEMPLATE_REPO },
      'repos/BramLambertJansen/template': { is_template: true, full_name: 'BramLambertJansen/template' },
    },
  };
}

// --- nep-commando's ---------------------------------------------------------------------------------------------------------

function stubBestand(bestand: string, inhoud: string, shebang: string): void {
  mkdirSync(path.dirname(bestand), { recursive: true });
  writeFileSync(bestand, `${shebang}\n${inhoud}\n`);
  chmodSync(bestand, 0o755);
}

const NODE = `#!${process.execPath}`;
const BASH = '#!/bin/bash';

// gh: kijkt in $STUB_DIR/gh.json en logt elke aanroep (JSON-regel met de argumenten) in $STUB_DIR/gh.log. Eén stub voor alles wat
// `gh auth status`, `gh api <pad> [--jq .a.b] [-i]` en `gh repo view <repo> --json isTemplate` nodig heeft.
const GH_STUB = `
const fs = require('node:fs');
const dir = process.env.STUB_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(dir + '/gh.log', JSON.stringify(args) + '\\n');
const db = JSON.parse(fs.readFileSync(dir + '/gh.json', 'utf8'));
const MET_WAARDE = new Set(['--jq', '-q', '-X', '--method', '-H', '--header', '-f', '-F', '--field', '--raw-field', '--input', '--hostname', '--cache', '-t', '--template', '--json']);
function opties(lijst) {
  const vlaggen = {};
  const los = [];
  for (let i = 0; i < lijst.length; i++) {
    if (MET_WAARDE.has(lijst[i])) vlaggen[lijst[i]] = lijst[++i];
    else if (lijst[i].startsWith('-')) vlaggen[lijst[i]] = true;
    else los.push(lijst[i]);
  }
  return { vlaggen, los };
}
function jq(waarde, uitdrukking) {
  let w = waarde;
  if (uitdrukking !== undefined) for (const sleutel of uitdrukking.replace(/^\\./, '').split('.').filter(Boolean)) w = w == null ? null : w[sleutel];
  if (w === null || w === undefined) return 'null';
  return typeof w === 'string' ? w : JSON.stringify(w);
}
const [commando, ...rest] = args;
if (commando === 'auth') {
  process.stdout.write(db.authStatus);
  process.exit(0);
}
if (commando === 'api') {
  const { vlaggen, los } = opties(rest);
  const pad = (los[0] ?? '').replace(/^\\/+/, '').split('?')[0];
  const schrijvend = ['PUT', 'POST', 'PATCH', 'DELETE'].includes(String(vlaggen['-X'] ?? vlaggen['--method'] ?? 'GET').toUpperCase()) || vlaggen['--input'] !== undefined;
  if (schrijvend) { process.stdout.write('{}\\n'); process.exit(0); }
  const waarde = db.api[pad];
  if (waarde === undefined) { process.stderr.write('gh: Not Found (HTTP 404)\\n'); process.exit(1); }
  const kop = vlaggen['-i'] || vlaggen['--include'] ? 'HTTP/2.0 200 OK\\nX-Oauth-Scopes: ' + db.scopes + '\\n\\n' : '';
  process.stdout.write(kop + (vlaggen['--jq'] ?? vlaggen['-q'] ? jq(waarde, vlaggen['--jq'] ?? vlaggen['-q']) : JSON.stringify(waarde)) + '\\n');
  process.exit(0);
}
if (commando === 'repo' && rest[0] === 'view') {
  const { vlaggen, los } = opties(rest.slice(1));
  const waarde = db.api['repos/' + los[0]];
  if (waarde === undefined) { process.stderr.write('GraphQL: Could not resolve to a Repository\\n'); process.exit(1); }
  const camel = { isTemplate: waarde.is_template, nameWithOwner: waarde.full_name };
  process.stdout.write((vlaggen['-q'] ?? vlaggen['--jq'] ? jq(camel, vlaggen['-q'] ?? vlaggen['--jq']) : JSON.stringify(camel)) + '\\n');
  process.exit(0);
}
process.exit(0);
`;

// psql: logt { poort, gebruiker, sql } per aanroep in $STUB_DIR/psql.log en geeft per bewering de uitvoer van playbook 8, met
// de commandotags van de echte psql (zonder -q): BEGIN, SET, ROLLBACK, COMMIT. Een fout gaat naar stderr met exitcode 1.
// Omgeving: STUB_MIGRATIES (aantal), STUB_SUPERUSER (f of t), STUB_SCHEMAS.
const PSQL_STUB = `
const fs = require('node:fs');
const args = process.argv.slice(2);
const url = args.find((a) => /^postgres(ql)?:\\/\\//.test(a)) ?? '';
const delen = /^postgres(?:ql)?:\\/\\/([^:@/]*)(?::[^@/]*)?@[^:/]*:(\\d+)\\//.exec(url);
const vlag = (naam) => { const i = args.indexOf(naam); return i < 0 ? undefined : args[i + 1]; };
const poort = delen ? delen[2] : (vlag('-p') ?? process.env.PGPORT ?? '');
const gebruiker = delen ? delen[1] : (vlag('-U') ?? process.env.PGUSER ?? '');
const sqls = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--command' || /^-[A-Za-z]*c$/.test(args[i])) sqls.push(args[++i]);
const stil = args.includes('-q');
fs.appendFileSync(process.env.STUB_DIR + '/psql.log', JSON.stringify({ poort, gebruiker, sql: sqls.join(' ; ') }) + '\\n');
const uit = [];
for (const sql of sqls) {
  const s = sql.toLowerCase().trim();
  if (s === 'begin') { if (!stil) uit.push('BEGIN'); }
  else if (s === 'commit') { if (!stil) uit.push('COMMIT'); }
  else if (s === 'rollback') { if (!stil) uit.push('ROLLBACK'); }
  else if (s.startsWith('set local role')) { if (!stil) uit.push('SET'); }
  else if (s.includes('count(*) from schema_migrations')) uit.push(process.env.STUB_MIGRATIES ?? '0');
  else if (s.includes('string_agg(nspname')) uit.push(process.env.STUB_SCHEMAS ?? 'app,better_auth,tap');
  else if (s.includes('rolsuper')) uit.push(process.env.STUB_SUPERUSER ?? 'f');
  else if (s.includes('coalesce(app.current_user_id()')) uit.push('<null>');
  else if (s.includes('app.current_user_id()')) {
    process.stderr.write('ERROR:  permission denied for schema app\\n');
    process.exit(1);
  }
  else if (s.includes('current_user')) uit.push(gebruiker);
}
if (uit.length > 0) process.stdout.write(uit.join('\\n') + '\\n');
process.exit(0);
`;

// docker, pnpm, npm en sudo: het script mag ze nooit starten (AC-1); elke aanroep laat een markeerbestand achter.
const MARKEER_STUB = (naam: string): string => `printf '%s\\n' '${naam}' >> "$STUB_DIR/markeer"`;

export interface Fixture {
  home: string;
  bin: string;
  stub: string;
  /** De werkmap van de app: één ouderloze commit met dezelfde tree als de template. */
  repo: string;
  template: string;
  env: Record<string, string>;
}

export interface FixtureOpties {
  zonderPsql?: boolean;
  /** Extra bestanden in de app-repo vóór de eerste commit (laat de tree afwijken van de template). */
  extra?: Record<string, string>;
  gh?: (db: GhDb) => GhDb;
  migraties?: number;
}

export function maakFixture(opties: FixtureOpties = {}): Fixture {
  const home = tijdelijk('nieuwe-app-');
  const bin = path.join(home, 'bin');
  const stub = path.join(home, 'stub');
  const bestanden = path.join(home, 'bestanden');
  for (const map of [bin, stub, bestanden, path.join(home, 'code'), path.join(home, '.local/bin')])
    mkdirSync(map, { recursive: true });

  const template = path.join(home, 'template-remote');
  mkdirSync(template);
  schrijfBestanden(template, templateBestanden());
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'template');

  const repo = path.join(home, 'work', 'app');
  mkdirSync(repo, { recursive: true });
  schrijfBestanden(repo, { ...templateBestanden(), ...opties.extra });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', `url.${template}.insteadOf`, TEMPLATE_URL);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'Initial commit');

  symlinkSync(vindCommando('git'), path.join(bin, 'git'));
  stubBestand(path.join(bin, 'gh'), GH_STUB, NODE);
  if (opties.zonderPsql !== true) stubBestand(path.join(bin, 'psql'), PSQL_STUB, NODE);
  for (const naam of ['jq', 'bwrap', 'socat']) stubBestand(path.join(bin, naam), 'exit 0', BASH);
  for (const naam of ['docker', 'pnpm', 'npm', 'sudo']) stubBestand(path.join(bin, naam), MARKEER_STUB(naam), BASH);
  stubBestand(path.join(home, '.local/bin/mise'), 'exit 0', BASH);
  writeFileSync(path.join(stub, 'gh.json'), JSON.stringify((opties.gh ?? ((db) => db))(standaardGh())));
  writeFileSync(path.join(bestanden, 'os-release'), 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n');
  writeFileSync(path.join(bestanden, 'pid1'), 'systemd\n');
  writeFileSync(path.join(bestanden, 'inotify'), '524288\n');

  return {
    home,
    bin,
    stub,
    repo,
    template,
    env: {
      PATH: bin,
      HOME: home,
      STUB_DIR: stub,
      STUB_MIGRATIES: String(opties.migraties ?? MIGRATIES),
      WSL_DISTRO_NAME: 'Ubuntu',
      NIEUWE_APP_OS_RELEASE: path.join(bestanden, 'os-release'),
      NIEUWE_APP_PID1_COMM: path.join(bestanden, 'pid1'),
      NIEUWE_APP_INOTIFY_WATCHES: path.join(bestanden, 'inotify'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  };
}

/** Pas de bestanden aan die een fixture voor het script kan lezen (os-release, pid1, inotify). */
export function schrijfFixtureBestand(fx: Fixture, naam: 'os-release' | 'pid1' | 'inotify', inhoud: string): void {
  writeFileSync(path.join(fx.home, 'bestanden', naam), inhoud);
}

export function ghLog(fx: Fixture): string[][] {
  const bestand = path.join(fx.stub, 'gh.log');
  if (!existsSync(bestand)) return [];
  const schema = z.array(z.string());
  return readFileSync(bestand, 'utf8')
    .split('\n')
    .filter((regel) => regel !== '')
    .map((regel) => schema.parse(JSON.parse(regel)));
}

const PsqlRegel = z.object({ poort: z.string(), gebruiker: z.string(), sql: z.string() });
export function psqlLog(fx: Fixture): z.infer<typeof PsqlRegel>[] {
  const bestand = path.join(fx.stub, 'psql.log');
  if (!existsSync(bestand)) return [];
  return readFileSync(bestand, 'utf8')
    .split('\n')
    .filter((regel) => regel !== '')
    .map((regel) => PsqlRegel.parse(JSON.parse(regel)));
}

/** De namen van de nep-commando's (docker, pnpm, npm, sudo) die zijn gestart; leeg als niets is gestart. */
export function gestarteNepCommandos(fx: Fixture): string {
  const bestand = path.join(fx.stub, 'markeer');
  return existsSync(bestand) ? readFileSync(bestand, 'utf8') : '';
}

/** Schrijvende gh-aanroepen: `-X PUT/POST/PATCH/DELETE`, `--method …`, `--input` of `repo edit` (AC-5, AC-9, AC-10). */
export function schrijvendeGhAanroepen(fx: Fixture): string[][] {
  return ghLog(fx).filter((args) => {
    const gevolgd = args.join(' ');
    return (
      /(^| )(-X|--method)[ =]?(PUT|POST|PATCH|DELETE)\b/i.test(gevolgd) ||
      args.includes('--input') ||
      gevolgd.startsWith('repo edit')
    );
  });
}

// --- het script draaien -----------------------------------------------------------------------------------------------------

export interface Uitvoer {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout en stderr samen. */
  uit: string;
}

export interface DraaiOpties {
  cwd?: string;
  env?: Record<string, string>;
}

export function draai(fx: Fixture, args: string[], opties: DraaiOpties = {}): Uitvoer {
  eisScript();
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: opties.cwd ?? fx.repo,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...fx.env, ...opties.env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, uit: `${r.stdout}\n${r.stderr}` };
}

// --- het resultaatbestand ---------------------------------------------------------------------------------------------------

const StapSchema = z.object({
  id: z.string(),
  status: z.enum(['ok', 'fout', 'overgeslagen']),
  melding: z.string(),
  herstel: z.string().nullable(),
});
const ResultaatSchema = z.object({
  schema: z.literal(1),
  commando: z.string(),
  tijd: z.string(),
  head: z.string().nullable(),
  dryRun: z.boolean(),
  uitslag: z.enum(['ok', 'fout']),
  stappen: z.array(StapSchema),
  gegevens: z.record(z.string(), z.unknown()).optional(),
});
export type Resultaat = z.infer<typeof ResultaatSchema>;

export function resultaatPad(map: string, commando: string): string {
  return path.join(map, '.template', `nieuwe-app-${commando}.json`);
}

export function leesResultaat(map: string, commando: string): Resultaat {
  const bestand = resultaatPad(map, commando);
  expect(existsSync(bestand), `${bestand} bestaat`).toBe(true);
  return ResultaatSchema.parse(JSON.parse(readFileSync(bestand, 'utf8')));
}

export function stap(resultaat: Resultaat, id: string): Resultaat['stappen'][number] {
  const gevonden = resultaat.stappen.find((s) => s.id === id);
  expect(
    gevonden,
    `stap ${id} staat in het resultaat (${resultaat.stappen.map((s) => s.id).join(', ')})`,
  ).toBeDefined();
  if (gevonden === undefined) throw new Error('onbereikbaar');
  return gevonden;
}

export function stapStatus(resultaat: Resultaat, id: string): string {
  return stap(resultaat, id).status;
}

export function gegeven(resultaat: Resultaat, sleutel: string): unknown {
  return resultaat.gegevens?.[sleutel];
}

export const TEMPLATE_URL_FIXTURE = TEMPLATE_URL;
