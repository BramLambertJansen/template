// check-storage-adapters (spec bestandsopslag, deel A, files/AC-30; ADR 0060 punt 2; R-OPSL-01): elke opslagadapter die
// via defineFileStorage( ontstaat, heeft een testbestand dat fileStorageContract (of fileStorageContractCases) uit
// src/core/api/storage/testing.ts op precies die adapter draait. Statisch: de TypeScript-parser leest de bronnen, niets
// wordt geladen of uitgevoerd. Gevolgd worden benoemde imports (ook als alias), heruitvoer (ook `export *`),
// namespace-imports (`ns.defineFileStorage(…)`), destructurering uit een namespace en const-aliassen. Een suite telt
// alleen de adapter die haar setup aanroept of als `storage` teruggeeft, niet een naam die er alleen als argument staat.
// Gescand: src/ en deploy/ (R-ARCH-05). test/rails/check-storage-adapters.test.ts roept adapterFouten aan met fixtures.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const PORT = 'src/core/api/storage/port.ts';
const TESTING = 'src/core/api/storage/testing.ts';
const DEFINE = 'defineFileStorage';
const SUITES = new Set(['fileStorageContract', 'fileStorageContractCases']);
const MAPPEN = ['src', 'deploy'];
const EXTENSIES = ['.ts', '.tsx', '.mjs', '.js'];
const MAX_DIEPTE = 8;

/** @typedef {{ file: string, name: string, depth?: number }} Ref */
/** @typedef {{ root: string, bron: (rel: string) => ts.SourceFile | null }} Ctx */
/** @typedef {{ spec: string, name: string | null }} Herkomst */

const isTest = (/** @type {string} */ rel) => /\.test\.tsx?$/.test(rel) || rel.startsWith('test/');
const key = (/** @type {Ref} */ ref) => `${ref.file}#${ref.name}`;
const diepte = (/** @type {Ref} */ ref) => (ref.depth ?? 0) + 1;

/** Alle .ts- en .tsx-bestanden onder dir (repo-relatief, met /), zonder node_modules, fixtures en gegenereerde bestanden. */
function bestanden(/** @type {string} */ root, /** @type {string} */ dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  /** @type {string[]} */
  const uit = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    const map = entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'fixtures';
    if (map) uit.push(...bestanden(root, rel));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.gen.ts')) uit.push(rel);
  }
  return uit;
}

function leesOfNull(/** @type {string} */ abs) {
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function bronnen(/** @type {string} */ root) {
  /** @type {Map<string, ts.SourceFile | null>} */
  const cache = new Map();
  /** @param {string} rel @returns {ts.SourceFile | null} */
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel) ?? null;
    const tekst = leesOfNull(path.join(root, rel));
    const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = tekst === null ? null : ts.createSourceFile(rel, tekst, ts.ScriptTarget.Latest, true, kind);
    cache.set(rel, sf);
    return sf;
  };
}

/** Het repo-relatieve pad dat een specifier noemt (zonder te kijken of het bestaat), of null voor een pakket. */
function basis(/** @type {string} */ from, /** @type {string} */ spec) {
  if (spec.startsWith('#web/')) return `src/web/${spec.slice(5)}`;
  if (spec.startsWith('#core/')) return `src/core/${spec.slice(6)}`;
  if (spec.startsWith('#shared/')) return `src/shared/${spec.slice(8)}`;
  if (spec.startsWith('#api/')) return `src/api/${spec.slice(5)}`;
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  return null;
}

/** Een specifier naar een bestaand repo-relatief bestand; de twee core-bestanden ook als ze ontbreken (fixture-repo). */
function resolve(/** @type {string} */ root, /** @type {string} */ from, /** @type {string} */ spec) {
  const base = basis(from, spec);
  if (base === null) return null;
  if (base === PORT || base === TESTING || base === 'src/core/api/storage' || base === 'src/core/api/storage/index.ts')
    return base === PORT || base === TESTING ? base : (vind(root, base) ?? 'src/core/api/storage/index.ts');
  return vind(root, base);
}

function vind(/** @type {string} */ root, /** @type {string} */ base) {
  const kandidaten = [base, ...EXTENSIES.map((ext) => base + ext), ...EXTENSIES.map((ext) => `${base}/index${ext}`)];
  return kandidaten.find((rel) => existsSync(path.join(root, rel)) && statSync(path.join(root, rel)).isFile()) ?? null;
}

/** Top-level declaraties: naam → node (functie, initializer van een const, of het bindingselement van een destructurering). */
function declaraties(/** @type {ts.SourceFile} */ sf) {
  /** @type {Map<string, ts.Node>} */
  const map = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name !== undefined) map.set(stmt.name.text, stmt);
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) noteerDeclaratie(decl, map);
  }
  return map;
}

