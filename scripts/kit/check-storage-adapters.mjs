// check-storage-adapters (spec bestandsopslag, deel A, files/AC-30; ADR 0060 punt 2; R-OPSL-01): elke opslagadapter die
// via defineFileStorage( ontstaat, heeft een testbestand dat fileStorageContract (of fileStorageContractCases) op precies
// die adapter draait. Statisch: de TypeScript-parser leest de bronnen, niets wordt geladen of uitgevoerd. Een andere naam
// voor defineFileStorage (import als alias, heruitvoer onder een andere naam, een const-alias) ontwijkt de check niet.
// test/rails/check-storage-adapters.test.ts roept adapterFouten aan met fixture-repo's.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const PORT = 'src/core/api/storage/port.ts';
const DEFINE = 'defineFileStorage';
const SUITES = new Set(['fileStorageContract', 'fileStorageContractCases']);
const EXTENSIES = ['.ts', '.tsx', '.mjs', '.js'];
const MAX_DIEPTE = 8;

/** @typedef {{ file: string, name: string }} Ref */
/** @typedef {{ root: string, bron: (rel: string) => ts.SourceFile | null }} Ctx */

const isTest = (/** @type {string} */ rel) => /\.test\.tsx?$/.test(rel) || rel.startsWith('test/');
const key = (/** @type {Ref} */ ref) => `${ref.file}#${ref.name}`;

/** Alle .ts- en .tsx-bestanden onder dir (repo-relatief, met /), zonder node_modules en gegenereerde bestanden. */
function bestanden(/** @type {string} */ root, /** @type {string} */ dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  /** @type {string[]} */
  const uit = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'fixtures')
      uit.push(...bestanden(root, rel));
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

/** Een import-specifier naar een bestaand repo-relatief bestand, of null (pakket of niet gevonden). */
function resolve(/** @type {string} */ root, /** @type {string} */ from, /** @type {string} */ spec) {
  const base = basis(from, spec);
  if (base === null) return null;
  const kandidaten = [base, ...EXTENSIES.map((ext) => base + ext), ...EXTENSIES.map((ext) => `${base}/index${ext}`)];
  return kandidaten.find((rel) => existsSync(path.join(root, rel)) && statSync(path.join(root, rel)).isFile()) ?? null;
}

/** Top-level declaraties: naam → node (functie, of de initializer van een const). */
function declaraties(/** @type {ts.SourceFile} */ sf) {
  /** @type {Map<string, ts.Node>} */
  const map = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name !== undefined) map.set(stmt.name.text, stmt);
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) map.set(decl.name.text, decl.initializer);
    }
  }
  return map;
}

/** De naam waaronder een benoemde import of heruitvoer een naam binnenhaalt, of null. */
function element(/** @type {ts.NamedImports | ts.NamedExports} */ named, /** @type {string} */ name) {
  const hit = named.elements.find((e) => e.name.text === name);
  return hit === undefined ? null : (hit.propertyName ?? hit.name).text;
}

/** De benoemde bindingen en de specifier van een import- of heruitvoerdeclaratie, of null. */
function benoemd(/** @type {ts.Statement} */ stmt) {
  if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
    const bindings = stmt.importClause?.namedBindings;
    return bindings !== undefined && ts.isNamedImports(bindings)
      ? { spec: stmt.moduleSpecifier.text, named: bindings }
      : null;
  }
  if (!ts.isExportDeclaration(stmt) || stmt.moduleSpecifier === undefined || !ts.isStringLiteral(stmt.moduleSpecifier))
    return null;
  const clause = stmt.exportClause;
  return clause !== undefined && ts.isNamedExports(clause) ? { spec: stmt.moduleSpecifier.text, named: clause } : null;
}

/**
 * Waar een bestand een naam vandaan haalt: een benoemde import of een heruitvoer (export { A as B } from …).
 * @returns {{ spec: string, name: string } | null}
 */
function bron(/** @type {ts.SourceFile} */ sf, /** @type {string} */ name) {
  for (const stmt of sf.statements) {
    const decl = benoemd(stmt);
    const origineel = decl === null ? null : element(decl.named, name);
    if (decl !== null && origineel !== null) return { spec: decl.spec, name: origineel };
  }
  return null;
}

