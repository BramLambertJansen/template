// Leerpunt #432: wat de guard of een hook draait, laadt alleen Node-builtins en eigen bestanden in de repo.
// De guard-jobs in .github/workflows/guard.yml draaien zonder install (ADR 0045 punt 15–19) en de hooks draaien de
// gehashte bestanden van main, buiten node_modules om (R-ROL-09). Een npm-pakket faalt daar met ERR_MODULE_NOT_FOUND,
// terwijl lint, typecheck en unit-tests lokaal groen blijven. Deze module loopt de importgraaf af met
// dependency-cruiser (een parser, R-CODE-01) vanaf alle ingangen. Hij draait zelf alleen in de tests
// (test/rails/guard-imports.test.ts) en hoort dus niet bij die graaf.
// Bekend gat: een dynamische import met een berekende naam (`import(naam)`) is statisch niet te zien.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cruise } from 'dependency-cruiser';

const workflow = '.github/workflows/guard.yml';
const hookDirs = ['.claude/hooks', 'rails/hooks'];
// `node <script>` in een run-stap, ook in een blok met meerdere regels of na `;`, `&&`, `|`.
const nodeRun = /(?:^|[\s;&|])node\s+([\w./-]+\.(?:mjs|cjs|js))\b/g;
// node:module geeft createRequire en register: daarmee laadt code een pakket buiten de importgraaf om.
const forbiddenBuiltins = new Set(['module']);

/**
 * Ingangen relatief aan baseDir, gesorteerd: elk script dat guard.yml met `node` start, plus elke `.mjs` direct in
 * een hookmap (de lader start `rails/hooks/<naam>.mjs`, de stubs staan in `.claude/hooks`).
 * @param {string} baseDir
 */
export function guardEntries(baseDir) {
  const entries = new Set();
  const yml = path.join(baseDir, workflow);
  if (existsSync(yml))
    for (const match of readFileSync(yml, 'utf8').matchAll(nodeRun)) entries.add(path.posix.normalize(match[1] ?? ''));
  for (const dir of hookDirs) {
    const full = path.join(baseDir, dir);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.mjs')) entries.add(`${dir}/${entry.name}`);
    }
  }
  return [...entries].sort();
}

/**
 * Elke import in de graaf vanaf guardEntries die zonder install of buiten de repo niet laadt.
 * @param {string} baseDir
 * @returns {Promise<{ from: string, to: string, reason: 'npm-pakket' | 'node:module' }[]>}
 */
export async function guardImportViolations(baseDir) {
  const entries = guardEntries(baseDir);
  if (entries.length === 0) throw new Error(`geen ingangen gevonden onder ${baseDir}`);
  const { output } = await cruise(entries, { baseDir, doNotFollow: { path: 'node_modules' } });
  if (typeof output === 'string') throw new Error('dependency-cruiser gaf geen resultaatobject');
  /** @type {{ from: string, to: string, reason: 'npm-pakket' | 'node:module' }[]} */
  const violations = [];
  for (const module of output.modules) {
    if (module.coreModule === true || inNodeModules(module.source)) continue;
    for (const dependency of module.dependencies) {
      const reason = dependency.coreModule
        ? forbiddenBuiltins.has(dependency.module.replace(/^node:/, ''))
          ? 'node:module'
          : null
        : ownFile(dependency)
          ? null
          : 'npm-pakket';
      if (reason !== null) violations.push({ from: module.source, to: dependency.module, reason });
    }
  }
  return violations.sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`));
}

/** @param {string} file */
function inNodeModules(file) {
  return file.split('/').includes('node_modules');
}

/** Een opgelost bestand in de repo, buiten node_modules; een kaal pakket of iets onoplosbaars is dat nooit.
 * @param {{ couldNotResolve: boolean, resolved: string, dependencyTypes: string[] }} dependency */
function ownFile(dependency) {
  if (dependency.couldNotResolve || inNodeModules(dependency.resolved)) return false;
  return (
    dependency.dependencyTypes.includes('local') &&
    !path.isAbsolute(dependency.resolved) &&
    !dependency.resolved.startsWith('..')
  );
}
