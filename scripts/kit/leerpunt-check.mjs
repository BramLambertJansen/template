// Issue-check voor leerpunten (ADR 0078 punt 3, spec leerlus-bewijs AC-5, AC-6, AC-13, AC-20 en AC-22). Draait in de workflow `leerpunt` op
// `issues` en `issue_comment`, vanaf de default branch, met alleen `issues: write` en `pull-requests: read`. Zet of haalt de
// labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` weg met één comment per soort; sluit, heropent of bewerkt niets.
// Alleen in de template-repo (`onderhoud.repository` in .claude/gates.json). Alleen `node:`- en relatieve imports.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COMMENT_ZONDER_BEWIJS,
  commentOnvolledig,
  eigenaarIds,
  graphqlData,
  leesSjabloon,
  lijst,
  sluitOordeel,
  toetsBody,
  vanEigenaar,
  veld,
} from './leerpunt.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
export const LABEL_ONVOLLEDIG = 'leerpunt-onvolledig';
export const LABEL_ZONDER_BEWIJS = 'leerpunt-zonder-bewijs';
const BOT = 'github-actions[bot]';
const MERK = { onvolledig: '<!-- leerpunt-check:onvolledig -->', bewijs: '<!-- leerpunt-check:zonder-bewijs -->' };

/** @typedef {{ naam: string, actie: string, nummer: number, open: boolean, body: string, labels: string[], reden: string }} Gebeurtenis */
/** @typedef {{ label: string, aan: boolean, comment: string | null, merk: string }} Stap */

/** @param {unknown} event @param {string} naam @returns {Gebeurtenis} */
export function leesGebeurtenis(event, naam) {
  const issue = veld(event, 'issue');
  return {
    naam,
    actie: String(veld(event, 'action') ?? ''),
    nummer: Number(veld(issue, 'number')),
    open: veld(issue, 'state') === 'open',
    body: String(veld(issue, 'body') ?? ''),
    labels: lijst(veld(issue, 'labels')).map((label) => String(veld(label, 'name'))),
    // De sluitreden (`completed`, `not_planned`, `duplicate`), ook bij `issue_comment` (spec leerlus-bewijs AC-13).
    reden: String(veld(issue, 'state_reason') ?? ''),
  };
}

/**
 * Wat de check bij deze gebeurtenis moet nagaan (AC-5, AC-6): het sjabloon bij openen, bewerken, labelen en heropenen; het
 * sluitbewijs bij sluiten, bij labelen van een gesloten issue en bij een nieuwe comment erop; bij heropenen ook het bewijslabel weg.
 * @param {Gebeurtenis} g @returns {{ sjabloon: boolean, sluiten: boolean, heropend: boolean }}
 */
export function teToetsen(g) {
  if (!g.labels.includes('leerpunt')) return { sjabloon: false, sluiten: false, heropend: false };
  const sjabloon = g.naam === 'issues' && ['opened', 'edited', 'labeled', 'reopened'].includes(g.actie);
  const sluiten =
    (g.naam === 'issues' && (g.actie === 'closed' || (g.actie === 'labeled' && !g.open))) ||
    (g.naam === 'issue_comment' && !g.open);
  return { sjabloon, sluiten, heropend: g.naam === 'issues' && g.actie === 'reopened' };
}

/**
 * De labelstappen voor de toetsen (puur): per soort label aan of uit, met de comment als het label aan gaat.
 * `velden` (het sjabloon) geeft de comment een hint per keuzeveld met een onbekende waarde (leerpunt #759).
 * @param {{ fouten: string[] | null, oordeel: string | null, heropend: boolean, velden?: import('./leerpunt.mjs').Veld[] }} uitslag
 * @returns {Stap[]}
 */
export function stappen({ fouten, oordeel, heropend, velden = [] }) {
  /** @type {Stap[]} */
  const uit = [];
  if (fouten !== null) {
    const aan = fouten.length > 0;
    uit.push({
      label: LABEL_ONVOLLEDIG,
      aan,
      comment: aan ? commentOnvolledig(fouten, velden) : null,
      merk: MERK.onvolledig,
    });
  }
  if (heropend) uit.push({ label: LABEL_ZONDER_BEWIJS, aan: false, comment: null, merk: MERK.bewijs });
  else if (oordeel !== null) {
    const aan = oordeel === 'zonder-bewijs';
    uit.push({ label: LABEL_ZONDER_BEWIJS, aan, comment: aan ? COMMENT_ZONDER_BEWIJS : null, merk: MERK.bewijs });
  }
  return uit;
}

