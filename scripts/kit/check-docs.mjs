// check-docs (framework §10, ADR 0011), via de ratchet (scripts/kit/ratchet.mjs): proza mag niet wijzen naar iets dat
// niet bestaat, en de gespiegelde lijsten mogen niet uit elkaar lopen.
//  1. Elk pad en elk `pnpm <script>` tussen backticks in AGENTS.md, CLAUDE.md en .claude/**/*.md bestaat
//     (een kale naam of relatief pad telt als een bestand in git erop eindigt; `/route` is een URL, geen pad).
//  2. Relatieve links in docs/**/*.md en README.md wijzen naar een bestaand bestand.
//  3. ADR- en spec-statussen komen uit de vaste woordenlijst; een goedgekeurde of gebouwde spec heeft "Hergebruik en UX".
//  4. CODEOWNERS en `ask` in .claude/settings.json noemen dezelfde paden (CODEOWNERS daarnaast tests en docs/specs/).
// Nog niet: de vergelijking met .claude/gates.json (komt met de rolhek-hook, roadmap stuk 5).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ key: string, message: string }} Violation */

const ADR_STATUS = /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m;
const SPEC_STATUS = /^status:\s*(voorstel|goedgekeurd|gebouwd|vervallen)\b/m;
// Pakketbeheer-commando's van pnpm zelf, geen scripts uit package.json.
const PNPM_COMMANDS = new Set(['add', 'install', 'i', 'update', 'up', 'remove', 'rm', 'exec', 'dlx', 'run', 'why']);
// In CODEOWNERS, niet in `ask`: daar schrijft de agent (framework §10).
const OWNERS_ONLY = new Set(['**/*.test.*', '**/*.spec.*', 'e2e/**', 'docs/specs/**', 'db/tests/**']);

/** @param {string} root */
function trackedFiles(root) {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

/**
 * @param {string} root
 * @returns {Promise<Violation[]>}
 */
export async function docsViolations(root = '.') {
  const files = trackedFiles(root);
  /** @param {string} file */
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  return Promise.resolve([
    ...identifierViolations(files, read),
    ...linkViolations(root, files, read),
    ...statusViolations(files, read),
    ...mirrorViolations(files, read),
  ]);
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function identifierViolations(files, read) {
  const scripts = Object.keys(packageScripts(read('package.json')));
  const sources = [
    'AGENTS.md',
    'CLAUDE.md',
    ...files.filter((file) => file.startsWith('.claude/') && file.endsWith('.md')),
  ];
  return sources
    .filter((file) => files.includes(file))
    .flatMap((file) =>
      [...read(file).matchAll(/`([^`\n]+)`/g)].flatMap(([, id = '']) => {
        const script = /^pnpm ([\w:-]+)/.exec(id)?.[1];
        if (script !== undefined && !PNPM_COMMANDS.has(script) && !scripts.includes(script))
          return [
            {
              key: `docs:${file}:script:${script}`,
              message: `${file}: \`pnpm ${script}\` bestaat niet in package.json`,
            },
          ];
        if (!looksLikePath(id) || pathExists(id, files)) return [];
        return [{ key: `docs:${file}:pad:${id}`, message: `${file}: \`${id}\` bestaat niet in de repo` }];
      }),
    );
}

/** @param {string} text */
function packageScripts(text) {
  /** @type {unknown} */
  const pkg = JSON.parse(text);
  if (
    typeof pkg !== 'object' ||
    pkg === null ||
    !('scripts' in pkg) ||
    typeof pkg.scripts !== 'object' ||
    pkg.scripts === null
  )
    return {};
  return { ...pkg.scripts };
}

