// `pnpm pr:merge <nr>` (ADR 0069 punt 3, ADR 0089 punt 5): de enige route waarlangs de hoofdsessie een PR zelf merget. Alles
// wordt via de REST-API van GitHub gelezen, niet uit de lokale `origin/main`; elke ontbrekende voorwaarde geeft een eigen
// regel en exit 1 zonder schrijfactie. Pas als alles klopt: squash-merge met de head-SHA als voorwaarde. Geen inhoudstoets:
// wie een pad goedkeurt, bewaakt de ruleset op main met `.github/CODEOWNERS` (ADR 0089); blijft: de
// modus `merge` uit `.claude/gates.json` op main, de verplichte checks op de head en een groene main. De leerpuntreden blijft (ADR 0078 punt 2).
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { parseCheckRun } from './github-evidence.mjs';
import { leerpuntMergeRedenen } from './leerpunt.mjs';
import { checkProgress } from './pr-verify.mjs';

const SHA = /^[0-9a-f]{40}$/;
// `pnpm run` zet `node_modules/.bin` vooraan in PATH: een daar geplante `gh` mag de GitHub-antwoorden niet leveren.
const ZONDER_BIN = {
  ...process.env,
  PATH: (process.env['PATH'] ?? '')
    .split(':')
    .filter((deel) => !/(?:^|\/)node_modules\/\.bin\/?$/.test(deel))
    .join(':'),
};

/** @typedef {(endpoint: string) => unknown} Api */

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** @param {unknown} waarde @param {...string} sleutels */
function pad(waarde, ...sleutels) {
  return sleutels.reduce((huidig, sleutel) => veld(huidig, sleutel), waarde);
}

/** @param {unknown} waarde */
const tekst = (waarde) => (typeof waarde === 'string' ? waarde : '');

/** Een lijst over pagina's; `sleutel` als de items onder een veld staan. @param {Api} api @param {string} endpoint @param {string} [sleutel] */
function alle(api, endpoint, sleutel) {
  /** @type {unknown[]} */
  const items = [];
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    const scheiding = endpoint.includes('?') ? '&' : '?';
    const antwoord = api(`${endpoint}${scheiding}per_page=100&page=${String(pagina)}`);
    const deel = sleutel === undefined ? antwoord : veld(antwoord, sleutel);
    if (!Array.isArray(deel)) throw new Error(`GitHub-antwoord is geen lijst: ${endpoint}`);
    items.push(...deel);
    if (deel.length < 100) return items;
  }
  throw new Error(`Te veel items: ${endpoint}`);
}

