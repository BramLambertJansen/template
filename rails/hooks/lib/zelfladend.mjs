// Zelfladende paden (ADR 0071 punt 2, spec rolhek-vooraf-krimp AC-3): wat Claude Code, git of pnpm zelf laadt of uitvoert
// (`.git/**`, de hook-stubs, `.claude/settings.json`, `lefthook.yml`, `.pnpmfile.cjs`). Een schrijfactie daar kan de toets op
// effect uitschakelen voordat die kijkt; daarom toetst het rolhek deze paden vooraf, op elk woord van het commando.
import path from 'node:path';
import { gitSubcommand, programName } from './shell.mjs';

// Lezen zonder schrijven; `sed` alleen zonder `-i`/`--in-place` (AC-3).
const LEESLIJST = new Set(['cat', 'head', 'tail', 'ls', 'stat', 'wc', 'diff', 'grep', 'rg', 'jq']);
// Git-subcommando's die de werkmap schrijven (AC-3).
const GIT_WERKMAP = new Set([
  'checkout', 'switch', 'restore', 'reset', 'stash', 'apply', 'am', 'cherry-pick', 'merge', 'pull', 'rebase', 'revert',
  'read-tree', 'checkout-index',
]);
// Alleen deze nemen paden (na `--`); bij `apply`, `am`, `stash` … is een woord na `--` een patch of iets anders.
const PAD_SUBCOMMANDO = new Set(['checkout', 'restore', 'checkout-index', 'reset']);
// Bij deze subcommando's is elk woord zonder `-` een pad (er zijn geen refs als losse woorden).
const ALLEEN_PADEN = new Set(['restore', 'checkout-index']);
const GLOB = /[*?[]/;
// Tekens die in een pad voorkomen; de rest scheidt (aanhalingstekens, haakjes, `=`, komma's in `node -e`-tekst).
const SCHEIDING = /[^\w./*?[\]@+~-]+/;

/**
 * @typedef {{ root: string, cwd: string, config: { zelfladend?: readonly string[] | undefined } }} ZelfCtx
 * @typedef {{ deny: string[], ask: string[] }} ZelfBesluit
 */

/** @param {string} glob */
function basis(glob) {
  return glob.replace(/\/\*\*$/, '');
}

/**
 * Een glob-woord als reguliere expressie per padstuk; `*`, `?` en `[…]` passen niet op een `.` vooraan (bash zonder dotglob).
 * @param {string} stuk
 */
function stukRegex(stuk) {
  let uit = GLOB.test(stuk[0] ?? '') ? '(?!\\.)' : '';
  for (let index = 0; index < stuk.length; index += 1) {
    const teken = stuk[index] ?? '';
    const sluit = teken === '[' ? stuk.indexOf(']', index + 2) : -1;
    if (teken === '*') uit += '[^/]*';
    else if (teken === '?') uit += '[^/]';
    else if (sluit > 0) {
      uit += `[${stuk.slice(index + 1, sluit).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
      index = sluit;
    } else uit += teken.replace(/[.+^${}()|\\[\]]/g, '\\$&');
  }
  return new RegExp(`^${uit}$`, 'i');
}

/**
 * Het zelfladende patroon waar `rel` naar wijst, of null. Een gewoon woord wijst naar het pad zelf of de map van een `/**`-patroon;
 * een glob wijst ernaar als bash hem op zo'n pad kan laten passen. Hoofdletters tellen niet (`.Git` op macOS).
 * @param {string} rel @param {readonly string[]} lijst
 */
export function zelfladendPatroon(rel, lijst) {
  const behalve = lijst.filter((item) => item.startsWith('!')).map((item) => item.slice(1));
  const stukken = rel.split('/');
  for (const patroon of lijst.filter((item) => !item.startsWith('!'))) {
    const onder = patroon.endsWith('/**');
    const doel = basis(patroon).split('/');
    if (stukken.length < doel.length || (!onder && stukken.length !== doel.length)) continue;
    if (!doel.every((stuk, index) => stukRegex(stukken[index] ?? '').test(stuk))) continue;
    const uitgezonderd = behalve.some((uitzondering) => {
      const map = basis(uitzondering).split('/');
      return stukken.length >= map.length && map.every((stuk, index) => (stukken[index] ?? '').toLowerCase() === stuk.toLowerCase());
    });
    if (!uitgezonderd) return patroon;
  }
  return null;
}

/** Repo-relatief pad van een woord, of null als het buiten de repository ligt. @param {string} woord @param {ZelfCtx} ctx */
function relatief(woord, ctx) {
  const absoluut = path.posix.resolve(ctx.cwd, woord.replace(/^~(?=\/|$)/, '/~'));
  const rel = path.posix.relative(ctx.root, absoluut);
  return rel === '' || rel.startsWith('..') || path.posix.isAbsolute(rel) ? null : rel;
}

/**
 * Een woord als pad: git-pathspec-magie (`:/x`, `:(top)x`, `:!x`) wijst vanaf de root van de repository.
 * @param {string} deel @param {ZelfCtx} ctx
 */
function padVan(deel, ctx) {
  const magie = /^:(?:\([^)]*\)|[/!^]*)/.exec(deel);
  if (magie === null) return relatief(deel, ctx);
  return relatief(path.posix.join(ctx.root, deel.slice(magie[0].length)), ctx);
}

/** De zelfladende paden waar deze woorden naar wijzen. @param {readonly string[]} woorden @param {ZelfCtx} ctx */
function doelen(woorden, ctx) {
  const lijst = ctx.config.zelfladend ?? [];
  const gevonden = new Set();
  for (const woord of woorden)
    for (const deel of [woord, ...woord.split(SCHEIDING)]) {
      const rel = deel === '' ? null : padVan(deel, ctx);
      if (rel !== null && zelfladendPatroon(rel, lijst) !== null) gevonden.add(rel);
    }
  return [...gevonden];
}

/**
 * `sed` schrijft met `-i`/`--in-place`, met een script uit een bestand (`-f`) en met het commando `w`/`W` (`s/a/b/w x`, `w x`).
 * @param {readonly string[]} args
 */
function sedSchrijft(args) {
  return args.some((arg) => /^(?:-[^-]*[if]|--in-place|--file)/.test(arg) ||
    (!arg.startsWith('-') && /(?:^|[;{}\n])\s*[\d,$]*[wW]\s|\/[gpiImMe\d]*w\s/.test(arg)));
}

/**
 * Woorden die het programma kan beschrijven: bij een leesprogramma geen (alleen de redirects), bij git buiten de werkmap alleen
 * de waarden van schrijfopties (`--output=…`, `-o …`, `--output-directory …`).
 * @param {readonly string[]} argv
 */
function schrijfWoorden(argv) {
  const naam = programName(argv[0] ?? '');
  const args = argv.slice(1);
  if (naam === 'sed' && !sedSchrijft(args)) return [];
  if (LEESLIJST.has(naam)) return [];
  if (naam !== 'git') return argv;
  const { subcommand, rest } = gitSubcommand(args);
  if (GIT_WERKMAP.has(subcommand)) return argv;
  return rest.flatMap((arg, index) => {
    if (/^--o[a-z-]*=/.test(arg)) return [arg.slice(arg.indexOf('=') + 1)];
    const vorige = rest[index - 1] ?? '';
    return /^-[^-]*o$/.test(vorige) || /^--o[a-z-]*$/.test(vorige) ? [arg] : [];
  });
}

/**
 * `git restore --staged` zonder `--worktree` raakt alleen de index (ook `-S` en een afkorting als `--stag`).
 * @param {readonly string[]} opties de woorden vóór `--`
 */
function alleenIndex(opties) {
  const index = opties.some((arg) => /^--stag/.test(arg) || /^-[^-]*S/.test(arg));
  const werkmap = opties.some((arg) => /^--wor/.test(arg) || /^-[^-]*W/.test(arg));
  return index && !werkmap;
}

/**
 * Een letterlijk pad in de repository dat niet zelfladend is en er ook geen bevat (`.`, `.claude` tellen niet).
 * @param {string} pad @param {ZelfCtx} ctx
 */
function explicietBuiten(pad, ctx) {
  const rel = GLOB.test(pad) || pad.startsWith(':') || pad.includes('\\') ? null : relatief(pad, ctx);
  if (rel === null || doelen([pad], ctx).length > 0) return false;
  return !(ctx.config.zelfladend ?? []).some((patroon) => !patroon.startsWith('!') && basis(patroon).toLowerCase().startsWith(`${rel.toLowerCase()}/`));
}

/**
 * Een git-subcommando dat de werkmap schrijft, mag een subagent alleen met expliciete paden buiten de zelfladende lijst
 * (`git checkout -- src/x.ts`).
 * @param {readonly string[]} argv @param {ZelfCtx} ctx
 */
function gitWerkmapZonderPaden(argv, ctx) {
  // `git -C /elders …` schrijft een andere repository; de paden zelf toetst `doelen`.
  if (programName(argv[0] ?? '') !== 'git' || relatief(ctx.cwd, ctx) === null && ctx.cwd !== ctx.root) return null;
  const { subcommand, rest } = gitSubcommand(argv.slice(1));
  if (!GIT_WERKMAP.has(subcommand) || zonderWerkmapPaden(subcommand, rest)) return null;
  const paden = gitPaden(subcommand, rest);
  return paden.length > 0 && paden.every((pad) => explicietBuiten(pad, ctx)) ? null : subcommand;
}

/**
 * Een branchwissel zonder paden (`git switch -c x`, `git checkout feat/x`; AC-6, verse main) zet alleen gecommitte inhoud neer;
 * `git restore --staged` raakt alleen de index.
 * @param {string} subcommand @param {readonly string[]} rest
 */
function zonderWerkmapPaden(subcommand, rest) {
  const scheiding = rest.indexOf('--');
  if (rest.some((arg) => arg.startsWith('--pathspec-f'))) return false;
  if (subcommand === 'switch') return true;
  if (subcommand === 'checkout') return scheiding < 0 && rest.filter((arg) => !arg.startsWith('-')).length <= 1;
  return subcommand === 'restore' && alleenIndex(scheiding >= 0 ? rest.slice(0, scheiding) : rest);
}

/** De paden die het commando noemt: na `--`, of de losse woorden waar git ze als pad leest. @param {string} subcommand @param {readonly string[]} rest */
function gitPaden(subcommand, rest) {
  if (!PAD_SUBCOMMANDO.has(subcommand) || rest.some((arg) => arg.startsWith('--pathspec-f'))) return [];
  const scheiding = rest.indexOf('--');
  if (scheiding >= 0) return rest.slice(scheiding + 1);
  const losse = rest.filter((arg) => !arg.startsWith('-'));
  if (ALLEEN_PADEN.has(subcommand)) return losse;
  return subcommand === 'checkout' ? losse.slice(1) : [];
}

/**
 * `git -C <map>` verlegt waar de paden gelden; `--work-tree`/`--git-dir` verleggen de werkmap zelf (dan valt de toets dicht).
 * @param {readonly string[]} argv @param {ZelfCtx} ctx
 * @returns {{ ctx: ZelfCtx, omgelegd: boolean }}
 */
function gitWerkmap(argv, ctx) {
  if (programName(argv[0] ?? '') !== 'git') return { ctx, omgelegd: false };
  let cwd = ctx.cwd;
  let omgelegd = false;
  for (let index = 1; index < argv.length && (argv[index] ?? '').startsWith('-'); index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '-C') cwd = path.posix.resolve(cwd, argv[(index += 1)] ?? '');
    else if (/^--(?:work-tree|git-dir)/.test(arg)) {
      omgelegd = true;
      if (!arg.includes('=')) index += 1;
    } else if (['-c', '--namespace', '--exec-path'].includes(arg)) index += 1;
  }
  return { ctx: { ...ctx, cwd }, omgelegd };
}

const KOPIEER = new Set(['cp', 'mv', 'rsync', 'install', 'ln']);
// Een bronnaam die zelf een zelfladend pad of een map erboven kan worden.
const RISICONAAM = new Set(['.', '.git', '.claude', 'hooks', 'settings.json', 'lefthook.yml', '.pnpmfile.cjs']);

/**
 * Een kopieer- of uitpakdoel dat een map boven een zelfladend pad is (`cp -r /tmp/x/. .`, `tar -x -C .claude`, `unzip -o x.zip`).
 * @param {readonly string[]} argv
 * @returns {string | null} het doel, of null
 */
function mapDoel(argv) {
  const naam = programName(argv[0] ?? '');
  const args = argv.slice(1);
  const waarde = (/** @type {RegExp} */ optie) => {
    const index = args.findIndex((arg) => optie.test(arg));
    if (index < 0) return null;
    const arg = args[index] ?? '';
    return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[index + 1] ?? null;
  };
  if (naam === 'tar' && args.some((arg) => /^(?:-?[a-zA-Z]*x|--extract|--get)/.test(arg))) return waarde(/^(?:-C|--directory)/) ?? '.';
  if (naam === 'unzip') return waarde(/^-d$/) ?? '.';
  if (!KOPIEER.has(naam)) return null;
  const losse = args.filter((arg) => !arg.startsWith('-'));
  const recursief = args.some((arg) => /^(?:-[a-zA-Z]*[rRa]|--recursive|--archive)/.test(arg));
  const risico = recursief || losse.slice(0, -1).some((bron) => RISICONAAM.has(path.posix.basename(bron)));
  return risico ? waarde(/^(?:-t|--target-directory)/) ?? losse.at(-1) ?? null : null;
}

/** Een map boven (of gelijk aan) een zelfladend pad, de root inbegrepen. @param {string} doel @param {ZelfCtx} ctx */
function bovenZelfladend(doel, ctx) {
  const absoluut = path.posix.resolve(ctx.cwd, doel);
  const rel = path.posix.relative(ctx.root, absoluut);
  if (rel.startsWith('..') || path.posix.isAbsolute(rel)) return false;
  return (ctx.config.zelfladend ?? []).some((patroon) =>
    !patroon.startsWith('!') && (rel === '' || basis(patroon).toLowerCase().startsWith(`${rel.toLowerCase()}/`)));
}

/** @param {string} melding @param {string} role @param {ZelfBesluit} besluit */
function weiger(melding, role, besluit) {
  if (role === 'hoofdsessie') besluit.ask.push(melding);
  else besluit.deny.push(`subagent: ${melding}`);
}

/**
 * AC-3: `.git/**` is deny voor elke rol; de andere zelfladende paden deny voor een subagent en ask voor de hoofdsessie.
 * `ctx.cwd` is de map na een eerdere `cd` in hetzelfde commando.
 * @param {{ argv: readonly string[], redirects: readonly string[], role: string }} commando
 * @param {ZelfCtx} basisCtx @param {ZelfBesluit} besluit
 */
export function zelfladend({ argv, redirects, role }, basisCtx, besluit) {
  const { ctx, omgelegd } = gitWerkmap(argv, basisCtx);
  for (const rel of doelen([...redirects, ...schrijfWoorden(argv)], ctx)) {
    const melding = `${rel} is een zelfladend pad (spec rolhek-vooraf-krimp AC-3): de toets op effect zou daarna niet meer kunnen kijken`;
    if (rel.split('/')[0]?.toLowerCase() === '.git') besluit.deny.push(`${melding}; verboden, voor elke rol (R-ROL-03)`);
    else weiger(melding, role, besluit);
  }
  const doel = mapDoel(argv);
  if (doel !== null && bovenZelfladend(doel, ctx))
    weiger(`\`${doel}\` is een map boven zelfladende paden; kopiëren of uitpakken daarin kan ze vervangen (spec rolhek-vooraf-krimp AC-3)`, role, besluit);
  const { subcommand } = gitSubcommand(argv.slice(1));
  if (omgelegd && GIT_WERKMAP.has(subcommand))
    weiger(`git ${subcommand} met --work-tree/--git-dir: het rolhek ziet niet welke werkmap wordt geschreven`, role, besluit);
  const git = omgelegd ? null : gitWerkmapZonderPaden(argv, ctx);
  if (git !== null && role !== 'hoofdsessie')
    besluit.deny.push(`subagent: git ${git} schrijft de werkmap, ook zelfladende paden; alleen met expliciete paden buiten de zelfladende lijst (spec rolhek-vooraf-krimp AC-3)`);
}
