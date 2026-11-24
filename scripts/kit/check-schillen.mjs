// check-schillen (spec schillen, deel B; framework §7): elke schil op ShellFrame heeft een shellContract-suite, elke
// layoutroute rendert een geregistreerde schil en ShellFrame staat alleen in een schil in src/core/web/ui of src/web/ui.
// Daarnaast het recept "Een tweede schil" in docs/gouden-pad.md (AC-13). Pure functies op een root, zoals
// check-koppelingsvorm.mjs; test/rails/check-schillen.test.ts roept ze aan met fixture-repo's. Statisch: de TypeScript-
// parser leest de bronnen, niets wordt geladen of uitgevoerd.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const RECEPT = 'zie docs/gouden-pad.md, sectie "Een tweede schil"';
const UI_DIRS = ['src/core/web/ui/', 'src/web/ui/'];
const ROUTES = 'src/web/routes/';
const VASTE_SCHILLEN = new Set(['SidebarShell', 'TopbarShell', 'AppShell']);
const LAYOUT_ID = /^\/_[^/]+$/;
const EXTENSIES = ['.tsx', '.ts'];

/** @typedef {{ file: string, name: string }} Ref */
/** @typedef {{ rel: string, sf: ts.SourceFile }} Bron */

const isTest = (/** @type {string} */ rel) =>
  /\.test\.tsx?$/.test(rel) || rel.startsWith('test/') || rel.startsWith('e2e/');
const inUi = (/** @type {string} */ rel) => UI_DIRS.some((dir) => rel.startsWith(dir));
const key = (/** @type {Ref} */ ref) => `${ref.file}#${ref.name}`;

/** Alle .ts- en .tsx-bestanden onder dir (repo-relatief, met /), zonder node_modules en gegenereerde routeboom. */
function bestanden(/** @type {string} */ root, /** @type {string} */ dir) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  /** @type {string[]} */
  const uit = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== 'node_modules') uit.push(...bestanden(root, rel));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.gen.ts')) uit.push(rel);
  }
  return uit;
}

function bronnen(/** @type {string} */ root) {
  /** @type {Map<string, ts.SourceFile>} */
  const cache = new Map();
  /** @param {string} rel @returns {ts.SourceFile | null} */
  return (rel) => {
    const hit = cache.get(rel);
    if (hit !== undefined) return hit;
    const abs = path.join(root, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) return null;
    const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(rel, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true, kind);
    cache.set(rel, sf);
    return sf;
  };
}

/** Een import-specifier naar een repo-relatief bestand, of null (pakket of niet gevonden). */
function resolve(/** @type {string} */ root, /** @type {string} */ from, /** @type {string} */ spec) {
  /** @type {string | null} */
  let base = null;
  if (spec.startsWith('#web/')) base = `src/web/${spec.slice(5)}`;
  else if (spec.startsWith('#core/')) base = `src/core/${spec.slice(6)}`;
  else if (spec.startsWith('#shared/')) base = `src/shared/${spec.slice(8)}`;
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  if (base === null) return null;
  const kandidaten = [base, ...EXTENSIES.map((ext) => base + ext), ...EXTENSIES.map((ext) => `${base}/index${ext}`)];
  return kandidaten.find((rel) => existsSync(path.join(root, rel)) && statSync(path.join(root, rel)).isFile()) ?? null;
}

/** Lokale naam → { specifier, geïmporteerde naam } voor elke benoemde import. */
function imports(/** @type {ts.SourceFile} */ sf) {
  /** @type {Map<string, { spec: string, name: string }>} */
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      map.set(element.name.text, {
        spec: stmt.moduleSpecifier.text,
        name: (element.propertyName ?? element.name).text,
      });
    }
  }
  return map;
}