/**
 * Het bestand en de naam van de declaratie achter een naam, via imports, heruitvoer en const-aliassen. Null als hij
 * buiten de repo ligt of niet te herleiden is.
 * @returns {Ref | null}
 */
function herkomst(/** @type {Ctx} */ ctx, /** @type {Ref} */ ref, depth = 0) {
  const sf = ctx.bron(ref.file);
  if (sf === null || depth > MAX_DIEPTE) return null;
  const decl = declaraties(sf).get(ref.name);
  if (decl !== undefined) {
    // const d = defineFileStorage: een alias in hetzelfde bestand.
    if (ts.isIdentifier(decl) && decl.text !== ref.name)
      return herkomst(ctx, { file: ref.file, name: decl.text }, depth + 1);
    return ref;
  }
  const via = bron(sf, ref.name);
  if (via === null) return null;
  // De poort telt ook als het bestand ontbreekt (een fixture-repo of een app die core nog niet heeft): het pad beslist.
  if (basis(ref.file, via.spec) === PORT) return { file: PORT, name: via.name };
  const doel = resolve(ctx.root, ref.file, via.spec);
  return doel === null ? null : herkomst(ctx, { file: doel, name: via.name }, depth + 1);
}

const isDefine = (/** @type {Ctx} */ ctx, /** @type {string} */ file, /** @type {string} */ name) => {
  const ref = herkomst(ctx, { file, name });
  return ref !== null && ref.file === PORT && ref.name === DEFINE;
};

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

/** Alle adapters (buiten tests en buiten de poort zelf): aanroepen van defineFileStorage onder welke naam ook. */
function adapters(/** @type {Ctx} */ ctx, /** @type {string[]} */ src) {
  /** @type {{ ref: Ref | null, file: string }[]} */
  const uit = [];
  for (const file of src.filter((rel) => !isTest(rel) && rel !== PORT)) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    const loop = (/** @type {ts.Node} */ n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && isDefine(ctx, file, n.expression.text)) {
        const name = omhullend(n);
        uit.push({ file, ref: name === null ? null : { file, name } });
      }
      ts.forEachChild(n, loop);
    };
    loop(sf);
  }
  return uit;
}

/** De adapters waarop een testbestand fileStorageContract( of fileStorageContractCases( draait, herleid naar hun bron. */
function suites(/** @type {Ctx} */ ctx, /** @type {string[]} */ tests) {
  /** @type {Set<string>} */
  const uit = new Set();
  for (const file of tests) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    const loop = (/** @type {ts.Node} */ n) => {
      const via = ts.isCallExpression(n) && ts.isIdentifier(n.expression) ? bron(sf, n.expression.text) : null;
      if (via !== null && SUITES.has(via.name) && ts.isCallExpression(n)) {
        n.arguments.flatMap((arg) => gebruik(ctx, file, arg)).forEach((k) => uit.add(k));
      }
      ts.forEachChild(n, loop);
    };
    loop(sf);
  }
  return uit;
}

/** Elke naam in de setup van een suite, herleid tot zijn declaratie (als sleutel). */
function gebruik(/** @type {Ctx} */ ctx, /** @type {string} */ file, /** @type {ts.Node} */ node) {
  /** @type {string[]} */
  const uit = [];
  const loop = (/** @type {ts.Node} */ n) => {
    if (ts.isIdentifier(n)) {
      const ref = herkomst(ctx, { file, name: n.text });
      if (ref !== null) uit.push(key(ref));
    }
    ts.forEachChild(n, loop);
  };
  loop(node);
  return uit;
}

/** @param {string} [root] @returns {string[]} */
export function adapterFouten(root = '.') {
  /** @type {Ctx} */
  const ctx = { root, bron: bronnen(root) };
  const src = bestanden(root, 'src');
  const tests = [...src.filter(isTest), ...bestanden(root, 'test').filter(isTest)];
  const gedekt = suites(ctx, tests);
  /** @type {string[]} */
  const fouten = [];
  for (const { file, ref } of adapters(ctx, src)) {
    if (ref === null) {
      fouten.push(
        `${file}: defineFileStorage buiten een benoemde top-level declaratie; geef de adapter een naam en draai fileStorageContract erop`,
      );
    } else if (!gedekt.has(key(ref))) {
      fouten.push(
        `${file}: adapter ${ref.name} heeft geen testbestand dat fileStorageContract op deze adapter draait (ADR 0060 punt 2)`,
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
