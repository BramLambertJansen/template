// `pnpm pr:merge <nr>` (ADR 0069 punt 3, ADR 0093 punt 3): de enige route waarlangs de hoofdsessie een PR zelf merget. Alles
// wordt via de REST-API van GitHub gelezen, niet uit de lokale `origin/main`; elke ontbrekende voorwaarde geeft een eigen
// regel en exit 1 zonder schrijfactie. Pas als alles klopt: squash-merge met de head-SHA als voorwaarde. De voorwaarden: de
// modus `merge` uit `.claude/gates.json` op main, de PR zelf, de padtoets, de verplichte checks op de head en een groene main.
// Padtoets (spec agent-samenvoegen): de bestanden van de PR tegen de padtabel op de kop van main, samengevoegd met
// `.claude/gates.app.json` als dat er is; raakt er één een beschermd pad, of is de lijst of de padtabel niet te lezen, dan
// voegt de eigenaar samen. GitHub maakt dat onderscheid niet meer (geen review van een code-eigenaar in de ruleset): dit
// script is daar een vangnet, geen grens, en controleert de ruleset niet. De beschrijving leest het niet: dat
// de eigenaar merget bij `geen test:` of `meting:` in de sectie Leerpunt, is een afspraak (ADR 0078 punt 1 en 2, herzien in #696).
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { globMatch, onderhoudVan, padNiveau, samengevoegd } from '../../rails/hooks/lib/padtabel.mjs';
import { parseCheckRun } from './github-evidence.mjs';
import { checkProgress } from './pr-verify.mjs';