/** Top-level componenten: naam → node (functie of de initializer van een const). */
function componenten(/** @type {ts.SourceFile} */ sf) {
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

/** Namen die een node als JSX-tag of als eerste argument van createElement rendert. */
function gerenderd(/** @type {ts.Node} */ node) {
  /** @type {Set<string>} */
  const namen = new Set();
  const loop = (/** @type {ts.Node} */ n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName))
      namen.add(n.tagName.text);
    if (
      ts.isCallExpression(n) &&
      n.arguments[0] !== undefined &&
      ts.isIdentifier(n.arguments[0]) &&
      /(^|\.)createElement$/.test(n.expression.getText())
    )
      namen.add(n.arguments[0].text);
    ts.forEachChild(n, loop);
  };
  loop(node);
  return namen;
}

/**
 * De specifier en de naam waaronder een bestand een naam uit een ander bestand haalt: een benoemde import of een
 * heruitvoer (export { A as B } from …). Null als het bestand de naam zo niet binnenhaalt.
 * @returns {{ spec: string, name: string } | null}
 */
function bron(/** @type {ts.SourceFile} */ sf, /** @type {string} */ name) {
  const imp = imports(sf).get(name);
  if (imp !== undefined) return imp;
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || stmt.moduleSpecifier === undefined) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.exportClause === undefined) continue;
    if (!ts.isNamedExports(stmt.exportClause)) continue;
    const element = stmt.exportClause.elements.find((e) => e.name.text === name);
    if (element !== undefined)
      return { spec: stmt.moduleSpecifier.text, name: (element.propertyName ?? element.name).text };
  }
  return null;
}

/**
 * Waar een naam in een bestand vandaan komt: een eigen component, of via imports en heruitvoer naar het bestand dat hem
 * definieert. Null als hij buiten de repo ligt.
 * @returns {Ref | null}
 */
function herkomst(/** @type {Ctx} */ ctx, /** @type {Ref} */ ref, depth = 0) {
  const sf = ctx.bron(ref.file);
  if (sf === null || depth > 5) return null;
  if (componenten(sf).has(ref.name)) return ref;
  const via = bron(sf, ref.name);
  const doel = via === null ? null : resolve(ctx.root, ref.file, via.spec);
  return via === null || doel === null ? null : herkomst(ctx, { file: doel, name: via.name }, depth + 1);
}

/** @typedef {{ refs: Set<string>, namen: Set<string> }} Register */
/** @typedef {{ root: string, bron: (rel: string) => ts.SourceFile | null, register: Register }} Ctx */

/** Is name in file (na herleiden) ShellFrame? */
function isFrame(/** @type {Ctx} */ ctx, /** @type {string} */ file, /** @type {string} */ name) {
  if (name === 'ShellFrame') return true;
  const sf = ctx.bron(file);
  return sf !== null && imports(sf).get(name)?.name === 'ShellFrame';
}

/** Regel 1 en de kandidaten: componenten in de UI-mappen die ShellFrame renderen. */
function frameSchillen(/** @type {Ctx} */ ctx, /** @type {string[]} */ src) {
  /** @type {Ref[]} */
  const uit = [];
  for (const file of src.filter((rel) => inUi(rel) && !isTest(rel))) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    for (const [name, node] of componenten(sf)) {
      if ([...gerenderd(node)].some((tag) => isFrame(ctx, file, tag))) uit.push({ file, name });
    }
  }
  return uit;
}

/** De schillen waarop een testbestand shellContract( draait, herleid naar hun bestand. */
function suites(/** @type {Ctx} */ ctx, /** @type {string[]} */ tests) {
  /** @type {Set<string>} */
  const uit = new Set();
  for (const file of tests) {
    const sf = ctx.bron(file);
    if (sf === null) continue;
    const loop = (/** @type {ts.Node} */ n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'shellContract' &&
        n.arguments[0] !== undefined &&
        ts.isIdentifier(n.arguments[0])
      ) {
        const ref = imports(sf).has(n.arguments[0].text) ? herkomst(ctx, { file, name: n.arguments[0].text }) : null;
        if (ref !== null) uit.add(key(ref));
      }
      ts.forEachChild(n, loop);
    };
    loop(sf);
  }
  return uit;
}