function noteerDeclaratie(/** @type {ts.VariableDeclaration} */ decl, /** @type {Map<string, ts.Node>} */ map) {
  if (decl.initializer === undefined) return;
  if (ts.isIdentifier(decl.name)) map.set(decl.name.text, decl.initializer);
  if (!ts.isObjectBindingPattern(decl.name)) return;
  for (const element of decl.name.elements) {
    if (ts.isIdentifier(element.name)) map.set(element.name.text, element);
  }
}

/**
 * Hoe een bestand een naam binnenhaalt: benoemd (import of heruitvoer, met de oorspronkelijke naam), als namespace
 * (`import * as ns`, name null) of via `export *` (alleen als kandidaat). Eerst de directe treffers, dan de sterren.
 * @returns {Herkomst[]}
 */
function bronnen2(/** @type {ts.SourceFile} */ sf, /** @type {string} */ name) {
  /** @type {Herkomst[]} */
  const direct = [];
  /** @type {Herkomst[]} */
  const sterren = [];
  for (const stmt of sf.statements) {
    const spec = moduleSpec(stmt);
    if (spec === null) continue;
    const hit = treffer(stmt, name);
    if (hit !== undefined) direct.push({ spec, name: hit });
    else if (ts.isExportDeclaration(stmt) && stmt.exportClause === undefined) sterren.push({ spec, name });
  }
  return [...direct, ...sterren];
}

function moduleSpec(/** @type {ts.Statement} */ stmt) {
  const isDecl = ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt);
  const spec = isDecl ? stmt.moduleSpecifier : undefined;
  return spec !== undefined && ts.isStringLiteral(spec) ? spec.text : null;
}

/**
 * De oorspronkelijke naam (string), null voor een namespace-binding, of undefined als de declaratie de naam niet noemt.
 * @returns {string | null | undefined}
 */
function treffer(/** @type {ts.Statement} */ stmt, /** @type {string} */ name) {
  const named = ts.isImportDeclaration(stmt)
    ? stmt.importClause?.namedBindings
    : ts.isExportDeclaration(stmt)
      ? stmt.exportClause
      : undefined;
  if (named === undefined) return undefined;
  if (ts.isNamespaceImport(named) || ts.isNamespaceExport(named)) return named.name.text === name ? null : undefined;
  const hit = named.elements.find((e) => e.name.text === name);
  return hit === undefined ? undefined : (hit.propertyName ?? hit.name).text;
}

/**
 * De declaratie achter een naam in een bestand, of null. Een namespace-binding geeft { file, name: '*' }.
 * @returns {Ref | null}
 */
function herkomst(/** @type {Ctx} */ ctx, /** @type {Ref} */ ref) {
  if (ref.file === PORT || ref.file === TESTING) return { file: ref.file, name: ref.name };
  const sf = ctx.bron(ref.file);
  if (sf === null || (ref.depth ?? 0) > MAX_DIEPTE) return null;
  const decl = declaraties(sf).get(ref.name);
  if (decl !== undefined) return lokaal(ctx, ref, decl);
  for (const via of bronnen2(sf, ref.name)) {
    const doel = resolve(ctx.root, ref.file, via.spec);
    if (doel === null) continue;
    const gevonden =
      via.name === null ? { file: doel, name: '*' } : herkomst(ctx, { file: doel, name: via.name, depth: diepte(ref) });
    if (gevonden !== null) return gevonden;
  }
  return null;
}

/** Een lokale declaratie: een const-alias of destructurering volgt de bron, al het andere is zelf de declaratie. */
function lokaal(/** @type {Ctx} */ ctx, /** @type {Ref} */ ref, /** @type {ts.Node} */ decl) {
  const eigen = { file: ref.file, name: ref.name };
  if (ts.isIdentifier(decl) && decl.text !== ref.name)
    return herkomst(ctx, { file: ref.file, name: decl.text, depth: diepte(ref) });
  if (!ts.isBindingElement(decl)) return eigen;
  const init = ts.isVariableDeclaration(decl.parent.parent) ? decl.parent.parent.initializer : undefined;
  const prop =
    decl.propertyName !== undefined && ts.isIdentifier(decl.propertyName) ? decl.propertyName.text : ref.name;
  if (init === undefined || !ts.isIdentifier(init)) return eigen;
  return lid(ctx, { file: ref.file, name: init.text, depth: diepte(ref) }, prop);
}

/** De declaratie van `ns.prop` als ns een namespace is, of null. */
function lid(/** @type {Ctx} */ ctx, /** @type {Ref} */ ns, /** @type {string} */ prop) {
  const doel = herkomst(ctx, { ...ns, depth: diepte(ns) });
  return doel === null || doel.name !== '*'
    ? null
    : herkomst(ctx, { file: doel.file, name: prop, depth: diepte(ns) + 1 });
}

