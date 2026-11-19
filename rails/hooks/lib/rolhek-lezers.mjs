// Leesvormen van het rolhek (spec rolhek-lezen AC-11, AC-13 en AC-14; ADR 0099): één vormtoets voor de leeslijst van de
// reviewer en voor `leestAlleen` (AC-17, AC-18), zodat een vorm die de reviewer mag, voor elke rol als lezen telt. Puur;
// paden toetst de aanroeper (de reviewer met `ctx.gevolgd`, AC-11), want voor starten doet het pad er niet toe (AC-17).

/** @typedef {{ word: string, pattern: string, raw: string, expands: boolean }} Woord een woord met zijn vormen uit `Command` */

// Een positioneel woord mag ook een ref met `~` of `^` zijn (`HEAD~1`, `HEAD^:pad`).
const SAFE_REF = /^[A-Za-z0-9_./,:~^-]+$/;

/**
 * Een los woord of pad van de reviewer blijft binnen de repository (reviewer-opties/AC-3): niet `/` of `~` vooraan en geen
 * segment `..`, ook niet na `<ref>:`, en geen URL (`gh pr view <url>` leest een andere repo). Anders toont `git diff /dev/null .env` (impliciet --no-index) een bestand buiten de leesregels.
 * @param {string} word
 */
export function insideRepo(word) {
  return SAFE_REF.test(word) && !/^[/~]/.test(word) && !word.includes('://') && !word.split(/[/:]/).includes('..');
}

// rolhek-lezen/AC-8: `insideRepo` met daarbij de globtekens `*`, `?`, `[` en `]`.
const SAFE_PATHSPEC = /^[A-Za-z0-9_./,:~^*?[\]-]+$/;

/** Een pad of glob binnen de repo, zonder `:` vooraan (pathspec-magie), `-`, `/` of `~` (rolhek-lezen/AC-8). @param {string} word */
export function pathspecBinnen(word) {
  return SAFE_PATHSPEC.test(word) && !/^[-/~:]/.test(word) && !word.split(/[/:]/).includes('..');
}

