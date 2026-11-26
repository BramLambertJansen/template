// SessionStart-hook `werkstraat toolchain-herstel` (ADR 0112, spec cloud-toolchain-zelfherstel): in een nieuwe cloudsessie
// waarvan de omgevingscache van vóór een pin-bump is, draait hij `scripts/cloud-setup.sh`, maar alleen als de invoer van de
// installatie gelijk is aan het anker (main). Lokaal en bij resume, clear, compact en fork doet hij niets (ADR 0085).
// Alleen `node:`-modules: op een koude VM draait hij op Node 22 (spec, ontwerp punt 8; AC-4).
// De detectie volgt `toolchainProbleemIn` in scripts/kit/toolchain.mjs; de lader pakt alleen rails/hooks/ uit, dus de
// regels staan dubbel en AC-3 houdt ze gelijk.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

/** Eigen deadline, ruim binnen de `timeout: 600` van de SessionStart-entry in .claude/settings.json (AC-9). */
export const DEADLINE_MS = 540_000;
/** Tussen SIGTERM en SIGKILL aan de procesgroep van het script. */
export const KILL_GRACE_MS = 5_000;
/** Gelijk aan PNPM_TIMEOUT_MS in scripts/kit/toolchain.mjs. */
const PNPM_TIMEOUT_MS = 20_000;
// Markeerbestanden onder node_modules, gelijk aan INSTALLATIE in scripts/kit/toolchain.mjs.
const INSTALLATIE = ['.modules.yaml', 'typescript/package.json'];
const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const VELD = 'wijzig het veld "Setup script" van de omgeving';
const PROBLEMEN = 'zie docs/ENVIRONMENT.md, Problemen';
// Geen fsmonitor of externe diff uit de git-configuratie van de werkmap: de hook draait als root (ontwerp punt 5).
const GIT_HARD = ['-c', 'core.fsmonitor=', '-c', 'diff.external='];

/**
 * Wat `scripts/cloud-setup.sh` leest of uitvoert (spec, ontwerp punt 5; AC-5): het script en scripts/kit/, de configuratie
 * van mise (v2026.9.18) met de idiomatische versiebestanden, van pnpm en van lefthook, in elke vorm die hun documentatie noemt.
 */
export const INVOER = [
  'scripts/cloud-setup.sh',
  'scripts/kit/**',
  'mise.toml',
  'mise.*.toml',
  '.mise.toml',
  '.mise.*.toml',
  'mise/**',
  '.mise/**',
  '.config/mise*',
  '.config/mise*/**',
  // mise leest ook zijn lockfile en de vroege instellingen uit `.miserc.toml` (beide genoemd in de mise-binary).
  'mise*.lock',
  '.mise*.lock',
  '.miserc.toml',
  'miserc.toml',
  '.tool-versions',
  '.nvmrc',
  '.node-version',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  '.pnpmfile.mjs',
  'patches/**',
  'lefthook*',
  '.lefthook*',
  '.lefthook*/**',
  '.config/lefthook*',
  '.config/lefthook*/**',
].map((pad) => `:(glob)${pad}`);

/**
 * @typedef {{
 *   root: string,
 *   env: Record<string, string | undefined>,
 *   deadlineMs?: number,
 *   killGraceMs?: number,
 *   pnpmTimeoutMs?: number,
 * }} HerstelDeps
 * @typedef {{ stdout?: string, exit?: number }} Uitslag
 * @typedef {{ soort: 'klopt' } | { soort: 'stop', regel: string } | { soort: 'herstel', delen: string[] }} Detectie
 */

/**
 * Zelfde major en minstens de pin; gelijk aan `passend` in scripts/kit/toolchain.mjs.
 * @param {string} node @param {string} verwacht
 */
function passend(node, verwacht) {
  const delen = (/** @type {string} */ versie) => versie.replace(/^v/, '').split('.').map(Number);
  const [major = 0, ...rest] = delen(node);
  const [wantMajor = 0, ...wantRest] = delen(verwacht);
  if (major !== wantMajor) return false;
  for (const [i, want] of wantRest.entries()) {
    const have = rest[i] ?? 0;
    if (have !== want) return have > want;
  }
  return true;
}