/** De declaratie achter de callee van een aanroep: `naam(…)` of `ns.naam(…)`. */
function callee(/** @type {Ctx} */ ctx, /** @type {string} */ file, /** @type {ts.CallExpression} */ call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return herkomst(ctx, { file, name: e.text });
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression))
    return lid(ctx, { file, name: e.expression.text }, e.name.text);
  return null;
}

const is = (/** @type {Ref | null} */ ref, /** @type {string} */ file, /** @type {(name: string) => boolean} */ naam) =>
  ref !== null && ref.file === file && naam(ref.name);

/** De top-level declaratie (naam) waarin een node staat, of null. */
function omhullend(/** @type {ts.Node} */ node) {
  let n = node;
  while (n.parent !== undefined && !ts.isSourceFile(n.parent)) n = n.parent;
  if (ts.isFunctionDeclaration(n) && n.name !== undefined) return n.name.text;
  if (ts.isVariableStatement(n)) {
    const decl = n.declarationList.declarations[0];
    if (decl !== undefined && ts.isIdentifier(decl.name)) return decl.name.text;
  }
  return null;
}

/** Alle aanroepen in een bestand. */
function aanroepen(/** @type {ts.Node} */ node) {
  /** @type {ts.CallExpression[]} */
  const uit = [];
  const loop = (/** @type {ts.Node} */ n) => {
    if (ts.isCallExpression(n)) uit.push(n);
    ts.forEachChild(n, loop);
  };
  loop(node);
  return uit;
}

/** Alle adapters (buiten tests en de poort zelf): aanroepen van defineFileStorage, onder welke naam of vorm ook. */
function adapters(/** @type {Ctx} */ ctx, /** @type {string[]} */ bron) {
  /** @type {{ ref: Ref | null, file: string }[]} */
  const uit = [];
  for (const file of bron.filter((rel) => !isTest(rel) && rel !== PORT)) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    for (const call of aanroepen(sf)) {
      if (!is(callee(ctx, file, call), PORT, (name) => name === DEFINE)) continue;
      const name = omhullend(call);
      uit.push({ file, ref: name === null ? null : { file, name } });
    }
  }
  return uit;
}

/** De adapters waarop een testbestand een suite uit testing.ts draait, herleid naar hun bron. */
function suites(/** @type {Ctx} */ ctx, /** @type {string[]} */ tests) {
  /** @type {Set<string>} */
  const uit = new Set();
  for (const file of tests) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    for (const call of aanroepen(sf)) {
      if (!is(callee(ctx, file, call), TESTING, (name) => SUITES.has(name))) continue;
      call.arguments.flatMap((arg) => gebruikt(ctx, file, arg)).forEach((ref) => uit.add(key(ref)));
    }
  }
  return uit;
}

/** Wat de setup van een suite als adapter gebruikt: elke aangeroepen naam en de waarde van een eigenschap `storage`. */
function gebruikt(/** @type {Ctx} */ ctx, /** @type {string} */ file, /** @type {ts.Node} */ node) {
  /** @type {Ref[]} */
  const uit = [];
  for (const n of [...aanroepen(node).map((call) => call.expression), ...storageWaarden(node)]) {
    const ref = ts.isIdentifier(n) ? herkomst(ctx, { file, name: n.text }) : null;
    if (ref !== null) uit.push(ref);
  }
  return uit;
}

function storageWaarden(/** @type {ts.Node} */ node) {
  /** @type {ts.Node[]} */
  const uit = [];
  const loop = (/** @type {ts.Node} */ n) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'storage') uit.push(n.initializer);
    if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'storage') uit.push(n.name);
    ts.forEachChild(n, loop);
  };
  loop(node);
  return uit;
}

/** @param {string} [root] @returns {string[]} */
export function adapterFouten(root = '.') {
  /** @type {Ctx} */
  const ctx = { root, bron: bronnen(root) };
  const bron = MAPPEN.flatMap((dir) => bestanden(root, dir));
  const tests = [...bron.filter(isTest), ...bestanden(root, 'test').filter(isTest)];
  const gedekt = suites(ctx, tests);
  /** @type {string[]} */
  const fouten = [];
  for (const { file, ref } of adapters(ctx, bron)) {
    if (ref === null) {
      fouten.push(
        `${file}: defineFileStorage buiten een benoemde top-level declaratie; geef de adapter een naam en draai fileStorageContract erop`,
      );
    } else if (!gedekt.has(key(ref))) {
      fouten.push(
        `${file}: adapter ${ref.name} heeft geen testbestand dat fileStorageContract uit src/core/api/storage/testing.ts op deze adapter draait (ADR 0060 punt 2)`,
      );
    }
  }
  return fouten;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fouten = adapterFouten();
  for (const fout of fouten) console.error(fout);
  if (fouten.length > 0) process.exit(1);
  console.log('check:storage-adapters: elke opslagadapter draait de contracttestsuite');
}