/** Een pad volgens AC-8 waarvan een globteken aangehaald is (`Command.patterns`), zodat git de glob toepast en niet bash. @param {Woord} woord */
function pathspecAangehaald({ word, pattern }) {
  return pathspecBinnen(word) && !/[*?[]/.test(pattern);
}

const GETAL = /^[0-9]{1,7}$/;
const SED_SCRIPT = /^(?:[0-9]{1,7}|\$)(?:,(?:[0-9]{1,7}|\$))?p$/;
const WC_OPTIE = /^-[lwcm]+$/;
const LS_OPTIE = /^-[1aAlhdrtSRF]+$/;

/**
 * Waar de opties van een bestandslezer eindigen, of null als de vorm niet klopt (AC-11): `wc` met een cluster uit `lwcm`;
 * `head` met `-n <N>` of `-<N>`; `tail` ook met `-n +<N>`; `sed` alleen `-n '<a>p'` of `-n '<a>,<b>p'`; `ls` met een cluster
 * uit `1aAlhdrtSRF`.
 * @param {string} programma @param {readonly string[]} woorden de woorden na de programmanaam
 * @returns {number | null}
 */
function optiesEinde(programma, woorden) {
  const [eerste = '', tweede = ''] = woorden;
  switch (programma) {
    case 'wc':
    case 'ls': {
      const optie = programma === 'wc' ? WC_OPTIE : LS_OPTIE;
      const einde = woorden.findIndex((woord) => !optie.test(woord));
      return einde === -1 ? woorden.length : einde;
    }
    case 'head':
    case 'tail':
      return aantalEinde(programma, woorden);
    case 'sed':
      return eerste === '-n' && SED_SCRIPT.test(tweede) ? 2 : null;
    default:
      return null;
  }
}

/** `-n <N>` of `-<N>` (bij `tail` ook `-n +<N>`); zonder aantal beginnen de paden meteen. @param {string} programma @param {readonly string[]} woorden */
function aantalEinde(programma, woorden) {
  const [eerste = '', tweede = ''] = woorden;
  const aantal = programma === 'tail' ? /^\+?[0-9]{1,7}$/ : GETAL;
  if (eerste === '-n' && aantal.test(tweede)) return 2;
  return /^-[0-9]{1,7}$/.test(eerste) ? 1 : 0;
}

/**
 * De padargumenten van `wc`, `head`, `tail`, `sed` of `ls` als de vorm klopt (AC-11), anders null. Na de opties (of het
 * sed-script) is elk woord met `-` vooraan geweigerd, behalve één `--`: GNU-programma's lezen een optie ook na een pad. Geen
 * globteken (aangehaald of niet) en geen geëxpandeerd woord.
 * @param {string} programma @param {readonly Woord[]} args de woorden na de programmanaam
 * @returns {string[] | null}
 */
export function lezerPaden(programma, args) {
  if (args.some(({ word, expands }) => expands || /[*?[]/.test(word))) return null;
  const woorden = args.map(({ word }) => word);
  const einde = optiesEinde(programma, woorden);
  if (einde === null) return null;
  const rest = woorden.slice(einde);
  if (rest.filter((woord) => woord === '--').length > 1 || rest.some((woord) => woord.startsWith('-') && woord !== '--')) return null;
  return rest.filter((woord) => woord !== '--');
}

/** De git-subcommando's met een eigen leesvorm (AC-13, AC-14). */
export const GIT_VORMEN = new Set(['worktree', 'branch', 'tag', 'ls-tree', 'cat-file', 'rev-parse']);

const BRANCH = { flags: ['-r', '-a', '-v', '-vv', '--list', '-l'], values: ['--merged', '--no-merged', '--contains'] };
const TAG = { flags: ['--list', '-l'], values: ['--contains', '--points-at'] };
const LS_TREE = new Set(['-r', '-t', '-d', '-l', '--long', '--name-only', '--name-status', '--full-name', '--full-tree']);
const CAT_FILE = new Set(['-s', '-t', '-e', '-p']);
const REV_PARSE = new Set(['--show-toplevel', '--show-prefix', '--show-cdup', '--is-inside-work-tree', '--abbrev-ref', '--short',
  '--verify', '--symbolic-full-name']);

/**
 * Een leesvorm van `git worktree|branch|tag|ls-tree|cat-file|rev-parse` (AC-13, AC-14); elk ander woord of een geëxpandeerd
 * woord is geen leesvorm.
 * @param {string} subcommando @param {readonly Woord[]} args de woorden na het subcommando
 */
export function gitLeesvorm(subcommando, args) {
  if (args.some(({ expands }) => expands)) return false;
  const woorden = args.map(({ word }) => word);
  switch (subcommando) {
    case 'worktree':
      return woorden[0] === 'list' && (woorden.length === 1 || (woorden.length === 2 && woorden[1] === '--porcelain'));
    case 'branch':
      return lijstVorm(args, BRANCH);
    case 'tag':
      return lijstVorm(args, TAG);
    case 'ls-tree':
      return lsTreeVorm(args);
    case 'cat-file':
      return woorden.length === 2 && CAT_FILE.has(woorden[0] ?? '') && insideRepo(woorden[1] ?? '');
    case 'rev-parse':
      return woorden.every((woord) => REV_PARSE.has(woord) || (!woord.startsWith('-') && insideRepo(woord)));
    default:
      return false;
  }
}

/**
 * `git branch` en `git tag` die alleen lijsten: vaste vlaggen, een waarde-optie met een ref volgens `insideRepo`, en een
 * los woord alleen na `--list` of `-l` (een patroon; zonder `--list` maakt het een branch of tag).
 * @param {readonly Woord[]} args @param {{ flags: string[], values: string[] }} vorm
 */
function lijstVorm(args, { flags, values }) {
  let lijst = false;
  for (let index = 0; index < args.length; index += 1) {
    const woord = args[index] ?? { word: '', pattern: '', raw: '', expands: false };
    if (flags.includes(woord.word)) lijst ||= woord.word === '--list' || woord.word === '-l';
    else if (values.includes(woord.word)) {
      const ref = args[index + 1]?.word ?? '';
      if (ref.startsWith('-') || !insideRepo(ref)) return false;
      index += 1;
    } else if (!lijst || !lijstPatroon(woord)) return false;
  }
  return true;
}

/**
 * Een patroon van `git branch --list` of `git tag --list`: tekens uit `[A-Za-z0-9_./*-]`, niet met `-` vooraan, en een `*`
 * alleen aangehaald (`Command.patterns`), anders breidt bash hem uit tot bestandsnamen.
 * @param {Woord} woord
 */
function lijstPatroon({ word, pattern }) {
  return /^[A-Za-z0-9_./*-]+$/.test(word) && !word.startsWith('-') && !pattern.includes('*');
}

/**
 * `git ls-tree` met vaste vlaggen, precies één tree-ish volgens `insideRepo` en daarna paden volgens AC-8 (los of na `--`).
 * @param {readonly Woord[]} args
 */
function lsTreeVorm(args) {
  const streep = args.findIndex(({ word }) => word === '--');
  const voor = streep === -1 ? args : args.slice(0, streep);
  const na = streep === -1 ? [] : args.slice(streep + 1);
  if (voor.some(({ word }) => word.startsWith('-') && !LS_TREE.has(word))) return false;
  const [treeIsh, ...paden] = voor.filter(({ word }) => !word.startsWith('-'));
  if (treeIsh === undefined || !insideRepo(treeIsh.word)) return false;
  return [...paden, ...na].every(pathspecAangehaald);
}
