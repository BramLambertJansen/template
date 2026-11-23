// Reviewpakket (spec agents-leveren, punt 1d): `node scripts/kit/reviewpakket.mjs [--basis <ref>] [--sinds <sha>] [--spec <pad>]`.
// Schrijft één Markdown-bestand met de koppen `# Reviewpakket <branch> @ <sha7>`, `Basis:` (of eerst `Fixdiff sinds:`),
// `## Spec`, `## Log`, `## Stat` en `## Diff` naar `.reviewpakket/` in de repo-root (OV-4) en zet het relatieve pad als
// enige regel op stdout. De basis is `git merge-base <--basis|origin/main> HEAD`; met `--sinds` lopen Log, Stat en Diff
// vanaf die commit (re-review). Gegenereerde bestanden staan alleen in Stat, met een regel `Weggelaten …` (OV-5).
// Refs worden vóór gebruik gevalideerd (geen leidend `-`, geen shell-tekens, `git rev-parse --verify`); git draait altijd via
// execFileSync zonder shell. Getest in test/scripts/reviewpakket.test.ts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAP = '.reviewpakket';
// Altijd gegenereerd (OV-5); daarbij komt de lijst `gegenereerd` uit `.claude/gates.json` van de repo, als die er is.
const VAST_GEGENEREERD = ['db/schema.snapshot.sql', 'pnpm-lock.yaml', '.github/CODEOWNERS'];
const SPEC_PAD = /^docs\/(template\/)?specs\/(?!_)[^/]+\.md$/;
const GELDIGE_REF = /^[A-Za-z0-9_][A-Za-z0-9._/~^@{}-]*$/;
const OPTIES = ['--basis', '--sinds', '--spec'];
const WERKMAP_MELDING = 'de werkmap heeft niet-gecommitte wijzigingen; die staan niet in het pakket';

class Stop extends Error {}

/** @param {string} cwd @param {readonly string[]} args */
function git(cwd, args) {
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const opties = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 };
  return execFileSync('git', args, opties);
}

/** @param {string} cwd @param {readonly string[]} args */
function gitLukt(cwd, args) {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/** @param {readonly string[]} argv @returns {Record<string, string>} */
function leesOpties(argv) {
  /** @type {Record<string, string>} */
  const opties = {};
  for (let i = 0; i < argv.length; i += 2) {
    const naam = argv[i] ?? '';
    if (!OPTIES.includes(naam)) throw new Stop(`onbekende optie ${naam}`);
    opties[naam.slice(2)] = argv[i + 1] ?? '';
  }
  return opties;
}

/** Volledige sha van een geldige ref, anders een Stop. @param {string} cwd @param {string} ref */
function commitVan(cwd, ref) {
  if (!GELDIGE_REF.test(ref)) throw new Stop(`ongeldige ref ${ref}`);
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim();
  } catch {
    throw new Stop(`ongeldige ref ${ref}`);
  }
}

/** @param {string} cwd */
function branchVan(cwd) {
  try {
    return git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']).trim() || 'detached';
  } catch {
    return 'detached';
  }
}

/** @param {string} root */
function gegenereerdeLijst(root) {
  const gates = path.join(root, '.claude/gates.json');
  if (!existsSync(gates)) return VAST_GEGENEREERD;
  /** @type {unknown} */
  const json = JSON.parse(readFileSync(gates, 'utf8'));
  const lijst = typeof json === 'object' && json !== null && 'gegenereerd' in json ? json.gegenereerd : [];
  const extra = Array.isArray(lijst) ? lijst.filter((x) => typeof x === 'string') : [];
  return [...new Set([...VAST_GEGENEREERD, ...extra])];
}

/** @param {string} root @param {Record<string, string>} opties */
function bereik(root, opties) {
  const head = commitVan(root, 'HEAD');
  const basisRef = opties['basis'] ?? 'refs/remotes/origin/main';
  const basisCommit = commitVan(root, basisRef);
  const basis = git(root, ['merge-base', basisCommit, head]).trim();
  const sindsRef = opties['sinds'];
  if (sindsRef === undefined) return { head, basis, van: basis, sinds: null };
  const sinds = commitVan(root, sindsRef);
  if (!gitLukt(root, ['merge-base', '--is-ancestor', sinds, head])) {
    throw new Stop(`${sindsRef} is geen voorouder van HEAD; geef de laatst gereviewde commit`);
  }
  return { head, basis, van: sinds, sinds };
}