/** Een bestand op een commit van main, via de contents-API. @param {Api} api @param {{ repo: string, sha: string, bestand: string }} doel */
function bestandOp(api, { repo, sha, bestand }) {
  try {
    const inhoud = tekst(veld(api(`repos/${repo}/contents/${bestand}?ref=${sha}`), 'content'));
    return JSON.parse(Buffer.from(inhoud, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** `merge` uit .claude/gates.json; ontbrekend of onbekend telt als `eigenaar` (ADR 0069 punt 3). @param {unknown} ruw */
export function leesModus(ruw) {
  return veld(ruw, 'merge') === 'niet-kritiek' ? 'niet-kritiek' : 'eigenaar';
}

/** @param {unknown} decisions @returns {string[]} */
function requiredChecks(decisions) {
  const lijst = veld(decisions, 'requiredChecks');
  return Array.isArray(lijst) && lijst.every((naam) => typeof naam === 'string') ? lijst : [];
}

/**
 * De PR zelf: open, geen draft, basis main, geen fork, head gelijk aan de lokale HEAD.
 * @param {unknown} raw @param {{ repo: string, head: string }} doel
 */
export function prRedenen(raw, { repo, head }) {
  const redenen = [];
  if (tekst(veld(raw, 'state')) !== 'open') redenen.push('de PR is niet open');
  if (veld(raw, 'draft') !== false) redenen.push('de PR is een draft');
  if (tekst(pad(raw, 'base', 'ref')) !== 'main') redenen.push('de basis is niet main');
  if (tekst(pad(raw, 'head', 'repo', 'full_name')) !== repo)
    redenen.push('de head staat niet in deze repository (fork)');
  const prHead = tekst(pad(raw, 'head', 'sha'));
  if (prHead !== head)
    redenen.push(`de head van de PR (${prHead.slice(0, 7)}) is niet de lokale HEAD (${head.slice(0, 7)})`);
  return redenen;
}

/** Alle verplichte checks op de head: dezelfde toets als `pr:verify`. @param {unknown[]} ruw @param {{ names: string[], sha: string }} vereist */
export function checkRedenen(ruw, vereist) {
  if (vereist.names.length === 0) return ['requiredChecks op main is leeg of onleesbaar'];
  const voortgang = checkProgress(ruw.map(parseCheckRun), vereist);
  return voortgang.state === 'success' ? [] : [`verplichte checks niet groen: ${voortgang.lines.join(', ')}`];
}

/**
 * `main` is groen: elke verplichte check die op de kop van main draaide, is geslaagd, en er draaide er minstens één. De
 * guard-checks draaien alleen op PR's, dus ontbrekende namen tellen niet.
 * @param {unknown[]} ruw @param {{ names: string[], sha: string }} vereist
 */
export function mainRedenen(ruw, vereist) {
  const checks = ruw
    .map(parseCheckRun)
    .filter((check) => vereist.names.includes(check.name) && check.headSha === vereist.sha);
  const laatste = vereist.names
    .map((naam) => checks.filter((check) => check.name === naam).toSorted((a, b) => b.id - a.id)[0])
    .filter((check) => check !== undefined);
  if (laatste.length === 0) return ['geen verplichte check op de kop van main'];
  const fout = laatste.filter((check) => check.status !== 'completed' || check.conclusion !== 'success');
  return fout.length === 0
    ? []
    : [`main is niet groen: ${fout.map((c) => `${c.name} ${c.conclusion ?? c.status}`).join(', ')}`];
}

/**
 * De voorwaarden die na ADR 0089 punt 5 blijven; geen redenen betekent mergen. Een onleesbare of ontbrekende modus op main
 * telt als `eigenaar`: nooit een crash, nooit een merge.
 * @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel
 * @returns {{ redenen: string[] }}
 */
export function beoordeelMerge(api, { repo, nummer, head }) {
  if (!SHA.test(head)) return { redenen: ['geen geldige lokale HEAD'] };
  const mainSha = tekst(pad(api(`repos/${repo}/branches/main`), 'commit', 'sha'));
  if (!SHA.test(mainSha)) return { redenen: ['de kop van main is niet leesbaar'] };
  const gates = bestandOp(api, { repo, sha: mainSha, bestand: '.claude/gates.json' });
  if (leesModus(gates) !== 'niet-kritiek')
    return { redenen: ['de modus op main is niet "niet-kritiek": de eigenaar merget'] };
  const vereist = requiredChecks(bestandOp(api, { repo, sha: mainSha, bestand: '.claude/decisions.json' }));
  const pull = api(`repos/${repo}/pulls/${String(nummer)}`);
  const redenen = [
    ...prRedenen(pull, { repo, head }),
    ...checkRedenen(alle(api, `repos/${repo}/commits/${head}/check-runs`, 'check_runs'), { names: vereist, sha: head }),
    ...mainRedenen(alle(api, `repos/${repo}/commits/${mainSha}/check-runs`, 'check_runs'), {
      names: vereist,
      sha: mainSha,
    }),
    // Leest de beschrijving op het moment van mergen: `geen test:` of `meting:` in de sectie Leerpunt merget de eigenaar
    // (ADR 0078 punt 2, leerlus-bewijs AC-4).
    ...leerpuntMergeRedenen(tekst(veld(pull, 'body'))).map((reden) => `${reden}: de eigenaar merget`),
  ];
  return { redenen };
}

/** De voorwaarden van `beoordeelMerge`; een lege lijst betekent mergen. @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel */
export function voorwaarden(api, doel) {
  return beoordeelMerge(api, doel).redenen;
}

export const STEEKPROEF = 'Meld deze merge als steekproef (ADR 0069 punt 5).';

/**
 * De slotregels na een geslaagde merge: de melding en de steekproefregel (spec agent-merge-niet-kritiek AC-7). Het script
 * telt niet: de eigenaar telt (ADR 0069 punt 5).
 * @param {number} nummer @param {string} head
 */
export function slotRegels(nummer, head) {
  return [
    `PR #${String(nummer)} gemerged op ${head}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`,
    STEEKPROEF,
  ];
}

/** @param {string} endpoint @returns {unknown} */
function gh(endpoint) {
  try {
    return JSON.parse(
      execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: ZONDER_BIN }),
    );
  } catch {
    throw new Error(`GitHub is niet leesbaar: ${endpoint}`);
  }
}

/** @param {string[]} args */
export function nummerUit(args) {
  if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0] ?? '')) throw new Error('Gebruik: pnpm pr:merge <nummer>');
  return Number(args[0]);
}

function main() {
  const root = process.cwd();
  const nummer = nummerUit(process.argv.slice(2));
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim() ?? '';
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis');
  const repo = authority.repository;
  const { redenen } = beoordeelMerge(gh, { repo, nummer, head });
  if (redenen.length > 0) throw new Error(`Geen merge (ADR 0069):\n${redenen.map((r) => `- ${r}`).join('\n')}`);
  execFileSync(
    'gh',
    [
      'api',
      '-X',
      'PUT',
      `repos/${repo}/pulls/${String(nummer)}/merge`,
      '-f',
      'merge_method=squash',
      '-f',
      `sha=${head}`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], env: ZONDER_BIN },
  );
  console.log(slotRegels(nummer, head).join('\n'));
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
