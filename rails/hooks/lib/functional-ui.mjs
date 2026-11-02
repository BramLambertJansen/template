// ADR 0056: één begrensde UI-uitzondering. Een marker beschrijft de bedoeling; de paden en eigenaarreview bepalen de scope.
import { createRequire } from 'node:module';
import { canonicalPath, TEMPLATE_REPOSITORY } from './task-authority.mjs';

/** @typedef {{ status: string, pad: string, van?: string }} UiChange */

/** Alleen een echt frontmatterveld, nooit een vermelding in de body. @param {string} text @param {string} value */
function frontmatterHas(text, value) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 && lines.slice(1, end).includes(value);
}

/** @param {string} text */
export function isFunctionalUiSpec(text) {
  return frontmatterHas(text, 'sjabloon: mini') && frontmatterHas(text, 'scope: functionele-ui');
}

/** @param {string} file */
export function isCoreUiSource(file) {
  return canonicalPath(file) && /^src\/core\/web\/(?:ui|copy)\/.+\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\./.test(file);
}

/** @param {string} file */
export function isUiTest(file) {
  return canonicalPath(file) && (
    /^src\/(?:core\/web\/(?:ui|copy)|web\/(?:ui|copy|features|routes))\/.+\.(?:test|spec)\.tsx?$/.test(file) ||
    /^e2e\/[^/]+\.spec\.ts$/.test(file) || /^test\/ui\/[^/]+\.test\.ts$/.test(file)
  );
}

/** @param {string} file */
function isUiSource(file) {
  return isCoreUiSource(file) || (/^src\/web\/(?:ui|copy|features|routes)\/.+\.(?:ts|tsx|css)$/.test(file) &&
    !/\.(?:test|spec|gen)\./.test(file) && !file.endsWith('/queries.ts'));
}

/** @param {UiChange} change @param {string} spec */
function invalidUiPath({ status, pad }, spec) {
  if (!canonicalPath(pad) || /(?:^|\/)(?:AGENTS|CLAUDE)[^/]*\.md$/.test(pad) || status === 'T') return `${pad}: onveilig UI-pad`;
  if (isUiTest(pad)) return ['A', 'M'].includes(status) ? null : `${pad}: bestaande UI-tests alleen toevoegen of wijzigen`;
  if (isUiSource(pad)) return null;
  if (pad === spec || pad === 'CHANGELOG.md' || /^docs\/(?!adr\/|specs\/).+\.md$/.test(pad)) return null;
  return `${pad}: buiten functionele UI (ADR 0056)`;
}

/** @param {{ changes: UiChange[], repository?: string | undefined, spec: string }} input */
export function functionalUiReason({ changes, repository, spec }) {
  if (repository !== TEMPLATE_REPOSITORY) return 'functionele core-UI is uitsluitend toegestaan in de template-repository';
  const paths = changes.flatMap(({ status, pad, van }) => van === undefined ? [{ status, pad }] : [{ status, pad }, { status, pad: van }]);
  const invalid = paths.map((change) => invalidUiPath(change, spec)).find((reason) => reason !== null);
  if (invalid !== undefined) return invalid;
  return paths.some(({ pad }) => isUiSource(pad) && !isUiTest(pad)) ? null : 'functionele UI vraagt een bijbehorende bronwijziging';
}

// Testgevallen en skips tellen via de TypeScript-AST (R-CODE-01, leerpunt #424): commentaar, strings en haakjes in een
// test.each-tabel tellen nooit mee. Eén geval per aanroepplek; tabelrijen tellen niet afzonderlijk. Inhoudelijke
// testkwaliteit blijft onderdeel van eigenaarreview.
const require = createRequire(import.meta.url);
/** @type {typeof import('typescript') | undefined} */
let typescript;
/** Lui geladen: alleen een gewijzigde test betaalt de parser. Ontbreekt hij, dan faalt de aanroeper dicht. */
/** @returns {typeof import('typescript')} */
function ts() {
  if (typescript === undefined) {
    /** @type {typeof import('typescript')} */
    const geladen = require('typescript');
    typescript = geladen;
  }
  return typescript;
}