/** Langste reeks backticks in de tekst plus één, minstens drie. @param {string} tekst */
function hek(tekst) {
  const langste = Math.max(0, ...[...tekst.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, langste + 1));
}

/** @param {string} tekst @param {string} taal */
function blok(tekst, taal) {
  const inhoud = tekst.replace(/\n+$/, '');
  const h = hek(inhoud);
  return [`${h}${taal}`, inhoud, h];
}

/** @param {readonly string[]} gewijzigd @param {string | undefined} spec */
function specRegels(gewijzigd, spec) {
  if (spec !== undefined) return [spec];
  const specs = gewijzigd.filter((pad) => SPEC_PAD.test(pad));
  return specs.length > 0 ? specs : ['geen spec in de diff'];
}

/** @param {string} root @param {string} range @param {readonly string[]} gewijzigd */
function diffRegels(root, range, gewijzigd) {
  const lijst = gegenereerdeLijst(root);
  const weg = gewijzigd.filter((pad) => lijst.includes(pad)).sort();
  const uitsluiting = weg.map((pad) => `:(exclude,literal)${pad}`);
  const diff = git(root, ['diff', range, '--', '.', ...uitsluiting]);
  const regels = diff.trim() === '' ? [] : blok(diff, 'diff');
  return weg.length > 0 ? [...regels, '', `Weggelaten (gegenereerd, staat in Stat): ${weg.join(', ')}`] : regels;
}

/**
 * @param {string} root
 * @param {{ head: string, basis: string, van: string, sinds: string | null }} b
 * @param {Record<string, string>} opties
 */
function pakket(root, b, opties) {
  const range = `${b.van}..${b.head}`;
  const log = git(root, ['log', '--oneline', range]);
  if (log.trim() === '') throw new Stop(`geen commits in ${b.van.slice(0, 7)}..HEAD`);
  const gewijzigd = git(root, ['diff', '--name-only', range]).split('\n').filter(Boolean);
  const kop = [`# Reviewpakket ${branchVan(root)} @ ${b.head.slice(0, 7)}`];
  if (b.sinds !== null) kop.push(`Fixdiff sinds: ${b.sinds.slice(0, 7)}`);
  kop.push(`Basis: ${b.basis.slice(0, 7)}`);
  return [
    ...kop,
    '',
    '## Spec',
    '',
    ...specRegels(gewijzigd, opties['spec']),
    '',
    '## Log',
    '',
    ...blok(log, 'text'),
    '',
    '## Stat',
    '',
    ...blok(git(root, ['diff', '--stat', range]), 'text'),
    '',
    '## Diff',
    '',
    ...diffRegels(root, range, gewijzigd),
    '',
  ].join('\n');
}

/** @param {string} root @param {{ head: string, sinds: string | null }} b */
function bestandsnaam(root, b) {
  const branch = branchVan(root).replace(/[^A-Za-z0-9._-]/g, '-');
  const fix = b.sinds === null ? '' : `-fix-${b.sinds.slice(0, 7)}`;
  return `${MAP}/${branch}-${b.head.slice(0, 7)}${fix}.md`;
}

/** @param {string} root */
function werkmapVuil(root) {
  const status = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
  return status.some((regel) => !regel.slice(3).startsWith(`${MAP}/`));
}

/** @param {readonly string[]} argv @param {string} cwd */
export function maakPakket(argv, cwd) {
  const opties = leesOpties(argv);
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const b = bereik(root, opties);
  const tekst = pakket(root, b, opties);
  const vuil = werkmapVuil(root);
  const rel = bestandsnaam(root, b);
  mkdirSync(path.join(root, MAP), { recursive: true });
  // Ook zonder regel in de .gitignore van de repo blijft de map buiten git status.
  writeFileSync(path.join(root, MAP, '.gitignore'), '*\n');
  writeFileSync(path.join(root, rel), tekst);
  return { rel, vuil };
}

/** @param {readonly string[]} argv */
function main(argv) {
  try {
    const { rel, vuil } = maakPakket(argv, process.cwd());
    if (vuil) process.stderr.write(`reviewpakket: ${WERKMAP_MELDING}\n`);
    process.stdout.write(`${rel}\n`);
  } catch (fout) {
    process.stderr.write(`reviewpakket: ${fout instanceof Error ? fout.message : String(fout)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