const SHA = /^[0-9a-f]{40}$/;
// `pnpm run` zet `node_modules/.bin` vooraan in PATH: een daar geplante `gh` mag de GitHub-antwoorden niet leveren.
export const ZONDER_BIN = {
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
export function bestandOp(api, { repo, sha, bestand }) {
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

const NIET_TE_LEZEN = 'de bestanden van de PR of de padtabel op main zijn niet te lezen: de eigenaar voegt samen';
// De zones van `check-core`: in een app altijd beschermd (ADR 0093 punt 4).
const CORE_ZONES = ['src/core/', 'docs/template/'];
const MAX_GENOEMD = 5;

/** De globs uit `migraties`; ontbrekend is leeg, een andere vorm gooit. @param {unknown} tabel @returns {string[]} */
function migraties(tabel) {
  const lijst = veld(tabel, 'migraties');
  if (lijst === undefined) return [];
  if (!Array.isArray(lijst) || !lijst.every((glob) => typeof glob === 'string'))
    throw new Error('.claude/gates.json: migraties is geen lijst');
  return lijst;
}

/**
 * Is een pad beschermd, zodat de eigenaar samenvoegt (ADR 0093 punt 4, spec agent-samenvoegen AC-1 en AC-2)? In de template
 * (`onderhoud.repository` is deze repository): elk pad waarvan het besluit niet `agent` is. In een app: besluit `besluit-pr`,
 * schrijven `voorReview` of hoger, een migratie, of een zone van `check-core`. `tabel` is de ruwe gates-inhoud, al
 * samengevoegd met het app-bestand; gooit bij een padtabel die niet te lezen is (oude vorm, `paden` geen object).
 * @param {string} bestand @param {unknown} tabel @param {string} repo @returns {boolean}
 */
export function beschermdPad(bestand, tabel, repo) {
  const niveau = padNiveau(bestand, tabel);
  const onderhoud = onderhoudVan(veld(tabel, 'onderhoud'));
  if (onderhoud?.repository.toLowerCase() === repo.toLowerCase()) return niveau.besluit !== 'agent';
  return (
    niveau.besluit === 'besluit-pr' ||
    niveau.schrijven === 'voorReview' ||
    niveau.schrijven === 'altijdVragen' ||
    migraties(tabel).some((glob) => globMatch(glob, bestand)) ||
    CORE_ZONES.some((zone) => bestand.startsWith(zone))
  );
}

/**
 * `.claude/gates.app.json` op een commit van main: `null` als het niet bestaat (404). Elke andere fout en ongeldige JSON
 * gooien, zodat de padtoets weigert in plaats van app-rijen stil te negeren.
 * @param {Api} api @param {{ repo: string, sha: string }} doel @returns {unknown}
 */
function appBestand(api, { repo, sha }) {
  let antwoord;
  try {
    antwoord = api(`repos/${repo}/contents/.claude/gates.app.json?ref=${sha}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('HTTP 404')) return null;
    throw error;
  }
  return JSON.parse(Buffer.from(tekst(veld(antwoord, 'content')), 'base64').toString('utf8'));
}

/** De paden van één bestand uit `pulls/<nr>/files`: `filename` en, als het er is, `previous_filename`. @param {unknown} item @returns {string[]} */
function padenVanBestand(item) {
  const naam = veld(item, 'filename');
  const vorige = veld(item, 'previous_filename');
  if (typeof naam !== 'string' || naam === '') throw new Error('bestand zonder filename');
  if (vorige === undefined || vorige === null) return [naam];
  if (typeof vorige !== 'string' || vorige === '') throw new Error('previous_filename is geen tekst');
  return [naam, vorige];
}

/**
 * De padtoets (spec agent-samenvoegen AC-3): de bestanden van de PR, alle pagina's, tegen de padtabel op de kop van main.
 * Elke aanroep is afgevangen: een onleesbare lijst, meer dan tien pagina's of een onleesbare padtabel geeft een reden, nooit
 * een crash en nooit een merge.
 * @param {Api} api @param {{ repo: string, nummer: number, mainSha: string, gates: unknown }} doel @returns {string[]}
 */
export function padRedenen(api, { repo, nummer, mainSha, gates }) {
  try {
    const tabel = samengevoegd(gates, appBestand(api, { repo, sha: mainSha }));
    const paden = alle(api, `repos/${repo}/pulls/${String(nummer)}/files`).flatMap(padenVanBestand);
    const geraakt = [...new Set(paden)].filter((bestand) => beschermdPad(bestand, tabel, repo));
    if (geraakt.length === 0) return [];
    const meer = geraakt.length - MAX_GENOEMD;
    const genoemd = geraakt.slice(0, MAX_GENOEMD).join(', ') + (meer > 0 ? `, en ${String(meer)} meer` : '');
    return [`raakt een beschermd pad (${genoemd}): de eigenaar voegt samen`];
  } catch {
    return [NIET_TE_LEZEN];
  }
}

/**
 * De voorwaarden van ADR 0069 punt 3 en ADR 0093 punt 3: modus, PR, padtoets, checks op de head, groene main; geen redenen
 * betekent mergen. Een onleesbare of ontbrekende modus op main telt als `eigenaar`: nooit een crash, nooit een merge.
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
    ...padRedenen(api, { repo, nummer, mainSha, gates }),
    ...checkRedenen(alle(api, `repos/${repo}/commits/${head}/check-runs`, 'check_runs'), { names: vereist, sha: head }),
    ...mainRedenen(alle(api, `repos/${repo}/commits/${mainSha}/check-runs`, 'check_runs'), {
      names: vereist,
      sha: mainSha,
    }),
  ];
  return { redenen };
}

/** De voorwaarden van `beoordeelMerge`; een lege lijst betekent mergen. @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel */
export function voorwaarden(api, doel) {
  return beoordeelMerge(api, doel).redenen;
}

export const STEEKPROEF = 'Meld deze merge als steekproef (ADR 0069 punt 5).';

/**
 * De slotregels na een geslaagde merge: de melding en de steekproefregel (spec agent-samenvoegen AC-10). Het script
 * telt niet: de eigenaar telt (ADR 0069 punt 5).
 * @param {number} nummer @param {string} head
 */
export function slotRegels(nummer, head) {
  return [
    `PR #${String(nummer)} gemerged op ${head}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`,
    STEEKPROEF,
  ];
}

/**
 * Een 404 blijft herkenbaar in de melding (`HTTP 404`, zoals `gh api` het op stderr meldt): alleen daar telt een ontbrekend
 * `.claude/gates.app.json` als leeg. @param {string} endpoint @returns {unknown}
 */
export function gh(endpoint) {
  try {
    return JSON.parse(
      execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ZONDER_BIN }),
    );
  } catch (error) {
    const nietGevonden = tekst(veld(error, 'stderr')).includes('(HTTP 404)');
    throw new Error(`GitHub is niet leesbaar: ${endpoint}${nietGevonden ? ' (HTTP 404)' : ''}`, { cause: error });
  }
}

/** `script`: het pnpm-script in de gebruiksregel (`pnpm pr:resolve` hergebruikt dit, ADR 0098). @param {string[]} args */
export function nummerUit(args, script = 'pr:merge') {
  if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0] ?? '')) throw new Error(`Gebruik: pnpm ${script} <nummer>`);
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
