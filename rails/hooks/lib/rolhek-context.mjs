// Context van het rolhek (ADR 0045): configuratie uit het anker, vertrouwde basis, lezen uit de werkmap.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './rolhek.mjs';
import { gitText, readAuthority, repositoryName, trustedBase } from './authority-context.mjs';
import { anker } from './objecten.mjs';
import { APP_BESTAND } from './padtabel.mjs';
import { ankerVerouderd, trustedKitScript, trustedMerge, trustedRunner } from './runner-authority.mjs';

/**
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // `ls-files` over een grote app-repo past niet in de standaard 1 MiB.
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** @param {() => boolean} probe */
function safe(probe) {
  try {
    return probe();
  } catch {
    return false;
  }
}

/**
 * De configuratie en of die uit het anker komt. Binnen een hook (anker gezet) alleen uit het anker, gecontroleerd gelezen, anders een
 * fout (het rolhek faalt dan dicht); daarbuiten de vertrouwde basis van readAuthority, met terugval op de werkmap. Het app-bestand
 * `.claude/gates.app.json` (spec app-padtabel) komt uit dezelfde bron als gates.json; afwezig betekent geen app-rijen.
 * @param {string} root
 * @param {{ read: (file: string) => string | null, readOptional?: (file: string) => string | { afwezig: true } } | null} basis
 * @param {import('./task-authority.mjs').Authority | null} authority
 */
function configuratie(root, basis, authority) {
  if (anker() !== null) {
    const text = basis?.read('.claude/gates.json') ?? null;
    if (text === null) throw new Error('geen gecontroleerde .claude/gates.json in het anker (ADR 0045)');
    if (basis?.readOptional === undefined) throw new Error(`geen gecontroleerde ${APP_BESTAND} in het anker (ADR 0045)`);
    return { config: loadConfig(text, appTekst(basis.readOptional(APP_BESTAND))), vertrouwd: true };
  }
  const trusted = authority?.trusted('.claude/gates.json') ?? null;
  if (trusted === null) {
    const text = readFileSync(path.join(root, '.claude/gates.json'), 'utf8');
    return { config: loadConfig(text, werkmapApp(root)), vertrouwd: false };
  }
  // Een basisobject zonder readOptional (oudere aanroeper, teststub): buiten een hook telt het app-bestand als afwezig.
  const app = basis?.readOptional === undefined ? null : appTekst(basis.readOptional(APP_BESTAND));
  return { config: loadConfig(trusted, app), vertrouwd: true };
}

const SETTINGS = '.claude/settings.json';

/**
 * Spec cloud-netwerkvorm (Ontwerp punt 1, AC-7): de patronen uit `sandbox.excludedCommands`, uit dezelfde bron als gates.json.
 * Binnen een hook alleen uit het anker: ontbreekt het bestand daar, dan een lege lijst (OV-8); onleesbaar of geen geldige JSON
 * gooit (het rolhek faalt dicht). Daarbuiten de vertrouwde basis met terugval op de werkmap; ontbreekt het bestand daar, dan geen
 * patronen. Zonder `excludedCommands` een lege lijst.
 * @param {string} root
 * @param {{ read: (file: string) => string | null, readOptional?: (file: string) => string | { afwezig: true } } | null} basis
 * @param {import('./task-authority.mjs').Authority | null} authority
 * @returns {string[]}
 */
function netwerkvormen(root, basis, authority) {
  if (anker() !== null) {
    if (basis?.readOptional === undefined) throw new Error(`geen gecontroleerde ${SETTINGS} in het anker (spec cloud-netwerkvorm)`);
    const gelezen = basis.readOptional(SETTINGS);
    return typeof gelezen === 'string' ? excludedCommands(gelezen) : [];
  }
  const text = authority?.trusted(SETTINGS) ?? werkmapTekst(root, SETTINGS);
  return text === null ? [] : excludedCommands(text);
}

