// Alleen git-data uit de vertrouwde basis; hooks doen geen netwerkwerk (ADR 0046).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { anker, vertrouwdeCommit, vertrouwdeTekst, vertrouwdeTekstOptioneel } from './objecten.mjs';
import { canonicalPath, readRegistry } from './task-authority.mjs';

/** @param {string} root @param {string[]} args */
export function gitText(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** @param {string} remote */
export function repositoryName(remote) {
  const ssh = /^git@github\.com:([\w-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)?.[1];
  if (ssh !== undefined) return ssh;
  try {
    const url = new URL(remote);
    const name = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    return url.hostname === 'github.com' && ['https:', 'ssh:'].includes(url.protocol) && /^[\w-]+\/[\w.-]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/** @param {string} root @param {string} file */
export function safeRepositoryPath(root, file) {
  if (!canonicalPath(file)) return false;
  try {
    if (realpathSync(root) !== path.resolve(root)) return false;
    let current = root;
    for (const part of file.split('/')) {
      current = path.join(current, part);
      const state = pathState(current);
      if (state !== 'plain') return state === 'missing';
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {string} file */
function pathState(file) {
  try {
    return lstatSync(file).isSymbolicLink() ? 'unsafe' : 'plain';
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unsafe';
  }
}

/** @param {string} root @param {string} file */
function workingText(root, file) {
  if (!safeRepositoryPath(root, file)) return null;
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
}

/**
 * De vertrouwde basis: binnen een hook het anker van de stub-lader (ADR 0045), gecontroleerd gelezen; daarbuiten `base` of
 * origin/main. Een gezet maar ongeldig anker geeft null (nooit terugval op origin/main, die een agent kan ombuigen).
 * `readOptional` (spec app-padtabel) onderscheidt afwezig (`{ afwezig: true }`) van onleesbaar (gooit): in een hook gecontroleerd
 * met `vertrouwdeTekstOptioneel`, daarbuiten door de trees op het pad te lezen (`gitOptioneel`). In het type optioneel: een basisobject van een oudere
 * aanroeper of een teststub heeft het niet (de lezer beslist dan zelf, zie rolhek-context.mjs `configuratie`).
 * @param {string} root @param {string | undefined} base
 * @returns {{ sha: string, read: (file: string) => string | null, readOptional?: (file: string) => string | { afwezig: true } } | null}
 */
export function trustedBase(root, base) {
  const vast = base === undefined ? anker() : null;
  if (vast !== null)
    return vertrouwdeCommit(root, vast)
      ? {
          sha: vast,
          read: (file) => vertrouwdeTekst(root, vast, file),
          readOptional: (file) => vertrouwdeTekstOptioneel(root, vast, file),
        }
      : null;
  // De volle naam: een korte `origin/main` kan een lokale branch `refs/heads/origin/main` schaduwen (leerpunt #932).
  const sha = gitText(root, ['rev-parse', '--verify', `${base ?? 'refs/remotes/origin/main'}^{commit}`])?.trim() ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  return { sha, read: (file) => gitText(root, ['show', `${sha}:${file}`]), readOptional: (file) => gitOptioneel(root, sha, file) };
}

/** Git zonder vangnet: een fout (ontbrekend of kapot object) gooit. @param {string} root @param {string[]} args */
function gitStrikt(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/**
 * De rij `naam` in de tree `boom` (`git ls-tree -z`); null als de tree leesbaar is en de naam er niet in staat. Een onleesbare
 * tree gooit.
 * @param {string} root @param {string} boom @param {string} naam @returns {{ mode: string, type: string, oid: string } | null}
 */
function boomRij(root, boom, naam) {
  for (const regel of gitStrikt(root, ['ls-tree', '-z', '--full-tree', boom]).split('\0')) {
    const match = /^(\d{6}) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(regel);
    if (match?.[4] === naam) return { mode: match[1] ?? '', type: match[2] ?? '', oid: match[3] ?? '' };
  }
  return null;
}

/**
 * Een bestand uit commit `sha` buiten een hook: `{ afwezig: true }` alleen als een leesbare tree op het pad de naam niet heeft;
 * elke tree op het pad wordt gelezen (ontbrekend of kapot gooit), en het pad moet eindigen in een gewone blob (100644/100755) die
 * te lezen is. Een symlink, gitlink, tree of niet-tree onderweg gooit.
 * @param {string} root @param {string} sha @param {string} file @returns {string | { afwezig: true }}
 */
function gitOptioneel(root, sha, file) {
  const delen = file.split('/');
  let boom = gitStrikt(root, ['rev-parse', '--verify', `${sha}^{tree}`]).trim();
  for (const [index, naam] of delen.entries()) {
    const rij = boomRij(root, boom, naam);
    if (rij === null) return { afwezig: true };
    if (index < delen.length - 1) {
      if (rij.mode !== '040000') throw new Error(`${file} in ${sha}: ${naam} is geen map (${rij.mode})`);
      boom = rij.oid;
      continue;
    }
    if (!['100644', '100755'].includes(rij.mode)) throw new Error(`${file} in ${sha} is geen gewoon bestand (${rij.mode})`);
    return gitStrikt(root, ['cat-file', 'blob', rij.oid]);
  }
  throw new Error(`${file} is geen pad`);
}

/**
 * @param {{ root: string, base?: string, repository?: string, branch?: string }} config
 * @returns {import('./task-authority.mjs').Authority | null}
 */
export function readAuthority(config) {
  const basis = trustedBase(config.root, config.base);
  const repository = config.repository ?? repositoryName(gitText(config.root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  const branch = config.branch ?? gitText(config.root, ['branch', '--show-current'])?.trim() ?? null;
  if (basis === null || repository === null || branch === null) return null;
  const registryText = basis.read('.claude/decisions.json');
  // Voor de eerste template-update bestaan er nog geen besluiten. Dat geeft geen extra bevoegdheid.
  const registry = registryText === null ? { version: 1, requiredChecks: [], decisions: [] } : readRegistry(registryText);
  return {
    registry, repository, branch,
    trusted: (file) => canonicalPath(file) ? basis.read(file) : null,
    working: (file) => workingText(config.root, file),
    safe: (file) => safeRepositoryPath(config.root, file),
  };
}