/** @param {string} root @param {string} rel */
function leesTekst(root, rel) {
  try {
    return readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

/** De exacte pnpm-versie uit `packageManager`, anders null; als tekst gelezen, niets uitgevoerd. @param {string} root */
function pnpmPin(root) {
  try {
    /** @type {unknown} */
    const pkg = JSON.parse(leesTekst(root, 'package.json') ?? '');
    if (typeof pkg !== 'object' || pkg === null || !('packageManager' in pkg) || typeof pkg.packageManager !== 'string')
      return null;
    return /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(pkg.packageManager)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** @param {number} ms */
const seconden = (ms) => String(Math.round(ms / 1000));

/**
 * `pnpm --version` in `$HOME` (geen projectconfiguratie, geen zelfwissel naar de pin): het deel voor de opsomming, null als
 * hij klopt, of een stopregel bij een timeout.
 * @param {string} pin @param {HerstelDeps} deps @param {string} home
 * @returns {{ deel: string | null } | { regel: string }}
 */
function pnpmDeel(pin, deps, home) {
  const timeout = deps.pnpmTimeoutMs ?? PNPM_TIMEOUT_MS;
  const result = spawnSync('pnpm', ['--version'], {
    cwd: home,
    env: deps.env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined && 'code' in result.error && result.error.code === 'ETIMEDOUT')
    return {
      regel: `! toolchain niet hersteld: pnpm --version gaf binnen ${seconden(timeout)} s geen antwoord; de versie is onbekend`,
    };
  if (result.error !== undefined || result.status !== 0) return { deel: `pnpm ontbreekt → ${pin}` };
  const werkelijk = result.stdout.trim().replace(/\s+/g, ' ').slice(0, 120) || 'onbekend';
  return { deel: werkelijk === pin ? null : `pnpm ${werkelijk} → ${pin}` };
}

/**
 * Node, pnpm en node_modules tegen de pins, met dezelfde regels als `toolchainProbleemIn` (AC-3).
 * @param {HerstelDeps} deps @param {string} home
 * @returns {Detectie}
 */
function detecteer(deps, home) {
  const pin = pnpmPin(deps.root);
  if (pin === null)
    return { soort: 'stop', regel: '! toolchain niet hersteld: packageManager moet een exacte pnpm@x.y.z-versie bevatten' };
  const delen = [];
  const nodePin = /^node\s*=\s*"([^"]+)"/m.exec(leesTekst(deps.root, 'mise.toml') ?? '')?.[1];
  if (nodePin !== undefined && !passend(process.version, nodePin)) delen.push(`Node ${process.version} → ${nodePin}`);
  const pnpm = pnpmDeel(pin, deps, home);
  if ('regel' in pnpm) return { soort: 'stop', regel: pnpm.regel };
  if (pnpm.deel !== null) delen.push(pnpm.deel);
  if (!INSTALLATIE.every((rel) => existsSync(path.join(deps.root, 'node_modules', rel))))
    delen.push('node_modules → geïnstalleerd');
  return delen.length === 0 ? { soort: 'klopt' } : { soort: 'herstel', delen };
}

/**
 * Eén git-aanroep van de vergelijking, met `GIT_HARD`; de uitvoer als tekst. Een fout van git is een onverwachte fout.
 * @param {HerstelDeps} deps @param {string[]} args @param {{ env?: Record<string, string | undefined>, input?: string }} [extra]
 */
function git(deps, args, extra = {}) {
  const result = spawnSync('git', [...GIT_HARD, ...args], {
    cwd: deps.root,
    env: extra.env ?? deps.env,
    encoding: 'utf8',
    input: extra.input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0] ?? ''} gaf exit ${String(result.status)}: ${result.stderr.trim()}`);
  return result.stdout;
}

/** @param {string} uitvoer */
const nulGescheiden = (uitvoer) => uitvoer.split('\0').filter((deel) => deel !== '');

/**
 * Mode en blob-oid per `INVOER`-pad in de tree van het anker. `git ls-tree` kent geen `:(glob)`, dus via een tijdelijke
 * index buiten de werkmap: `read-tree` schrijft alleen die index, `ls-files -s` leest hem; de werkboom doet niet mee.
 * @param {HerstelDeps} deps @param {string} anker
 * @returns {Map<string, string>} pad → `<mode> <oid>`
 */
function verwacht(deps, anker) {
  const map = mkdtempSync(path.join(tmpdir(), 'toolchain-herstel-'));
  try {
    const env = { ...deps.env, GIT_INDEX_FILE: path.join(map, 'index') };
    git(deps, ['read-tree', anker], { env });
    const regels = nulGescheiden(git(deps, ['ls-files', '-s', '-z', '--', ...INVOER], { env }));
    // `<mode> <oid> <stage>\t<pad>`
    return new Map(
      regels.map((regel) => {
        const [kop = '', pad = ''] = regel.split('\t');
        const [mode = '', oid = ''] = kop.split(' ');
        return [pad, `${mode} ${oid}`];
      }),
    );
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/**
 * Mode van een gewoon bestand in de werkmap (`100755` of `100644`); null als het ontbreekt; `anders` voor een symlink,
 * een map (ook een geneste git-repo, die `ls-files --others` als map noemt) of een ander type.
 * @param {string} root @param {string} pad
 */
function modeVan(root, pad) {
  let info;
  try {
    info = lstatSync(path.join(root, pad));
  } catch {
    return null;
  }
  if (!info.isFile() || pad.includes('\n')) return 'anders';
  return (info.mode & 0o111) === 0 ? '100644' : '100755';
}

/**
 * Mode en blob-oid per `INVOER`-pad in de werkmap: getrackt, ongetrackt en genegeerd (`ls-files --cached --others` zonder
 * `--exclude-standard`), gehasht zonder filters (`hash-object --no-filters`), dus zonder de index of een filter uit de
 * configuratie van de werkmap te vertrouwen. Een pad dat geen gewoon bestand is, krijgt `anders`.
 * @param {HerstelDeps} deps @param {Iterable<string>} ookTeZien de paden van het anker (ook als ze in de werkmap ontbreken)
 * @returns {Map<string, string>}
 */
function werkelijk(deps, ookTeZien) {
  const gevonden = nulGescheiden(git(deps, ['ls-files', '-z', '--cached', '--others', '--', ...INVOER]));
  /** @type {Map<string, string>} */
  const uitslag = new Map();
  /** @type {{ pad: string, mode: string }[]} */
  const bestanden = [];
  for (const pad of new Set([...gevonden, ...ookTeZien])) {
    const mode = modeVan(deps.root, pad.replace(/\/$/, ''));
    if (mode === 'anders') uitslag.set(pad, 'anders');
    else if (mode !== null) bestanden.push({ pad, mode });
  }
  if (bestanden.length === 0) return uitslag;
  const invoer = `${bestanden.map(({ pad }) => pad).join('\n')}\n`;
  const oids = git(deps, ['hash-object', '--no-filters', '--stdin-paths'], { input: invoer }).trim().split('\n');
  for (const [i, { pad, mode }] of bestanden.entries()) uitslag.set(pad, `${mode} ${oids[i] ?? ''}`);
  return uitslag;
}

/**
 * De `INVOER`-paden waarin de werkmap afwijkt van het anker, op inhoud en mode (spec, ontwerp punt 5; AC-6). Alleen gewone
 * bestanden (`100644`, `100755`) tellen als gelijk.
 * @param {HerstelDeps} deps @param {string} anker
 */
function afwijkend(deps, anker) {
  const ank = verwacht(deps, anker);
  const werk = werkelijk(deps, ank.keys());
  const gewoon = (/** @type {string | undefined} */ waarde) => /^100(?:644|755) /.test(waarde ?? '');
  const paden = new Set([...ank.keys(), ...werk.keys()]);
  return [...paden].filter((pad) => !gewoon(ank.get(pad)) || ank.get(pad) !== werk.get(pad)).sort();
}

/** Hooguit drie paden, daarna "en <n> meer". @param {string[]} paden */
function noem(paden) {
  const eerste = paden.slice(0, 3).join(', ');
  return paden.length > 3 ? `${eerste} en ${String(paden.length - 3)} meer` : eerste;
}

/**
 * Start het script detached in een eigen procesgroep, met stdout en stderr naar het log (per run overschreven).
 * @param {HerstelDeps} deps @param {string} log
 */
function startScript(deps, log) {
  mkdirSync(path.dirname(log), { recursive: true });
  const fd = openSync(log, 'w');
  try {
    return spawn('bash', ['scripts/cloud-setup.sh'], { cwd: deps.root, env: deps.env, detached: true, stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
}

/**
 * Wacht op het script. Na de deadline SIGTERM aan de hele groep, na de gunsttermijn SIGKILL (`run.mjs` stopt alleen het
 * bovenste proces); pas daarna, en als de leider weg is, de uitslag.
 * @param {import('node:child_process').ChildProcess} kind @param {{ deadlineMs: number, killGraceMs: number }} tijden
 * @returns {Promise<{ afgebroken: boolean, exit: string }>}
 */
function wachtOpScript(kind, { deadlineMs, killGraceMs }) {
  return new Promise((resolve, reject) => {
    /** @type {string | null} */
    let exit = null;
    let afgebroken = false;
    let gestopt = false;
    const groep = (/** @type {NodeJS.Signals} */ signaal) => {
      try {
        if (kind.pid !== undefined) process.kill(-kind.pid, signaal);
      } catch {
        // De groep is al weg.
      }
    };
    const klaar = () => {
      if (exit !== null && (!afgebroken || gestopt)) resolve({ afgebroken, exit });
    };
    const timer = setTimeout(() => {
      afgebroken = true;
      groep('SIGTERM');
      setTimeout(() => {
        groep('SIGKILL');
        gestopt = true;
        klaar();
      }, killGraceMs);
    }, deadlineMs);
    kind.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    kind.on('exit', (code, signaal) => {
      exit = code === null ? String(signaal) : String(code);
      if (!afgebroken) clearTimeout(timer);
      klaar();
    });
  });
}

/**
 * Draait `bash scripts/cloud-setup.sh` uit de werkmap en geeft de regel voor de context.
 * @param {HerstelDeps} deps @param {string[]} delen @param {string} home
 */
async function herstel(deps, delen, home) {
  const log = path.join(home, '.cache', 'werkstraat', 'toolchain-herstel.log');
  const begin = Date.now();
  const tijden = { deadlineMs: deps.deadlineMs ?? DEADLINE_MS, killGraceMs: deps.killGraceMs ?? KILL_GRACE_MS };
  const uitslag = await wachtOpScript(startScript(deps, log), tijden);
  const s = seconden(Date.now() - begin);
  if (uitslag.afgebroken)
    return `✗ toolchain niet hersteld: na ${s} s afgebroken (procesgroep gestopt). Log: ${log} → ${PROBLEMEN}`;
  if (uitslag.exit !== '0')
    return `✗ toolchain niet hersteld (scripts/cloud-setup.sh exit ${uitslag.exit}, ${s} s): omgevingscache van vóór een pin-bump? Log: ${log} → ${PROBLEMEN}`;
  return (
    `✓ toolchain hersteld in ${s} s: ${delen.join(', ')} (omgevingscache van vóór een pin-bump; elke nieuwe sessie ` +
    'herhaalt dit tot het veld "Setup script" wijzigt, docs/ENVIRONMENT.md, Problemen)'
  );
}

/** @param {unknown} payload */
const isStartup = (payload) =>
  typeof payload === 'object' && payload !== null && 'source' in payload && payload.source === 'startup';

/**
 * De hook. Alleen in de cloud (`CLAUDE_CODE_REMOTE=true`) en bij `source: startup`; anders geen proces en geen uitvoer.
 * Eindigt altijd met exit 0 en hooguit één regel (spec, Hergebruik en UX).
 * @param {unknown} payload @param {HerstelDeps} deps
 * @returns {Promise<Uitslag>}
 */
export async function toolchainHerstel(payload, deps) {
  if (deps.env['CLAUDE_CODE_REMOTE'] !== 'true' || !isStartup(payload)) return { exit: 0 };
  const home = deps.env['HOME'] ?? homedir();
  const detectie = detecteer(deps, home);
  if (detectie.soort === 'klopt') return { exit: 0 };
  if (detectie.soort === 'stop') return { stdout: `${detectie.regel}\n`, exit: 0 };
  const anker = deps.env['RAILS_ANKER'] ?? '';
  if (!OID.test(anker))
    return { stdout: `! toolchain niet hersteld: geen anker om de invoer met main te vergelijken; ${VELD}\n`, exit: 0 };
  const paden = afwijkend(deps, anker);
  if (paden.length > 0)
    return {
      stdout: `! toolchain niet hersteld: ${noem(paden)} wijken af van main (${anker.slice(0, 12)}); ${VELD}\n`,
      exit: 0,
    };
  return { stdout: `${await herstel(deps, detectie.delen, home)}\n`, exit: 0 };
}
