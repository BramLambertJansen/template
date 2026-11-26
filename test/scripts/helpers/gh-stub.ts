// Gedeelde helper voor de `gh`-stubs van de ruleset-tests (spec nieuwe-app-script, bouwstap 2, Testplan): één plek voor
//  1. `scripts/github-ruleset.sh` draaien met een `gh`-stub die de payload bewaart (verhuisd uit github-ruleset.test.ts),
//  2. de payload die dat script echt schrijft, als verwachting voor `ruleset-controle.mjs` en `repo-instellingen --controleer`,
//  3. een `gh`-stub per endpoint (antwoord en exitcode), als commando op PATH en als geïnjecteerde functie,
//  4. de antwoorden van een gezonde repo (ruleset gelijk aan de payload, instellingen gelijk aan playbook 6.2).
// Er gaat niets naar GitHub.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ROOT = path.join(import.meta.dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/github-ruleset.sh');
const dirs: string[] = [];

/** Verwijder alle tijdelijke mappen van deze helper; aanroepen in afterEach. */
export function ruimGhStubOp(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// --- 1. scripts/github-ruleset.sh met een gh-stub ---------------------------------------------------------------------------

export type Uitvoer = { status: number | null; stdout: string; stderr: string; aanroepen: string[]; payload: unknown };

// GEWIJZIGD (templateregime, ADR 0089 punt 3): het script vraagt na de ruleset `codeowners/errors` op; de stub antwoordt daarop
// met een lege lijst, zodat de bestaande gevallen blijven slagen.
// gh-stub. GH_MODE: leeg (geen ruleset `main`), bestaat (ruleset 42 bestaat), upgrade (private repo zonder Pro/Team).
const GH = `
echo "gh $*" >> "$STUB_DIR/log"
if [[ "$GH_MODE" == upgrade ]]; then
  echo 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)' >&2
  exit 1
fi
if [[ " $* " == *"/codeowners/errors"* ]]; then echo '{"errors":[]}'; exit 0; fi
if [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/payload.json"; echo '{"id":42}'; exit 0; fi
if [[ "$GH_MODE" == bestaat ]]; then echo 42; fi
`;

export function draaiRulesetScript(args: string[], mode = ''): Uitvoer {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-ruleset-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash\n${GH}`);
  chmodSync(path.join(dir, 'gh'), 0o755);
  writeFileSync(path.join(dir, 'log'), '');
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir, GH_MODE: mode },
  });
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path.join(dir, 'payload.json'), 'utf8'));
  } catch {
    payload = null;
  }
  const aanroepen = readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, aanroepen, payload };
}

// ADR 0068 punt 1: `requiredChecks` in .claude/decisions.json is de enige lijst; ruleset en workflows volgen hem.
export function requiredChecks(): string[] {
  const register: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
  const lijst =
    typeof register === 'object' && register !== null && 'requiredChecks' in register ? register.requiredChecks : [];
  return Array.isArray(lijst) ? lijst.map(String) : [];
}

// --- 2. de payload die het script echt schrijft ------------------------------------------------------------------------------

export type Json = Record<string, unknown>;

export function isJson(waarde: unknown): waarde is Json {
  return typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);
}

/** Een object uit een antwoord; de test faalt (met een duidelijke fout) als het er niet is. */
export function obj(waarde: unknown): Json {
  if (!isJson(waarde)) throw new Error('verwacht een object in het antwoord');
  return waarde;
}

/** Een lijst uit een antwoord; de test faalt (met een duidelijke fout) als ze er niet is. */
export function lijst(waarde: unknown): unknown[] {
  if (!Array.isArray(waarde)) throw new Error('verwacht een lijst in het antwoord');
  return waarde;
}

let gelezen: Json | undefined;

/** De payload van `scripts/github-ruleset.sh` (zonder `--zonder-codeql`), vers gekopieerd; geen tweede lijst in de tests. */
export function rulesetPayload(): Json {
  gelezen ??= obj(draaiRulesetScript(['eigenaar/app']).payload);
  return structuredClone(gelezen);
}

// --- 4. antwoorden van een gezonde repo ---------------------------------------------------------------------------------------

export interface Antwoorden {
  /** `repos/<repo>/rulesets`: de lijst met items. */
  lijst: Json[];
  /** `repos/<repo>/rulesets/<id>`: de payload plus `id`, `source_type` en `current_user_can_bypass` `never`. */
  detail: Json;
  /** `repos/<repo>`. */
  repo: Json;
  /** `repos/<repo>/actions/permissions/workflow`. */
  workflow: Json;
  /** `repos/<repo>/actions/permissions`. */
  actions: Json;
}

export const RULESET_ID = 42;

/** Ruleset gelijk aan de payload van het script (aangevuld, zoals AC-19) en instellingen gelijk aan playbook 6.2. */
export function goedeAntwoorden(): Antwoorden {
  return {
    lijst: [{ id: RULESET_ID, name: 'main', source_type: 'Repository', enforcement: 'active' }],
    detail: {
      ...rulesetPayload(),
      id: RULESET_ID,
      source_type: 'Repository',
      current_user_can_bypass: 'never',
    },
    repo: {
      allow_merge_commit: true,
      allow_squash_merge: true,
      allow_rebase_merge: false,
      allow_auto_merge: false,
      delete_branch_on_merge: true,
    },
    workflow: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
    actions: { enabled: true, allowed_actions: 'all', sha_pinning_required: true },
  };
}

/** De regel van een type uit de payload van een ruleset-antwoord. */
export function regel(a: Antwoorden, type: string): Json {
  const gevonden = lijst(a.detail['rules'])
    .map(obj)
    .find((kandidaat) => kandidaat['type'] === type);
  if (gevonden === undefined) throw new Error(`regel ${type} ontbreekt in de payload`);
  return gevonden;
}

export function parameters(a: Antwoorden, type: string): Json {
  return obj(regel(a, type)['parameters']);
}

export function checkLijst(a: Antwoorden): Json[] {
  return lijst(parameters(a, 'required_status_checks')['required_status_checks']).map(obj);
}

// --- 3. een gh-stub per endpoint ----------------------------------------------------------------------------------------------

/** Wat `gh api <endpoint>` teruggeeft: stdout, stderr en exitcode. Een endpoint zonder antwoord geeft 404 (exitcode 1). */
export interface Antwoord {
  stdout: string;
  stderr: string;
  exit: number;
}
export type Endpoints = Record<string, Antwoord>;

export const json = (waarde: unknown): Antwoord => ({ stdout: JSON.stringify(waarde), stderr: '', exit: 0 });
export const tekst = (stdout: string): Antwoord => ({ stdout, stderr: '', exit: 0 });
export const faal = (stderr: string, exit = 1): Antwoord => ({ stdout: '', stderr, exit });
export const UPGRADE = 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)';

/** De endpoints van een repo uit de antwoorden. Een extra antwoord (bijvoorbeeld de shape van `main`) gaat in `extra`. */
export function endpointsVoor(repo: string, a: Antwoorden, extra: Endpoints = {}): Endpoints {
  const id = String(RULESET_ID);
  return {
    [`repos/${repo}`]: json(a.repo),
    [`repos/${repo}/actions/permissions/workflow`]: json(a.workflow),
    [`repos/${repo}/actions/permissions`]: json(a.actions),
    [`repos/${repo}/rulesets`]: json(a.lijst),
    [`repos/${repo}/rulesets/${id}`]: json(a.detail),
    ...extra,
  };
}

export const EERSTE_OUDER = 'sha-eerste-ouder';

/**
 * De vorm van `main` op GitHub (spec werking 7): `repos/<repo>/commits/main` met `ouders` ouders, de eerste met sha
 * `EERSTE_OUDER`, en `repos/<repo>/commits/<EERSTE_OUDER>` met `ouders1` ouders. Goed is 1 en 2. Er is geen `main~1`-endpoint:
 * een aanroep daarmee geeft 404. Zonder `--jq` geeft de stub het volledige object `{ sha, parents: [{ sha }, …] }`.
 */
export function mainVorm(repo: string, ouders: number, ouders1: number): Endpoints {
  const commit = (sha: string, n: number, eerste: string): Antwoord =>
    json({
      sha,
      parents: Array.from({ length: n }, (_x, i) => ({ sha: i === 0 ? eerste : `${eerste}-${String(i)}` })),
    });
  return {
    [`repos/${repo}/commits/main`]: commit('sha-main', ouders, EERSTE_OUDER),
    [`repos/${repo}/commits/${EERSTE_OUDER}`]: commit(EERSTE_OUDER, ouders1, 'sha-grootouder'),
  };
}

export type GhUitvoer = { ok: boolean; stdout: string; stderr: string };
export type GhFunctie = (args: string[]) => GhUitvoer;

/** Een geïnjecteerde `gh` (de vorm van `voer()`): antwoordt per endpoint en logt elke aanroep in `log`. */
export function ghFunctie(endpoints: Endpoints, log: string[][] = []): GhFunctie {
  return (args) => {
    log.push(args);
    const eindpunt = args[0] === 'api' ? (args[1] ?? '') : '';
    const antwoord = endpoints[eindpunt.replace(/^\/+/, '')];
    if (antwoord === undefined) return { ok: false, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
    return { ok: antwoord.exit === 0, stdout: antwoord.stdout, stderr: antwoord.stderr };
  };
}

// De stub op PATH. Logt elke aanroep als JSON-regel met de argumenten in $STUB_DIR/gh.log (zelfde vorm als de stub van
// nieuwe-app-kit.ts, dus `ghLog` en `schrijvendeGhAanroepen` van die kit werken erop). `gh api <endpoint>` leest
// $STUB_DIR/endpoints.json (sleutel: het endpoint, zonder leidende slash of query); zonder `--jq` is de uitvoer het volledige
// antwoord. `--jq`/`-q` kent alleen een punt-pad (`.parents`, `.sha`) en `| length` (`.parents | length`); meer niet.
// Een schrijvende aanroep (`-X PUT|POST|PATCH|DELETE` of `--input`) en `gh repo edit` geven `{}` en exitcode 0, tenzij de
// tabel een antwoord heeft onder de sleutel `<METHODE> <endpoint>` (bijvoorbeeld `PUT repos/a/b/actions/permissions`) of
// `repo edit <repo>`: dan geldt dat antwoord (bij exit ≠ 0 stdout, stderr, exitcode). Een mislukte aanroep staat wel in het log.
const NODE_STUB = `
const fs = require('node:fs');
const dir = process.env.STUB_DIR;
const args = process.argv.slice(2);
fs.appendFileSync(dir + '/gh.log', JSON.stringify(args) + '\\n');
const MET_WAARDE = new Set(['--jq', '-q', '-X', '--method', '-H', '--header', '-f', '-F', '--field', '--raw-field', '--input', '--hostname', '--cache', '-t', '--template', '--json', '--description', '-d']);
function opties(lijst) {
  const vlaggen = {};
  const los = [];
  for (let i = 0; i < lijst.length; i++) {
    const kaal = lijst[i].split('=')[0];
    if (MET_WAARDE.has(lijst[i])) vlaggen[lijst[i]] = lijst[++i];
    else if (lijst[i].startsWith('-')) vlaggen[kaal] = lijst[i];
    else los.push(lijst[i]);
  }
  return { vlaggen, los };
}
function jq(waarde, uitdrukking) {
  let w = waarde;
  for (const deel of uitdrukking.split('|').map((d) => d.trim())) {
    if (deel === 'length') w = Array.isArray(w) ? w.length : Object.keys(w ?? {}).length;
    else for (const sleutel of deel.replace(/^\\./, '').split('.').filter(Boolean)) w = w == null ? null : w[sleutel];
  }
  if (w === null || w === undefined) return 'null';
  return typeof w === 'string' ? w : JSON.stringify(w);
}
const [commando, ...rest] = args;
const tabel = JSON.parse(fs.readFileSync(dir + '/endpoints.json', 'utf8'));
function faalt(antwoord) {
  if (antwoord.exit === 0) return;
  // Zoals de echte gh bij een HTTP-fout: de body naar stdout, de melding naar stderr, dan exitcode.
  if (antwoord.stdout) process.stdout.write(antwoord.stdout + '\\n');
  if (antwoord.stderr) process.stderr.write(antwoord.stderr + '\\n');
  process.exit(antwoord.exit);
}
if (commando === 'repo' && rest[0] === 'edit') {
  const gezet = tabel['repo edit ' + (rest[1] ?? '')];
  if (gezet !== undefined) faalt(gezet);
  process.exit(0);
}
if (commando === 'api') {
  const { vlaggen, los } = opties(rest);
  const methode = String(vlaggen['-X'] ?? vlaggen['--method'] ?? 'GET').toUpperCase();
  const eindpunt = (los[0] ?? '').replace(/^\\/+/, '').split('?')[0];
  if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(methode) || vlaggen['--input'] !== undefined) {
    const gezet = tabel[methode + ' ' + eindpunt];
    if (gezet !== undefined) faalt(gezet);
    process.stdout.write('{}\\n');
    process.exit(0);
  }
  const antwoord = tabel[eindpunt];
  if (antwoord === undefined) {
    process.stderr.write('gh: Not Found (HTTP 404)\\n');
    process.exit(1);
  }
  faalt(antwoord);
  if (antwoord.stderr) process.stderr.write(antwoord.stderr + '\\n');
  const uitdrukking = vlaggen['--jq'] ?? vlaggen['-q'];
  process.stdout.write((uitdrukking === undefined ? antwoord.stdout : jq(JSON.parse(antwoord.stdout), uitdrukking)) + '\\n');
  process.exit(0);
}
process.exit(0);
`;

/** Zet de stub als `gh` in `bin` en de endpoints in `stub` (de map die als STUB_DIR in de omgeving staat); leegt het log. */
export function zetGhStub(plaats: { bin: string; stub: string }, endpoints: Endpoints): void {
  mkdirSync(plaats.bin, { recursive: true });
  mkdirSync(plaats.stub, { recursive: true });
  writeFileSync(path.join(plaats.bin, 'gh'), `#!${process.execPath}\n${NODE_STUB}\n`);
  chmodSync(path.join(plaats.bin, 'gh'), 0o755);
  writeFileSync(path.join(plaats.stub, 'endpoints.json'), JSON.stringify(endpoints));
  writeFileSync(path.join(plaats.stub, 'gh.log'), '');
}