/** @param {string} id */
function looksLikePath(id) {
  if (id.startsWith('/') || /[*<>{}…\s]/.test(id)) return false;
  return /^[\w.#-]*\/[\w.\-/]*$/.test(id) || /^[\w.-]+\.(md|ts|tsx|mjs|js|json|yaml|yml|sql|sh|css|toml)$/.test(id);
}

/**
 * @param {string} id
 * @param {readonly string[]} files
 */
function pathExists(id, files) {
  const target = id
    .replace(/^#(core|web|shared|api)\//, 'src/$1/')
    .replace(/^#core\//, 'src/core/')
    .replace(/\/$/, '');
  return files.some(
    (file) =>
      file === target || file.endsWith(`/${target}`) || file.startsWith(`${target}/`) || file.includes(`/${target}/`),
  );
}

/**
 * @param {string} root
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function linkViolations(root, files, read) {
  return files
    .filter((file) => (file.startsWith('docs/') || file === 'README.md') && file.endsWith('.md'))
    .flatMap((file) =>
      [...read(file).matchAll(/\]\(([^)\s]+)\)/g)].flatMap(([, link = '']) => {
        if (/^(https?:|mailto:|#)/.test(link)) return [];
        const target = path.join(path.dirname(file), decodeURIComponent(link.split('#')[0] ?? ''));
        if (existsSync(path.join(root, target))) return [];
        return [{ key: `docs:${file}:link:${link}`, message: `${file}: link naar ${link} wijst naar niets` }];
      }),
    );
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusViolations(files, read) {
  const adrs = files.filter((file) => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(file));
  const specs = files.filter((file) => /^docs\/specs\/[^_/][^/]*\.md$/.test(file));
  return [
    ...adrs
      .filter((file) => !ADR_STATUS.test(read(file)))
      .map((file) => ({
        key: `docs:${file}:status`,
        message: `${file}: status niet uit voorgesteld | geaccepteerd | vervangen door NNNN | vervallen`,
      })),
    ...specs.flatMap((file) => {
      const text = read(file);
      const status = SPEC_STATUS.exec(text)?.[1];
      if (status === undefined)
        return [
          {
            key: `docs:${file}:status`,
            message: `${file}: status niet uit voorstel | goedgekeurd | gebouwd | vervallen`,
          },
        ];
      const reuse = /^## Hergebruik en UX\n+(?!##)\S/m.test(text);
      if ((status === 'goedgekeurd' || status === 'gebouwd') && !reuse)
        return [
          {
            key: `docs:${file}:hergebruik`,
            message: `${file}: ${status}, maar de sectie "Hergebruik en UX" ontbreekt of is leeg`,
          },
        ];
      return [];
    }),
  ];
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function mirrorViolations(files, read) {
  if (!files.includes('.github/CODEOWNERS') || !files.includes('.claude/settings.json')) return [];
  const owners = new Set(
    read('.github/CODEOWNERS')
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((entry) => entry !== '' && !entry.startsWith('#'))
      .map((entry) => entry.replace(/^\//, '').replace(/\/$/, '/**')),
  );
  const ask = new Set(askEditPaths(read('.claude/settings.json')));
  return [
    ...[...owners]
      .filter((entry) => !OWNERS_ONLY.has(entry) && !ask.has(entry))
      .map((entry) => ({
        key: `docs:spiegel:ask:${entry}`,
        message: `CODEOWNERS noemt ${entry}, \`ask\` in .claude/settings.json niet`,
      })),
    ...[...ask]
      .filter((entry) => !owners.has(entry))
      .map((entry) => ({
        key: `docs:spiegel:codeowners:${entry}`,
        message: `\`ask\` noemt ${entry}, CODEOWNERS niet`,
      })),
  ];
}

/**
 * De paden uit `Edit(…)` in `permissions.ask`.
 * @param {string} text
 * @returns {string[]}
 */
function askEditPaths(text) {
  /** @type {unknown} */
  const settings = JSON.parse(text);
  const permissions =
    typeof settings === 'object' && settings !== null && 'permissions' in settings ? settings.permissions : undefined;
  const ask = typeof permissions === 'object' && permissions !== null && 'ask' in permissions ? permissions.ask : [];
  return (Array.isArray(ask) ? ask : [])
    .map((entry) => (typeof entry === 'string' ? /^Edit\((.+)\)$/.exec(entry)?.[1] : undefined))
    .filter((entry) => entry !== undefined);
}
