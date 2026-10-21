import { createHash } from 'node:crypto';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  existsSync,
  openSync,
  closeSync,
  fstatSync,
  constants,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Alleen deze onderzochte flat-config/projectindeling. Een andere indeling gebruikt gewone lint totdat zij is onderzocht.
const CONFIGS = {
  'eslint.config.js': 'ee78ab976eb35f34fa0d381cc20183777d52e6aa4c6d8ab4a214d8e897669015',
  'tsconfig.base.json': 'aef99c33a33f20effe651c0828edb4a4ba9c61729f9d4a6ec722c67ea53ae9ce',
  'tsconfig.json': 'ed0c4d7fb2a225173424036b31d29ba36350f3ecda8b9e8d2472e14cfaa989be',
  'tsconfig.node.json': '86ae569e787fdadc8b85c1ef0549e321017ea55d74fa659e0a6a07f60707cfaf',
  'tsconfig.web.json': '0bd94cc2790a8b23b0ce052a4980f1ceb233851bf5b24321bee4ee735fce1263',
};
const OUTPUTS = [
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.runner-output',
  '.claude/worktrees',
  'test/rails/fixtures',
  'node_modules/.tmp',
  'node_modules/.vite',
  'node_modules/.cache',
];
const OMIT_ENV = new Set([
  'RAILS_ANKER',
  'SHLVL',
  '_',
  'OLDPWD',
  'PATH',
  'NODE_PATH',
  'NODE_OPTIONS',
  'FORCE_COLOR',
  'NO_COLOR',
  'CLICOLOR',
  'CLICOLOR_FORCE',
]);

