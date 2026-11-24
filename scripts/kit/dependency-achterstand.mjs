// Achterstand in dependency-updates (spec dependency-achterstand): een wekelijkse check op `main` die rood wordt als een
// Renovate-PR te lang openstaat of Renovate een update niet als PR kan openen of een fout meldt. Leest alleen (`GET`) via de
// GitHub-API; workflow `.github/workflows/dependency-achterstand.yml`. Alleen `node:`- en relatieve imports, zonder install.
// Exitcodes: 0 groen, 1 bevindingen, 2 fout (nooit groen zonder gelezen data, AC-7).
import { veld } from './leerpunt.mjs';

const DAG = 86_400_000;
const PER_PAGINA = 100;
const MAX_PAGINAS = 10;
const RENOVATE = 'renovate[bot]';
/** Dashboardkoppen waaronder een update staat die (nog) geen PR is of niet lukte (AC-5), in kleine letters. */
const DASHBOARD_KOPPEN = ['errored', 'rate-limited', 'pending approval', 'repository problems'];

/** @typedef {{ nummer: number, titel: string, branch: string, repo: string, aangemaakt: string, labels: string[] }} Pr */
/** @typedef {{ nummer: number, titel: string, auteur: string, body: string }} Issue */
/** @typedef {{ code: 0 | 1 | 2, tekst: string }} Uitslag */

export class ApiFout extends Error {}

/** @param {unknown} pr @returns {Pr} */
export function leesPr(pr) {
  const head = veld(pr, 'head');
  return {
    nummer: Number(veld(pr, 'number')),
    titel: String(veld(pr, 'title') ?? ''),
    branch: String(veld(head, 'ref') ?? ''),
    repo: String(veld(veld(head, 'repo'), 'full_name') ?? ''),
    aangemaakt: String(veld(pr, 'created_at') ?? ''),
    labels: labelNamen(veld(pr, 'labels')),
  };
}

/** @param {unknown} issue @returns {Issue} */
export function leesIssue(issue) {
  return {
    nummer: Number(veld(issue, 'number')),
    titel: String(veld(issue, 'title') ?? ''),
    auteur: String(veld(veld(issue, 'user'), 'login') ?? ''),
    body: String(veld(issue, 'body') ?? ''),
  };
}

/** @param {unknown} labels @returns {string[]} */
function labelNamen(labels) {
  return Array.isArray(labels) ? labels.map((label) => String(veld(label, 'name') ?? '')) : [];
}

/** Grens in dagen per soort; beveiliging gaat voor major (AC-2). @param {string[]} labels */
export function grens(labels) {
  if (labels.includes('security')) return { soort: 'beveiliging', dagen: 7 };
  if (labels.includes('major')) return { soort: 'major', dagen: 60 };
  return { soort: 'niet-major', dagen: 14 };
}

/** Hele dagen sinds `aangemaakt`, UTC. @param {string} aangemaakt @param {number} nu */
export function leeftijd(aangemaakt, nu) {
  return Math.floor((nu - Date.parse(aangemaakt)) / DAG);
}

/** Open Renovate-PR's uit deze repo zelf, geen fork (AC-6). @param {Pr[]} prs @param {string} repo */
export function updatePrs(prs, repo) {
  return prs.filter((pr) => pr.branch.startsWith('renovate/') && pr.repo.toLowerCase() === repo.toLowerCase());
}

/**
 * De gemelde koppen van het Dependency Dashboard met het aantal lijstregels eronder (`- [ ] …`, `- WARN: …`; AC-5).
 * @param {string} body @returns {{ kop: string, regels: number }[]}
 */
export function dashboardKoppen(body) {
  /** @type {{ kop: string, regels: number }[]} */
  const koppen = [];
  /** @type {{ kop: string, regels: number } | null} */
  let huidig = null;
  for (const regel of body.split(/\r?\n/)) {
    const kop = /^## +(.+?)\s*$/.exec(regel)?.[1];
    if (kop !== undefined) {
      huidig = DASHBOARD_KOPPEN.includes(kop.toLowerCase()) ? { kop, regels: 0 } : null;
      if (huidig !== null) koppen.push(huidig);
    } else if (huidig !== null && /^\s*- /.test(regel)) huidig.regels++;
  }
  return koppen;
}

/** Bevindingen uit de Renovate-issues (AC-4, AC-5). @param {Issue[]} issues @returns {string[]} */
function issueBevindingen(issues) {
  return issues
    .filter((issue) => issue.auteur === RENOVATE)
    .flatMap((issue) => {
      if (issue.titel.startsWith('Action Required'))
        return [`Renovate meldt een fout: ${issue.titel} (#${String(issue.nummer)})`];
      if (issue.titel !== 'Dependency Dashboard') return [];
      return dashboardKoppen(issue.body).map(
        ({ kop, regels }) =>
          `Dependency Dashboard (#${String(issue.nummer)}): sectie ${kop} (${String(regels)} regel(s))`,
      );
    });
}