/**
 * De aanroep createFileRoute('<id>')(…) in een bestand, of undefined.
 * @param {ts.Node} n @returns {{ id: string, opts: ts.Expression | undefined } | undefined}
 */
function fileRouteCall(n) {
  if (
    ts.isCallExpression(n) &&
    ts.isCallExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'createFileRoute' &&
    n.expression.arguments[0] !== undefined &&
    ts.isStringLiteralLike(n.expression.arguments[0])
  )
    return { id: n.expression.arguments[0].text, opts: n.arguments[0] };
  return ts.forEachChild(n, fileRouteCall);
}

/** Het id en de naam van het component van createFileRoute('<id>')({ component: X }), of null. */
function fileRoute(/** @type {ts.SourceFile} */ sf) {
  const call = fileRouteCall(sf);
  if (call === undefined) return null;
  const prop =
    call.opts !== undefined && ts.isObjectLiteralExpression(call.opts)
      ? call.opts.properties.find((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'component')
      : undefined;
  /** @type {string | null} */
  let component = null;
  if (prop !== undefined && ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer))
    component = prop.initializer.text;
  else if (prop !== undefined && ts.isShorthandPropertyAssignment(prop)) component = prop.name.text;
  return { id: call.id, component };
}

/**
 * Rendert het component (direct of via het layoutcomponent dat het rendert) een geregistreerde schil? Een tag die niet
 * naar een bestand in de repo te herleiden is, telt op naam.
 * @param {Ctx} ctx @param {Ref} ref @param {number} [depth] @returns {boolean}
 */
function rendertSchil(ctx, ref, depth = 0) {
  const { register } = ctx;
  // Een vaste schil telt alleen uit core, zodat een lokale functie met dezelfde naam niet meetelt.
  if (VASTE_SCHILLEN.has(ref.name) && ref.file.startsWith('src/core/web/ui/')) return true;
  if (register.refs.has(key(ref))) return true;
  const sf = ctx.bron(ref.file);
  const node = sf === null || depth > 1 ? undefined : componenten(sf).get(ref.name);
  if (node === undefined) return false;
  return [...gerenderd(node)].some((/** @type {string} */ tag) => /** @returns {boolean} */ {
    const doel = herkomst(ctx, { file: ref.file, name: tag });
    if (doel === null) return VASTE_SCHILLEN.has(tag) || register.namen.has(tag);
    return rendertSchil(ctx, doel, depth + 1);
  });
}

/** Regel 1: een schil op ShellFrame zonder suite. Vult het register met de schillen die wel een suite hebben. */
function schilFouten(/** @type {Ctx} */ ctx, /** @type {string[]} */ src) {
  const getoetst = suites(ctx, [...src.filter(isTest), ...bestanden(ctx.root, 'test')]);
  /** @type {string[]} */
  const fouten = [];
  for (const schil of frameSchillen(ctx, src)) {
    if (getoetst.has(key(schil))) {
      ctx.register.refs.add(key(schil));
      ctx.register.namen.add(schil.name);
    } else
      fouten.push(
        `${schil.file}: ${schil.name} rendert ShellFrame zonder test met shellContract(${schil.name}, …); ${RECEPT}`,
      );
  }
  return fouten;
}

/** Regel 2: een layoutroute (/_<naam>) waarvan het component geen geregistreerde schil rendert. */
function layoutrouteFouten(/** @type {Ctx} */ ctx, /** @type {string[]} */ src) {
  /** @type {string[]} */
  const fouten = [];
  for (const file of src.filter((rel) => rel.startsWith(ROUTES) && !isTest(rel))) {
    const sf = ctx.bron(file);
    const route = sf === null ? null : fileRoute(sf);
    if (route === null || !LAYOUT_ID.test(route.id)) continue;
    const name = route.component;
    const ref = name === null ? null : (herkomst(ctx, { file, name }) ?? { file, name });
    if (ref === null || !rendertSchil(ctx, ref))
      fouten.push(
        `${file}: layoutroute ${route.id} rendert geen geregistreerde schil (SidebarShell, TopbarShell of een eigen schil met shellContract); ${RECEPT}`,
      );
  }
  return fouten;
}