// Spec leerlus-bewijs AC-13 (ADR 0101 punt 2): een comment die begint met `duplicaat van #<nr>`.
const DUPLICAAT = /^\s*duplicaat van #(\d+)\b/i;

/**
 * Is de REST-body van `repos/<repo>/issues/<nr>` een leerpunt: een issue (geen `pull_request`) met het label `leerpunt`?
 * `null` (een 404, of een 410 voor een verwijderd issue) bestaat niet.
 * @param {unknown} doel
 */
export function isLeerpuntDoel(doel) {
  if (doel === null || doel === undefined) return false;
  const pr = veld(doel, 'pull_request');
  if (pr !== undefined && pr !== null) return false;
  return lijst(veld(doel, 'labels')).some((label) => veld(label, 'name') === 'leerpunt');
}

/**
 * De doelnummers van geldige duplicaatcomments, in volgorde en zonder herhaling: van een eigenaaraccount uit `accounts`
 * (AC-22) en niet het issue zelf.
 * @param {number} nummer
 * @param {import('./leerpunt.mjs').Comment[]} comments
 * @param {unknown} accounts `leerpunt.accounts` uit .claude/gates.json, ongevalideerd
 */
export function duplicaatDoelen(nummer, comments, accounts) {
  const ids = eigenaarIds(accounts);
  const doelen = comments
    .filter((c) => vanEigenaar(ids, c))
    .map(({ body }) => Number(DUPLICAAT.exec(body)?.[1] ?? Number.NaN))
    .filter((doel) => Number.isInteger(doel) && doel !== nummer);
  return [...new Set(doelen)];
}

/**
 * Het sluitoordeel met duplicaat (AC-13): bewijs en achterhaald gaan voor (`sluitOordeel`, AC-6); daarna telt een sluiting
 * met reden `duplicate` en een geldige duplicaatcomment naar een ander leerpunt. `haalDoel` geeft de REST-body van het doel,
 * of `null` bij een 404 of 410.
 * @param {number} nummer
 * @param {{ prs: { merged: boolean, body: string }[], comments: import('./leerpunt.mjs').Comment[], reden: string, accounts?: unknown }} bron
 * @param {(doel: number) => Promise<unknown>} haalDoel
 * @returns {Promise<'bewijs' | 'achterhaald' | 'duplicaat' | 'zonder-bewijs'>}
 */
export async function beoordeelSluiting(nummer, bron, haalDoel) {
  const oordeel = sluitOordeel(nummer, bron);
  if (oordeel !== 'zonder-bewijs' || bron.reden !== 'duplicate') return oordeel;
  for (const doel of duplicaatDoelen(nummer, bron.comments, bron.accounts))
    if (isLeerpuntDoel(await haalDoel(doel))) return 'duplicaat';
  return 'zonder-bewijs';
}