/** `sandbox.excludedCommands` uit de tekst van een settingsbestand; ongeldige JSON gooit. @param {string} text */
function excludedCommands(text) {
  /** @type {unknown} */
  const raw = JSON.parse(text);
  const kind = (/** @type {unknown} */ waarde, /** @type {string} */ sleutel) =>
    typeof waarde === 'object' && waarde !== null ? Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1] : undefined;
  const lijst = kind(kind(raw, 'sandbox'), 'excludedCommands');
  return Array.isArray(lijst) ? lijst.filter((regel) => typeof regel === 'string') : [];
}

/** Een bestand uit de werkmap: ENOENT is afwezig (null), elke andere fout gooit. @param {string} root @param {string} rel */
function werkmapTekst(root, rel) {
  try {
    return readFileSync(path.join(root, rel), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {string | { afwezig: true }} gelezen */
const appTekst = (gelezen) => (typeof gelezen === 'string' ? gelezen : null);

/** Het app-bestand uit de werkmap: ENOENT is afwezig, elke andere fout gooit. @param {string} root */
function werkmapApp(root) {
  return werkmapTekst(root, APP_BESTAND);
}

/**
 * Onderhoudsmodus (ADR 0045 punt 8): alleen uit de configuratie van het anker en alleen als origin die repository is.
 * @param {import('./rolhek.mjs').Config} config
 * @param {boolean} vertrouwd
 * @param {string} root
 */
function onderhoudActief(config, vertrouwd, root) {
  const doel = config.onderhoud?.repository;
  const origin = repositoryName(gitText(root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  return vertrouwd && doel !== undefined && origin !== null && origin.toLowerCase() === doel.toLowerCase();
}

/**
 * @param {string} root
 * @param {string} cwd
 */
export function rolhekContext(root, cwd) {
  /** @type {boolean | undefined} */
  let trusted;
  /** @type {boolean | undefined} */
  let mergeVertrouwd;
  /** @type {boolean | undefined} */
  let kitVertrouwd;
  const authority = readAuthority({ root });
  const basis = trustedBase(root, undefined);
  const { config, vertrouwd } = configuratie(root, basis, authority);
  return {
    root,
    cwd,
    config,
    netwerkvormen: netwerkvormen(root, basis, authority),
    onderhoud: onderhoudActief(config, vertrouwd, root),
    read: (/** @type {string} */ rel) => {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
    committed: committedIn(root, basis?.sha ?? null),
    isDir: (/** @type {string} */ rel) => safe(() => statSync(path.join(root, rel)).isDirectory()),
    // Een map als doel (rm -r, find -delete, cp -r): wat eronder staat, getrackt of nieuw en niet genegeerd (R-ROL-08).
    files: (/** @type {string} */ rel) =>
      git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', rel === '' ? '.' : rel])
        .split('\0')
        .filter((file) => file !== ''),
    branch: gitBranch(root),
    gevolgd: (/** @type {readonly string[]} */ paden) => gevolgdeBestanden({ root, cwd }, paden),
    werkmappen: () => werkmapRoots(root),
    authority,
    runnerTrusted: () => (trusted ??= trustedRunner(root, basis)),
    mergeTrusted: () => (mergeVertrouwd ??= trustedMerge(root, basis)),
    kitTrusted: () => (kitVertrouwd ??= trustedKitScript(root, basis)),
    // Leerpunt #888: alleen voor de melding bij een weigering van de ankertoets.
    ankerVerouderd: () => ankerVerouderd(root, basis),
  };
}

/**
 * Een migratie is gecommit als hij in de merge-base met het anker of met origin/main staat (de strengste van beide), zoals
 * check:migrations kijkt (WS-04 punt 5). Zijn beide onleesbaar, dan terugval op HEAD en 'zonder-origin' ("git fetch origin").
 * @param {string} root
 * @param {string | null} basis
 * @returns {(rel: string) => boolean | 'zonder-origin'}
 */
function committedIn(root, basis) {
  /** @type {string[] | undefined} */
  let bases;
  const exists = (/** @type {string} */ tree, /** @type {string} */ rel) =>
    safe(() => git(root, ['cat-file', '-e', `${tree}:${rel}`]) === '');
  return (rel) => {
    bases ??= [basis, 'origin/main'].flatMap((ref) => {
      const sha = ref === null ? null : mergeBase(root, ref);
      return sha === null ? [] : [sha];
    });
    if (bases.length > 0) return bases.some((tree) => exists(tree, rel));
    return exists('HEAD', rel) ? 'zonder-origin' : false;
  };
}

/** @param {string} root @param {string} basis */
function mergeBase(root, basis) {
  try {
    return git(root, ['merge-base', basis, 'HEAD']) || null;
  } catch {
    return null;
  }
}

const GEWOON_BESTAND = new Set(['100644', '100755']);

/**
 * Spec rolhek-lezen/AC-11: de doorgegeven paden (zoals getypt, opgelost tegen `cwd`) die git volgt als gewoon bestand. Een pad
 * telt alleen als het zelf en zijn `realpath` binnen de root liggen en allebei exact in de index staan met modus 100644 of
 * 100755: zo blijven een link naar buiten, een map die op schijf een link is, een gevolgde link naar een niet-gevolgd bestand
 * en een map als pathspec dicht. Eén aanroep `git --literal-pathspecs ls-files -s -z -- <paden>` (`--`: een pad wordt nooit
 * een optie; geen pathspec-magie; `-z`: geen aanhaling van bijzondere namen). Faalt git, dan telt geen pad (dicht).
 * @param {{ root: string, cwd: string }} plek @param {readonly string[]} paden
 * @returns {Set<string>}
 */
function gevolgdeBestanden({ root, cwd }, paden) {
  const binnen = (/** @type {string} */ basis, /** @type {string} */ doel) => {
    const rel = path.relative(basis, doel);
    return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/');
  };
  const kandidaten = paden.flatMap((pad) => {
    try {
      const absoluut = path.resolve(cwd, pad);
      const getypt = binnen(root, absoluut);
      const echt = binnen(realpathSync(root), realpathSync(absoluut));
      return getypt === null || echt === null ? [] : [{ pad, getypt, echt }];
    } catch {
      return [];
    }
  });
  if (kandidaten.length === 0) return new Set();
  const modus = indexModi(root, [...new Set(kandidaten.flatMap(({ getypt, echt }) => [getypt, echt]))]);
  const gewoon = (/** @type {string} */ rel) => GEWOON_BESTAND.has(modus.get(rel) ?? '');
  return new Set(kandidaten.filter(({ getypt, echt }) => gewoon(getypt) && gewoon(echt)).map(({ pad }) => pad));
}

/**
 * De modus per pad uit de index; leeg als git faalt.
 * @param {string} root @param {readonly string[]} paden repo-relatief
 * @returns {Map<string, string>}
 */
function indexModi(root, paden) {
  /** @type {Map<string, string>} */
  const modi = new Map();
  try {
    const uit = git(root, ['--literal-pathspecs', 'ls-files', '-s', '-z', '--', ...paden]);
    for (const regel of uit.split('\0')) {
      const tab = regel.indexOf('\t');
      if (tab !== -1) modi.set(regel.slice(tab + 1), regel.split(' ')[0] ?? '');
    }
  } catch {
    modi.clear();
  }
  return modi;
}

/**
 * Spec rolhek-lezen/AC-15: de roots uit `git worktree list --porcelain`, zonder een werkmap met een `prunable`-regel (de map
 * is weg; wie hem opnieuw maakt, krijgt geen root); faalt git, dan alleen `root` (dicht).
 * @param {string} root @returns {string[]}
 */
function werkmapRoots(root) {
  try {
    const blokken = git(root, ['worktree', 'list', '--porcelain']).split(/\n\s*\n/).map((blok) => blok.split('\n'));
    const levend = blokken.filter((regels) => !regels.some((regel) => regel === 'prunable' || regel.startsWith('prunable ')));
    const roots = levend.flatMap((regels) => regels.filter((regel) => regel.startsWith('worktree ')).map((regel) => regel.slice('worktree '.length)));
    return [root, ...roots];
  } catch {
    return [root];
  }
}

/** @param {string} root */
function gitBranch(root) {
  try {
    return git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return '';
  }
}