/** @param {NodeJS.ProcessEnv} env @param {string} [root] */
export function lintEnvironment(env, root) {
  const stable = Object.fromEntries(
    Object.entries(env)
      .filter(
        ([key]) =>
          /^[a-z_][a-z0-9_]*$/i.test(key) &&
          !key.startsWith('GIT_') &&
          !key.startsWith('CLAUDE_') &&
          !key.startsWith('LEFTHOOK') &&
          !OMIT_ENV.has(key) &&
          key !== 'PWD',
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return { ...stable, ...(root === undefined ? {} : { PWD: realpathSync(root) }), NO_COLOR: '1' };
}

/** @param {string} root @param {string | undefined} value */
function safeNodePath(root, value) {
  if (!value) return true;
  const packages = path.join(root, 'node_modules');
  return value
    .split(path.delimiter)
    .every(
      (entry) =>
        entry !== '' &&
        path.isAbsolute(entry) &&
        inside(packages, entry) &&
        !omitted(path.relative(root, entry).split(path.sep).join('/')),
    );
}

/** @param {string | Buffer} value */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} name */
function omitted(name) {
  const base = path.posix.basename(name);
  return (
    name.split('/').includes('.git') ||
    base === '.env' ||
    base.startsWith('.env.') ||
    OUTPUTS.some((output) => name === output || name.startsWith(`${output}/`))
  );
}

/** @param {string} root @param {string} target */
function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** @param {string} root */
function supported(root) {
  for (const [file, hash] of Object.entries(CONFIGS))
    if (digest(checkedFile(path.join(root, file))) !== hash) return false;
  /** @type {unknown} */
  const pkg = JSON.parse(checkedFile(path.join(root, 'package.json')).toString('utf8'));
  if (typeof pkg !== 'object' || pkg === null || !('scripts' in pkg)) return false;
  const scripts = pkg.scripts;
  if (typeof scripts !== 'object' || scripts === null || !('lint' in scripts)) return false;
  return scripts.lint === 'eslint . --max-warnings 0' && existsSync(path.join(root, 'node_modules/.modules.yaml'));
}

/** @param {string} root */
function parentPackages(root) {
  for (let parent = path.dirname(root); parent !== path.dirname(parent); parent = path.dirname(parent))
    if (existsSync(path.join(parent, 'node_modules'))) return true;
  return existsSync(path.join(path.parse(root).root, 'node_modules'));
}

/** @param {unknown} value @returns {string[]} */
function stringValues(value) {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(stringValues);
}

/** @param {{ root: string, name: string, text: string }} source */
function checkPackagePaths({ root, name, text }) {
  /** @type {unknown} */
  const pkg = JSON.parse(text);
  if (typeof pkg !== 'object' || pkg === null) throw new Error('onleesbaar package');
  const fields = new Set(['types', 'typings', 'main', 'module', 'browser', 'exports', 'imports', 'typesVersions']);
  const targets = Object.entries(pkg)
    .filter(([key]) => fields.has(key))
    .flatMap(([, value]) => stringValues(value));
  for (const target of targets) {
    if (target.startsWith('node:')) continue;
    const absolute = path.resolve(root, path.dirname(name), target);
    if (
      /^[a-z]+:\/\//i.test(target) ||
      !inside(root, absolute) ||
      omitted(path.relative(root, absolute).split(path.sep).join('/'))
    )
      throw new Error('package verwijst buiten de gecontroleerde invoer');
  }
}

/** @param {{ root: string, name: string, text: string }} source */
function checkReferences({ root, name, text }) {
  const info = ts.preProcessFile(text, true, true);
  const relative = [...info.importedFiles, ...info.typeReferenceDirectives].filter(({ fileName }) =>
    /^[./\\]|^file:|^[a-z]:[\\/]/i.test(fileName),
  );
  for (const { fileName } of [...relative, ...info.referencedFiles]) {
    const target = path.resolve(root, path.dirname(name), fileName);
    if (
      fileName.startsWith('file:') ||
      !inside(root, target) ||
      omitted(path.relative(root, target).split(path.sep).join('/'))
    )
      throw new Error('lintbron buiten de gecontroleerde invoer');
  }
}

/** @param {string} file @param {import('node:fs').Stats} before */
export function readLintFile(file, before) {
  const flags =
    typeof constants.O_NOFOLLOW === 'number' ? constants.O_RDONLY | constants.O_NOFOLLOW : constants.O_RDONLY;
  const descriptor = openSync(file, flags);
  try {
    const actual = fstatSync(descriptor);
    if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino || actual.mode !== before.mode)
      throw new Error('lintbron vervangen tijdens invoercontrole');
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** @param {string} file */
function checkedFile(file) {
  return readLintFile(file, lstatSync(file));
}

/** @param {{ root: string, hash: import('node:crypto').Hash }} context @param {string} name */
function scan(context, name) {
  const base = path.posix.basename(name);
  if ((base === '.env' || base.startsWith('.env.')) && /\.(?:[cm]?[jt]sx?)$/.test(base))
    throw new Error('niet-leesbare mogelijke lintbron');
  if (omitted(name)) return;
  const absolute = path.join(context.root, name);
  const stat = lstatSync(absolute);
  context.hash.update(JSON.stringify([name, stat.mode]));
  if (stat.isSymbolicLink()) {
    const target = realpathSync(absolute);
    const packages = path.join(context.root, 'node_modules');
    if (
      !name.startsWith('node_modules/') ||
      !inside(packages, target) ||
      omitted(path.relative(context.root, target).split(path.sep).join('/'))
    )
      throw new Error('externe of niet-onderzochte symlink');
    context.hash.update(JSON.stringify(readlinkSync(absolute)));
  } else if (stat.isDirectory()) {
    for (const child of readdirSync(absolute).sort()) scan(context, path.posix.join(name, child));
  } else if (stat.isFile()) {
    const content = readLintFile(absolute, stat);
    context.hash.update(digest(content));
    if ((!name.startsWith('node_modules/') && /\.(?:[cm]?[jt]sx?)$/.test(name)) || /\.[cm]?tsx?$/.test(name))
      checkReferences({ root: context.root, name, text: content.toString('utf8') });
    if (base === 'package.json') checkPackagePaths({ root: context.root, name, text: content.toString('utf8') });
    if (!name.startsWith('node_modules/') && /^tsconfig.*\.json$/.test(base) && !Object.hasOwn(CONFIGS, name))
      throw new Error('niet-onderzocht TypeScript-project');
  } else throw new Error('niet-regulier invoerbestand');
}

/**
 * Werkelijke inhoud, niet HEAD/mtime/lockfile alleen. Iedere onzekere invoer schakelt hergebruik uit.
 * @param {{ root: string, env: NodeJS.ProcessEnv, node?: string }} input
 * @returns {string | null}
 */
export function lintInputKey({ root, env, node = process.execPath }) {
  try {
    if (env['NODE_OPTIONS'] || !safeNodePath(root, env['NODE_PATH']) || !supported(root) || parentPackages(root))
      return null;
    const hash = createHash('sha256');
    hash.update(
      JSON.stringify([
        'lint-v1',
        realpathSync(root),
        process.version,
        process.platform,
        process.arch,
        lintEnvironment(env, root),
      ]),
    );
    hash.update(digest(checkedFile(node)));
    scan({ root, hash }, '');
    return hash.digest('hex');
  } catch {
    return null;
  }
}
