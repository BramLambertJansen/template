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

/** De zelfladende paden waar deze woorden naar wijzen. @param {readonly string[]} woorden @param {ZelfCtx} ctx */
function doelen(woorden, ctx) {
  const lijst = ctx.config.zelfladend ?? [];
  const gevonden = new Set();
  for (const woord of woorden)
    for (const deel of woord.split(SCHEIDING)) {
      const rel = deel === '' ? null : relatief(deel, ctx);
      if (rel !== null && zelfladendPatroon(rel, lijst) !== null) gevonden.add(rel);
    }
  return [...gevonden];
}

/**
 * Woorden die het programma kan beschrijven: bij een leesprogramma geen (alleen de redirects), bij git buiten de werkmap alleen
 * de waarden van schrijfopties (`--output=…`, `-o …`, `--output-directory …`).
 * @param {readonly string[]} argv
 */
function schrijfWoorden(argv) {
  const naam = programName(argv[0] ?? '');
  const args = argv.slice(1);
  if (naam === 'sed' && !args.some((arg) => /^(?:-[^-]*i|--in-place)/.test(arg))) return [];
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
  const rel = GLOB.test(pad) ? null : relatief(pad, ctx);
  if (rel === null || doelen([pad], ctx).length > 0) return false;
  return !(ctx.config.zelfladend ?? []).some((patroon) => !patroon.startsWith('!') && basis(patroon).toLowerCase().startsWith(`${rel.toLowerCase()}/`));
}

/**
 * Een git-subcommando dat de werkmap schrijft, mag een subagent alleen met expliciete paden buiten de zelfladende lijst
 * (`git checkout -- src/x.ts`).
 * @param {readonly string[]} argv @param {ZelfCtx} ctx
 */
function gitWerkmapZonderPaden(argv, ctx) {
  if (programName(argv[0] ?? '') !== 'git') return null;
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
  if (subcommand === 'switch') return true;
  if (subcommand === 'checkout') return scheiding < 0 && rest.filter((arg) => !arg.startsWith('-')).length <= 1;
  return subcommand === 'restore' && alleenIndex(scheiding >= 0 ? rest.slice(0, scheiding) : rest);
}

/** De paden die het commando noemt: na `--`, of de losse woorden waar git ze als pad leest. @param {string} subcommand @param {readonly string[]} rest */
function gitPaden(subcommand, rest) {
  const scheiding = rest.indexOf('--');
  if (scheiding >= 0) return rest.slice(scheiding + 1);
  const losse = rest.filter((arg) => !arg.startsWith('-'));
  if (ALLEEN_PADEN.has(subcommand)) return losse;
  return subcommand === 'checkout' ? losse.slice(1) : [];
}

/**
 * AC-3: `.git/**` is deny voor elke rol; de andere zelfladende paden deny voor een subagent en ask voor de hoofdsessie.
 * @param {{ argv: readonly string[], redirects: readonly string[], role: string }} commando
 * @param {ZelfCtx} ctx @param {ZelfBesluit} besluit
 */
export function zelfladend({ argv, redirects, role }, ctx, besluit) {
  for (const rel of doelen([...redirects, ...schrijfWoorden(argv)], ctx)) {
    const melding = `${rel} is een zelfladend pad (spec rolhek-vooraf-krimp AC-3): de toets op effect zou daarna niet meer kunnen kijken`;
    if (rel.split('/')[0]?.toLowerCase() === '.git') besluit.deny.push(`${melding}; verboden, voor elke rol (R-ROL-03)`);
    else if (role === 'hoofdsessie') besluit.ask.push(melding);
    else besluit.deny.push(`subagent: ${melding}`);
  }
  const git = role === 'hoofdsessie' ? null : gitWerkmapZonderPaden(argv, ctx);
  if (git !== null)
    besluit.deny.push(`subagent: git ${git} schrijft de werkmap, ook zelfladende paden; alleen met expliciete paden buiten de zelfladende lijst (spec rolhek-vooraf-krimp AC-3)`);
}