const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/** Modifier die nog steeds één uitgevoerd geval registreert (`test.only(…)`, `test.concurrent.each(…)(…)`). */
const CASE_MODIFIERS = new Set(['only', 'concurrent', 'sequential', 'fails', 'each', 'for', 'skipIf', 'runIf']);
/** Aanroepen die een tabel of voorwaarde nemen en een nieuwe registratiefunctie teruggeven. */
const FACTORIES = new Set(['each', 'for', 'skipIf', 'runIf']);
const SKIP_PROPERTIES = new Set(['skip', 'todo', 'fixme']);
const SKIP_FUNCTIONS = new Set(['xit', 'xtest', 'xdescribe', 'skip']);

/** Pgtap en andere niet-scriptbestanden: ongewijzigd de bestaande heuristiek (lane.mjs houdt ze toch dicht). */
const SQL_SKIP = /\.(?:skip|todo|fixme)\s*\(|\b(?:xit|xtest|xdescribe)\s*\(|\bskip\s*\(/g;
const SQL_CASES = /\b(?:test|it)(?:\.each\b[^(]*\([^)]*\))?\s*\(/g;

/**
 * Is `callee` (de expressie vóór de argumenten) een registratie van een uitgevoerd geval: `test`/`it`, eventueel met
 * modifiers uit CASE_MODIFIERS, of het resultaat van een fabriek als `test.each(tabel)` of `test.each\`…\``?
 * @param {import('typescript').Expression} callee
 */
function isCaseCallee(callee) {
  const t = ts();
  let node = callee;
  if (t.isCallExpression(node) || t.isTaggedTemplateExpression(node)) {
    const factory = t.isCallExpression(node) ? node.expression : node.tag;
    if (!t.isPropertyAccessExpression(factory) || !FACTORIES.has(factory.name.text)) return false;
    node = factory.expression;
  }
  while (t.isPropertyAccessExpression(node)) {
    if (!CASE_MODIFIERS.has(node.name.text)) return false;
    node = node.expression;
  }
  return t.isIdentifier(node) && (node.text === 'test' || node.text === 'it');
}

/**
 * Staat deze naam in de calleeketen van een aanroep (`test.skip(`, `test.skip.each(…)(`, `ctx.skip()`)?
 * @param {import('typescript').Node} node
 */
function inCalleeChain(node) {
  const t = ts();
  let current = node;
  while (t.isPropertyAccessExpression(current.parent) && current.parent.expression === current) current = current.parent;
  const parent = current.parent;
  return (t.isCallExpression(parent) && parent.expression === current) || (t.isTaggedTemplateExpression(parent) && parent.tag === current);
}

/** @param {string} text @param {string} file @returns {{ cases: number, skips: number }} */
function countScript(text, file) {
  const t = ts();
  const kind = /\.[jt]sx$/.test(file) ? t.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? t.ScriptKind.JS : t.ScriptKind.TS;
  const source = t.createSourceFile(file, text, t.ScriptTarget.Latest, true, kind);
  const totals = { cases: 0, skips: 0 };
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (t.isCallExpression(node) && isCaseCallee(node.expression)) totals.cases += 1;
    if (t.isPropertyAccessExpression(node) && SKIP_PROPERTIES.has(node.name.text) && inCalleeChain(node)) totals.skips += 1;
    if (t.isIdentifier(node) && SKIP_FUNCTIONS.has(node.text) && t.isCallExpression(node.parent) && node.parent.expression === node)
      totals.skips += 1;
    t.forEachChild(node, visit);
  };
  visit(source);
  return totals;
}

/** @param {string} text @param {string} file @returns {{ cases: number, skips: number }} */
function count(text, file) {
  if (SCRIPT.test(file)) return countScript(text, file);
  return { cases: (text.match(SQL_CASES) ?? []).length, skips: (text.match(SQL_SKIP) ?? []).length };
}

/** @param {string} before @param {string} after @param {string} file repo-pad; de extensie kiest de parser */
export function testChangeRisk(before, after, file) {
  const voor = count(before, file);
  const na = count(after, file);
  if (na.skips > voor.skips) return 'skip';
  return na.cases < voor.cases ? 'removed' : null;
}