/** Regel 3: ShellFrame gerenderd buiten de UI-mappen en testbestanden. */
function frameBuitenUiFouten(/** @type {Ctx} */ ctx, /** @type {string[]} */ src) {
  return src
    .filter((rel) => !inUi(rel) && !isTest(rel))
    .filter((file) => {
      const sf = ctx.bron(file);
      return sf !== null && [...gerenderd(sf)].some((tag) => isFrame(ctx, file, tag));
    })
    .map((file) => `${file}: rendert ShellFrame buiten een schil in src/core/web/ui/ of src/web/ui/; ${RECEPT}`);
}

/** @param {string} [root] @returns {string[]} */
export function schillenFouten(root = '.') {
  /** @type {Ctx} */
  const ctx = { root, bron: bronnen(root), register: { refs: new Set(), namen: new Set() } };
  const src = bestanden(root, 'src');
  return [...schilFouten(ctx, src), ...layoutrouteFouten(ctx, src), ...frameBuitenUiFouten(ctx, src)];
}

const VERWIJZINGEN = [
  'ShellFrame',
  'shellContract',
  'src/shared/permissions.ts',
  'src/web/features/layout/',
  'src/web/lib/nav.ts',
  'e2e/shell.spec.ts',
  'src/web/features/layout/twee-schillen.test.tsx',
];
const PAD = /^(src|e2e|test|docs|\.claude)\//;
const SKILL = '.claude/skills/nieuw-scherm/SKILL.md';

/** De tekst van de sectie "## Een tweede schil" tot de volgende kop van niveau 2, of null. */
function sectie(/** @type {string} */ tekst) {
  const regels = tekst.split('\n');
  const start = regels.findIndex((regel) => regel.trim() === '## Een tweede schil');
  if (start === -1) return null;
  const rest = regels.slice(start + 1);
  const eind = rest.findIndex((regel) => regel.startsWith('## '));
  return (eind === -1 ? rest : rest.slice(0, eind)).join('\n');
}

/** @param {string} [root] @returns {string[]} */
export function receptFouten(root = '.') {
  const lees = (/** @type {string} */ rel) =>
    existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : '';
  const tekst = sectie(lees('docs/gouden-pad.md'));
  /** @type {string[]} */
  const fouten = [];
  if (tekst === null) fouten.push('docs/gouden-pad.md: sectie "## Een tweede schil" ontbreekt');
  else {
    for (const verwijzing of VERWIJZINGEN) {
      if (!tekst.includes(verwijzing))
        fouten.push(`docs/gouden-pad.md, sectie "Een tweede schil": noemt \`${verwijzing}\` niet`);
    }
    for (const [, inhoud] of tekst.matchAll(/`([^`]+)`/g)) {
      const pad = inhoud?.replace(/:\d+(-\d+)?$/, '') ?? '';
      if (!PAD.test(pad) || pad.includes('<')) continue;
      if (!existsSync(path.join(root, pad)))
        fouten.push(`docs/gouden-pad.md, sectie "Een tweede schil": pad \`${pad}\` bestaat niet`);
    }
  }
  const skill = lees(SKILL);
  for (const verwijzing of ['docs/gouden-pad.md', 'Een tweede schil']) {
    if (!skill.includes(verwijzing)) fouten.push(`${SKILL}: verwijst niet naar "${verwijzing}"`);
  }
  return fouten;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fouten = [...schillenFouten(), ...receptFouten()];
  for (const fout of fouten) console.error(fout);
  if (fouten.length > 0) process.exit(1);
  console.log('check:schillen: elke schil getoetst, elke layoutroute met een schil, recept compleet');
}