// Spec leerlus-bewijs AC-20 (ADR 0109): `opgelost: <lijst>` met PR (`#834`), commit (7 tot 40 kleine hex) of `ADR 0100`.
const OPGELOST = /^\s*opgelost:(.*)$/is;
const VERWIJZINGEN = /** @type {const} */ ([
  ['pr', /^#(\d+)$/],
  ['commit', /^([0-9a-f]{7,40})$/],
  ['adr', /^ADR (\d{4})$/],
]);

/** @typedef {{ soort: 'pr' | 'commit' | 'adr', waarde: string }} Verwijzing */

/** @param {string} element @returns {Verwijzing | null} */
function leesVerwijzing(element) {
  for (const [soort, vorm] of VERWIJZINGEN) {
    const waarde = vorm.exec(element)?.[1];
    if (waarde !== undefined) return { soort, waarde };
  }
  return null;
}

/**
 * De verwijzingen van een `opgelost:`-comment in volgorde (puur), of `null` als de comment niet precies die vorm heeft.
 * @param {string} body @returns {Verwijzing[] | null}
 */
export function leesOpgelost(body) {
  const rest = OPGELOST.exec(body)?.[1];
  if (rest === undefined || rest.trim() === '') return null;
  /** @type {Verwijzing[]} */
  const uit = [];
  for (const element of rest.split(',')) {
    const verwijzing = leesVerwijzing(element.trim());
    if (verwijzing === null) return null;
    uit.push(verwijzing);
  }
  return uit;
}

/**
 * Bewijs via een sluiting als opgelost (AC-20): reden `completed` en minstens één `opgelost:`-comment van een
 * eigenaaraccount uit `accounts` (AC-22) waarvan elke PR gemerged is in de standaardbranch. `haalPr` geeft de REST-body van
 * de PR, of `null` bij 404 of 410.
 * Het issuenummer staat in de signatuur voor dezelfde vorm als `beoordeelSluiting`; de opgelost-tak gebruikt het niet.
 * @param {number} _nummer
 * @param {{ reden: string, comments: import('./leerpunt.mjs').Comment[], standaardBranch: string, accounts?: unknown }} bron
 * @param {(pr: number) => Promise<unknown>} haalPr
 * @returns {Promise<'opgelost' | 'zonder-bewijs'>}
 */
export async function beoordeelOpgelost(_nummer, bron, haalPr) {
  if (bron.reden !== 'completed') return 'zonder-bewijs';
  const ids = eigenaarIds(bron.accounts);
  for (const comment of bron.comments) {
    const verwijzingen = vanEigenaar(ids, comment) ? leesOpgelost(comment.body) : null;
    if (verwijzingen !== null && (await allePrsGemerged(verwijzingen, bron.standaardBranch, haalPr))) return 'opgelost';
  }
  return 'zonder-bewijs';
}

/**
 * @param {Verwijzing[]} verwijzingen @param {string} branch @param {(pr: number) => Promise<unknown>} haalPr
 */
async function allePrsGemerged(verwijzingen, branch, haalPr) {
  for (const { soort, waarde } of verwijzingen) {
    if (soort !== 'pr') continue;
    const pr = await haalPr(Number(waarde));
    if (veld(pr, 'merged') !== true || veld(veld(pr, 'base'), 'ref') !== branch) return false;
  }
  return true;
}

/** @param {string} tekst @returns {string | null} */
export function onderhoudRepo(tekst) {
  const repo = veld(veld(JSON.parse(tekst), 'onderhoud'), 'repository');
  return typeof repo === 'string' ? repo : null;
}

/** `leerpunt.accounts` uit de tekst van .claude/gates.json, ongevalideerd (AC-22; de pure functies toetsen hem). @param {string} tekst */
function leerpuntAccounts(tekst) {
  return veld(veld(JSON.parse(tekst), 'leerpunt'), 'accounts');
}

/** @param {string} naam */
function env(naam) {
  const waarde = process.env[naam];
  if (waarde === undefined || waarde === '') throw new Error(`${naam} ontbreekt`);
  return waarde;
}

/**
 * Telt dit antwoord als "bestaat niet" in plaats van als fout? Bij DELETE een 404 (label al weg); bij `magOntbreken` een 404
 * of een 410, die GitHub geeft voor een verwijderd issue (een doel dat niet bestaat, AC-13). Elke andere fout gooit.
 * @param {number} status @param {{ method?: string, magOntbreken?: boolean }} opties
 */
export function teltAlsOntbrekend(status, opties) {
  if (opties.method === 'DELETE') return status === 404;
  return opties.magOntbreken === true && (status === 404 || status === 410);
}

/**
 * REST of GraphQL naar GitHub; `null` bij 204 en bij een ontbrekend doel (`teltAlsOntbrekend`).
 * @param {string} pad @param {{ method?: string, body?: unknown, magOntbreken?: boolean }} [opties] @returns {Promise<unknown>}
 */
async function api(pad, opties = {}) {
  const antwoord = await globalThis.fetch(`https://api.github.com/${pad}`, {
    method: opties.method ?? 'GET',
    headers: { authorization: `Bearer ${env('GITHUB_TOKEN')}`, accept: 'application/vnd.github+json' },
    ...(opties.body === undefined ? {} : { body: JSON.stringify(opties.body) }),
  });
  const ontbreekt = !antwoord.ok && teltAlsOntbrekend(antwoord.status, opties);
  if (!antwoord.ok && !ontbreekt) throw new Error(`${pad}: HTTP ${String(antwoord.status)}`);
  return antwoord.status === 204 || ontbreekt ? null : antwoord.json();
}

/** Alle comments van een issue, pagina voor pagina (hooguit 3000). @param {string} issue @returns {Promise<unknown[]>} */
async function alleComments(issue) {
  /** @type {unknown[]} */
  const alle = [];
  for (let pagina = 1; pagina <= 30; pagina++) {
    const deel = lijst(await api(`${issue}/comments?per_page=100&page=${String(pagina)}`));
    alle.push(...deel);
    if (deel.length < 100) return alle;
  }
  throw new Error(`${issue}: meer dan 3000 comments`);
}

const SLUIT_QUERY = `query($owner: String!, $name: String!, $nummer: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $nummer) {
    closedByPullRequestsReferences(first: 20, includeClosedPrs: true) { nodes { merged body } }
  } }
}`;

/** @param {string} repo @param {number} nummer */
async function sluitBron(repo, nummer) {
  const [owner = '', name = ''] = repo.split('/');
  const data = await api('graphql', {
    method: 'POST',
    body: { query: SLUIT_QUERY, variables: { owner, name, nummer } },
  });
  const issue = veld(veld(graphqlData(data, ['repository', 'issue']), 'repository'), 'issue');
  const prs = lijst(veld(veld(issue, 'closedByPullRequestsReferences'), 'nodes')).map((pr) => ({
    merged: veld(pr, 'merged') === true,
    body: String(veld(pr, 'body') ?? ''),
  }));
  const comments = (await alleComments(`repos/${repo}/issues/${String(nummer)}`)).map((c) => ({
    body: String(veld(c, 'body') ?? ''),
    association: String(veld(c, 'author_association') ?? ''),
    // AC-22: het vaste GitHub-id beslist, niet de login of de association.
    id: veld(veld(c, 'user'), 'id'),
  }));
  return { prs, comments };
}

/** De doelopvraag voor `beoordeelSluiting`: REST `repos/<repo>/issues/<nr>`, `null` bij 404 of 410. @param {string} repo */
function haalIssue(repo) {
  return (/** @type {number} */ doel) => api(`repos/${repo}/issues/${String(doel)}`, { magOntbreken: true });
}

/** De PR-opvraag voor `beoordeelOpgelost`: REST `repos/<repo>/pulls/<nr>`, `null` bij 404 of 410. @param {string} repo */
function haalPr(repo) {
  return (/** @type {number} */ pr) => api(`repos/${repo}/pulls/${String(pr)}`, { magOntbreken: true });
}

/**
 * Het oordeel bij een sluiting: eerst `beoordeelSluiting` (bewijs, achterhaald, duplicaat), daarna de opgelost-tak (AC-20).
 * @param {string} repo @param {Gebeurtenis} g @param {unknown} accounts `leerpunt.accounts` uit .claude/gates.json (AC-22)
 */
async function sluitOordeelVoor(repo, g, accounts) {
  const bron = { ...(await sluitBron(repo, g.nummer)), reden: g.reden, accounts };
  const oordeel = await beoordeelSluiting(g.nummer, bron, haalIssue(repo));
  if (oordeel !== 'zonder-bewijs' || g.reden !== 'completed') return oordeel;
  const standaardBranch = String(veld(await api(`repos/${repo}`), 'default_branch') ?? '');
  return beoordeelOpgelost(g.nummer, { ...bron, standaardBranch }, haalPr(repo));
}

/** @param {string} repo @param {Gebeurtenis} g @param {Stap} stap */
async function voerUit(repo, g, stap) {
  const issue = `repos/${repo}/issues/${String(g.nummer)}`;
  if (stap.aan && !g.labels.includes(stap.label))
    await api(`${issue}/labels`, { method: 'POST', body: { labels: [stap.label] } });
  // Ook als de payload het label niet toont: een eerdere run kan het net gezet hebben (DELETE op 404 is goed).
  if (!stap.aan) await api(`${issue}/labels/${encodeURIComponent(stap.label)}`, { method: 'DELETE' });
  if (stap.comment === null) return;
  const tekst = `${stap.merk}\n${stap.comment}`;
  // Alleen een eigen comment: een ander kan het merk ook typen (dan zou de bot die comment overschrijven).
  const bestaand = (await alleComments(issue)).find(
    (c) => veld(veld(c, 'user'), 'login') === BOT && String(veld(c, 'body') ?? '').startsWith(stap.merk),
  );
  if (bestaand === undefined) await api(`${issue}/comments`, { method: 'POST', body: { body: tekst } });
  else
    await api(`repos/${repo}/issues/comments/${String(veld(bestaand, 'id'))}`, {
      method: 'PATCH',
      body: { body: tekst },
    });
}

async function main() {
  const repo = env('GITHUB_REPOSITORY');
  const gates = readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8');
  const onderhoud = onderhoudRepo(gates);
  if (onderhoud === null || onderhoud.toLowerCase() !== repo.toLowerCase()) return;
  const g = leesGebeurtenis(JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8')), env('GITHUB_EVENT_NAME'));
  const toets = teToetsen(g);
  const velden = leesSjabloon(readFileSync(path.join(ROOT, '.github/ISSUE_TEMPLATE/leerpunt.yml'), 'utf8'));
  const fouten = toets.sjabloon ? toetsBody(g.body, velden) : null;
  const oordeel = toets.sluiten ? await sluitOordeelVoor(repo, g, leerpuntAccounts(gates)) : null;
  for (const stap of stappen({ fouten, oordeel, heropend: toets.heropend, velden })) await voerUit(repo, g, stap);
}

if (import.meta.main) await main();
