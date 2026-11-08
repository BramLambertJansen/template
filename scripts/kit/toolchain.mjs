// Preflight van de toolchain (docs/ENVIRONMENT.md): vóór een script modules met dependencies laadt, één leesbare regel in
// plaats van een stacktrace als Node niet de versie uit mise.toml is of node_modules ontbreekt of onvolledig is (verse cloudsessie zonder setup, onderbroken install).
// Zonder dependencies, zodat het ook op een kale Node draait.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Zelfde major en minstens de versie uit mise.toml; dat valt binnen `engines` in package.json (`>=26.11 <27`).
 * @param {string} node
 * @param {string} verwacht
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

const BOOTSTRAP = '`scripts/bootstrap.sh`';
const WORKTREE_INSTALL = '`node scripts/kit/worktree-install.mjs`';

/**
 * Per probleem het herstel (spec claude-sandbox-werkstraat AC-12): één regel, segmenten gescheiden door '; ', elk segment
 * "probleem → herstel". In de hoofdcheckout is elk herstel de bootstrap. In een gekoppelde worktree is een ontbrekende
 * node_modules iets wat de agent zelf herstelt; Node en pnpm blijven bij de eigenaar.
 * @param {{ reden: string, nodeModules?: boolean }[]} problemen
 * @param {boolean} worktree
 */
function setupProbleem(problemen, worktree) {
  const delen = problemen.map(({ reden, nodeModules }) => {
    const herstel = worktree && nodeModules === true ? WORKTREE_INSTALL : BOOTSTRAP;
    return `${reden} → draai ${herstel}`;
  });
  const cloud = worktree ? '' : ', in de cloud `bash scripts/cloud-setup.sh`';
  return `✗ toolchain ontbreekt: ${delen.join('; ')}${cloud}, zie docs/ENVIRONMENT.md`;
}

/** @typedef {{ reden: string, nodeModules?: boolean }} Probleem */

/**
 * @param {{ node: string, miseToml: string, nodeModules: boolean }} feiten
 * @returns {Probleem[]}
 */
function nodeProblemen({ node, miseToml, nodeModules }) {
  const verwacht = /^node\s*=\s*"([^"]+)"/m.exec(miseToml)?.[1];
  /** @type {Probleem[]} */
  const problemen = [];
  if (verwacht !== undefined && !passend(node, verwacht))
    problemen.push({ reden: `Node ${node}, verwacht ${verwacht} of nieuwer binnen dezelfde major (mise.toml)` });
  if (!nodeModules) problemen.push({ reden: 'node_modules ontbreekt of is onvolledig', nodeModules: true });
  return problemen;
}

/**
 * @param {{ node: string, miseToml: string, nodeModules: boolean, worktree?: boolean }} feiten
 *   `worktree`: gekoppelde worktree (`.git` is een bestand); weggelaten = hoofdcheckout.
 * @returns {string | null}
 */
export function toolchainProbleem({ node, miseToml, nodeModules, worktree = false }) {
  const problemen = nodeProblemen({ node, miseToml, nodeModules });
  return problemen.length === 0 ? null : setupProbleem(problemen, worktree);
}

/** @param {string} root */
function pnpmPin(root) {
  try {
    /** @type {unknown} */
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof pkg !== 'object' || pkg === null || !('packageManager' in pkg) || typeof pkg.packageManager !== 'string')
      return null;
    return /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(pkg.packageManager)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @returns {Probleem | null}
 */
function pnpmProbleem(root) {
  const verwacht = pnpmPin(root);
  if (verwacht === null) return { reden: 'packageManager moet een exacte pnpm@x.y.z-versie bevatten' };
  const result = spawnSync('pnpm', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined || result.status !== 0)
    return { reden: `pnpm ontbreekt of start niet, verwacht ${verwacht}` };
  const werkelijk = result.stdout.trim().replace(/\s+/g, ' ').slice(0, 120) || 'onbekend';
  return werkelijk === verwacht ? null : { reden: `pnpm ${werkelijk}, verwacht exact ${verwacht} (packageManager)` };
}

// Snelle aanwezigheidscontrole: deze bestanden bewijzen geen synchronisatie met lockfile of workspace.
// Voor run/exec controleert pnpm dat zelf met verifyDepsBeforeRun: error (pnpm-workspace.yaml).
const INSTALLATIE = ['.modules.yaml', 'typescript/package.json'];

/**
 * Gekoppelde worktree: `.git` is een bestand (in de hoofdcheckout een map).
 * @param {string} root
 */
function isWorktree(root) {
  try {
    return statSync(path.join(root, '.git')).isFile();
  } catch {
    return false;
  }
}

/** @param {string} root */
export function toolchainProbleemIn(root) {
  const worktree = isWorktree(root);
  const mise = path.join(root, 'mise.toml');
  const problemen = nodeProblemen({
    node: process.version,
    miseToml: existsSync(mise) ? readFileSync(mise, 'utf8') : '',
    nodeModules: INSTALLATIE.every((rel) => existsSync(path.join(root, 'node_modules', rel))),
  });
  // pnpm wordt ook gecontroleerd als node_modules ontbreekt: beide staan dan in één regel, elk met eigen herstel.
  // Ook een ontbrekende of ongeldige packageManager-pin staat erbij, met herstel scripts/bootstrap.sh.
  const pnpm = pnpmProbleem(root);
  if (pnpm !== null) problemen.push(pnpm);
  return problemen.length === 0 ? null : setupProbleem(problemen, worktree);
}