/**
 * De beoordeling (puur): bevindingen en het aantal update-PR's.
 * @param {{ prs: Pr[], issues: Issue[], repo: string, nu: number }} invoer
 */
export function beoordeel({ prs, issues, repo, nu }) {
  const updates = updatePrs(prs, repo);
  const prBevindingen = updates.flatMap((pr) => {
    const { soort, dagen } = grens(pr.labels);
    const oud = leeftijd(pr.aangemaakt, nu);
    if (oud <= dagen) return [];
    return [`#${String(pr.nummer)} ${pr.titel}: ${String(oud)} dagen open, grens ${String(dagen)} (${soort})`];
  });
  return { bevindingen: [...prBevindingen, ...issueBevindingen(issues)], aantal: updates.length };
}

/** @param {{ bevindingen: string[], aantal: number }} oordeel @returns {Uitslag} */
export function rapport({ bevindingen, aantal }) {
  if (bevindingen.length === 0)
    return { code: 0, tekst: `Geen achterstand: ${String(aantal)} open update-PR(’s), alle binnen de grens.` };
  const slot = `Achterstand in dependency-updates: ${String(bevindingen.length)} bevinding(en). Merge, repareer of sluit de PR met een reden.`;
  return { code: 1, tekst: [...bevindingen, slot].join('\n') };
}

/**
 * Alle elementen van een lijst-endpoint, per pagina van 100, hooguit 10 pagina's (AC-7).
 * @param {string} pad @param {{ token: string, fetch: typeof globalThis.fetch }} bron @returns {Promise<unknown[]>}
 */
export async function haalAlles(pad, bron) {
  /** @type {unknown[]} */
  const alle = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const deel = await haalPagina(
      `${pad}${pad.includes('?') ? '&' : '?'}per_page=${String(PER_PAGINA)}&page=${String(pagina)}`,
      bron,
    );
    alle.push(...deel);
    if (deel.length < PER_PAGINA) return alle;
  }
  throw new ApiFout(`GitHub-API: ${pad}: meer dan ${String(MAX_PAGINAS)} pagina's`);
}

/** @param {string} pad @param {{ token: string, fetch: typeof globalThis.fetch }} bron @returns {Promise<unknown[]>} */
async function haalPagina(pad, { token, fetch }) {
  /** @type {Response} */
  let antwoord;
  /** @type {unknown} */
  let data;
  try {
    antwoord = await fetch(`https://api.github.com/${pad}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!antwoord.ok) throw new ApiFout(`GitHub-API: ${pad}: HTTP ${String(antwoord.status)}`);
    data = await antwoord.json();
  } catch (fout) {
    if (fout instanceof ApiFout) throw fout;
    throw new ApiFout(`GitHub-API: ${pad}: ${fout instanceof Error ? fout.message : String(fout)}`);
  }
  if (!Array.isArray(data)) throw new ApiFout(`GitHub-API: ${pad}: antwoord is geen lijst`);
  return data;
}

/**
 * De hele check: env lezen, ophalen, beoordelen. Een fout wordt exitcode 2 (AC-7).
 * @param {{ env: Record<string, string | undefined>, fetch: typeof globalThis.fetch, nu: number }} omgeving
 * @returns {Promise<Uitslag>}
 */
export async function draai({ env, fetch, nu }) {
  for (const naam of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'])
    if ((env[naam] ?? '') === '') return { code: 2, tekst: `${naam} ontbreekt` };
  const token = env['GITHUB_TOKEN'] ?? '';
  const repo = env['GITHUB_REPOSITORY'] ?? '';
  try {
    const prs = (await haalAlles(`repos/${repo}/pulls?state=open`, { token, fetch })).map(leesPr);
    const issues = (await haalAlles(`repos/${repo}/issues?state=open`, { token, fetch }))
      .filter((issue) => veld(issue, 'pull_request') === undefined)
      .map(leesIssue);
    return rapport(beoordeel({ prs, issues, repo, nu }));
  } catch (fout) {
    // Elke fout is exitcode 2, ook een onverwachte: nooit groen en nooit verward met bevindingen (AC-7).
    return { code: 2, tekst: fout instanceof Error ? fout.message : String(fout) };
  }
}

async function main() {
  const uitslag = await draai({ env: process.env, fetch: globalThis.fetch, nu: Date.now() });
  if (uitslag.code === 0) console.log(uitslag.tekst);
  else console.error(uitslag.tekst);
  process.exitCode = uitslag.code;
}

if (import.meta.main) await main();
