import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';

// Gedeelde onderdelen voor de acceptatietests van docs/specs/taakmandaat-vervolg.md (mandate-follow-up/AC-1 t/m AC-25).
// Echte tijdelijke Git-repositories; GitHub-gegevens komen van een `gh`-stub (geen netwerk), zoals de spec voorschrijft.

export const REPOSITORY = 'BramLambertJansen/template';
export const BRANCH = 'feat/example';
export const SOURCE = 'src/core/web/ui/example.tsx';
export const S1 = 'docs/specs/s1.md';
export const S2 = 'docs/specs/s2.md';
export const S3 = 'docs/specs/s3.md';
export const ADR = 'docs/adr/0001-voorbeeld.md';
export const ROADMAP = 'docs/roadmap.md';
export const PR = 130;
export const KOP = '# Roadmap\n\n## Stuk\n\n';

const GATES = readFileSync('.claude/gates.json', 'utf8');
const directories: string[] = [];

export function opruimen(): void {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

export function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function write(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

export function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

export function commit(root: string, message = 'test: fixture'): string {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

export function specBody(name: string, status = 'goedgekeurd'): string {
  return `---\nstatus: ${status}\nnamespace: ${name}\n---\n\n# Spec ${name}\n\n## Hergebruik en UX\n\nBestaande kit.\n`;
}

export function roadmapTekst(regels: string[]): string {
  return `${KOP}${regels.join('\n')}\n`;
}

export function openItem(spec: string, tekst = 'Taak voor'): string {
  return `- [ ] ${tekst} \`${spec}\``;
}

export function doneItem(spec: string, bewijs = ` (#${String(PR)})`, tekst = 'Taak voor'): string {
  return `- [x] ${tekst} \`${spec}\`${bewijs}`;
}

/** De standaard roadmap: items van S1 en S2 (regel 5 en 6), een oud afgevinkt item en een toelichting. */
export function basisRoadmap(): string[] {
  return [openItem(S1), openItem(S2), '- [x] Oud werk (#5)', '', 'Toelichting.'];
}

/** Het bestand `.claude/decisions.json` voor de gegeven specs (mandaten); `branch` is de branch van het besluit. */
function decisions(mandated: string[], branch: string): string {
  return JSON.stringify({
    version: 1,
    requiredChecks: ['gate:fast'],
    decisions: mandated.map((file) => ({
      file,
      digest: documentInfo(file, specBody(path.basename(file, '.md')))?.digest,
      repository: REPOSITORY,
      branch,
      status: 'goedgekeurd',
      paths: [SOURCE],
    })),
  });
}

export interface Opties {
  /** Specs die op main `goedgekeurd` zijn; de rest van deze lijst heeft een mandaat als `mandaat` ze noemt. */
  specs: string[];
  mandaat: string[];
  roadmap: string[];
  /** Geen `.claude/decisions.json` (AC-7). */
  zonderRegister?: boolean;
  /** Branch in het besluit; afwijkend van `BRANCH` betekent: geen actief mandaat op deze branch. */
  besluitBranch?: string;
}

export interface Fixture {
  root: string;
  base: string;
}

/** main (= origin/main) met specs, roadmap, gates en register; daarna de branch `feat/example`. */
export function maakRepo(opties: Opties): Fixture {
  const root = tempDir('mandate-follow-up-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['remote', 'add', 'origin', `https://github.com/${REPOSITORY}.git`]);
  for (const spec of opties.specs) write(root, spec, specBody(path.basename(spec, '.md')));
  write(root, ADR, '# 0001 — Voorbeeld\n\nStatus: voorgesteld\n');
  write(root, ROADMAP, roadmapTekst(opties.roadmap));
  write(root, SOURCE, 'export const version = 1;\n');
  write(root, 'README.md', 'Voorbeeld.\n');
  write(root, 'package.json', '{\n  "scripts": { "test:unit": "vitest" }\n}\n');
  write(root, '.claude/gates.json', GATES);
  if (opties.zonderRegister !== true)
    write(root, '.claude/decisions.json', decisions(opties.mandaat, opties.besluitBranch ?? BRANCH));
  const base = commit(root, 'baseline');
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(root, ['switch', '-q', '-c', BRANCH]);
  return { root, base };
}

// GEWIJZIGD (spec gebouwd-zonder-nummer, ADR 0095): de hulpen voor `pnpm docs:status` (`bouw`, `ghStub`, `draaiDocsStatus`,
// `maakSymlink`, `builtLine`, `statusOnly`) zijn weg met het script en de tests die ze gebruikten.

// --- modules laden zonder statische import (de nieuwe exports bestaan nog niet; zie check-roadmap.test.ts) ---------

export async function exportVan(module: string, naam: string): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ module);
  if (typeof geladen !== 'object' || geladen === null) throw new Error(`${module} levert geen module`);
  if (!(naam in geladen)) throw new Error(`${module} exporteert ${naam} niet`);
  const waarde: unknown = Reflect.get(geladen, naam);
  return waarde;
}

export async function roep(module: string, naam: string, ...args: unknown[]): Promise<unknown> {
  const functie = await exportVan(module, naam);
  if (typeof functie !== 'function') throw new Error(`${module} exporteert ${naam} niet als functie`);
  const resultaat: unknown = await Reflect.apply(functie, undefined, args);
  return resultaat;
}

export const CHECK_ROADMAP = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');

export function testpaden(): string[] {
  const json: unknown = JSON.parse(GATES);
  if (typeof json !== 'object' || json === null || !('testpaden' in json) || !Array.isArray(json.testpaden))
    throw new Error('gates.json zonder testpaden');
  const lijst: unknown[] = json.testpaden;
  return lijst.map(String);
}

/** De sleutels van `roadmapVanRepo(root, 'origin/main')`. */
export async function roadmapSleutels(root: string): Promise<string[]> {
  const resultaat = await roep(CHECK_ROADMAP, 'roadmapVanRepo', root, 'origin/main');
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map((melding) => {
    if (typeof melding === 'object' && melding !== null && 'key' in melding && typeof melding.key === 'string')
      return melding.key;
    throw new Error('geen melding met key');
  });
}
