// Spec ci-log (ADR 0102): per rode CI-job van een PR alleen de regels rond elke `##[error]`. Leest alleen; schrijft niets naar
// GitHub of de schijf. Draait buiten de sandbox onder de ankertoets van het rolhek (alleen precies `pnpm pr:log <nummer>`).
// Imports alleen uit `node:`, `scripts/` en `rails/`: die dekt de ankertoets (MERGE_FILES).
import { execFileSync } from 'node:child_process';
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { parsePullRequest } from './github-evidence.mjs';
import { ZONDER_BIN } from './pr-merge.mjs';

const VOOR = 15;
const MAX = 120;
const STAART = 30;
const ROOD = new Set(['failure', 'timed_out']);

/** @typedef {{ id: number, name: string, conclusion: string }} Job */
/** @typedef {{ id: number, name: string }} Run */
/** @typedef {{ run: string, job: string, conclusion: string, regels: string[] }} RodeJob */
/** @typedef {{ json: (endpoint: string) => unknown, tekst: (endpoint: string) => string }} Api */

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** Het PR-nummer, of een fout met de gebruiksregel. @param {readonly string[]} args */
export function argumenten(args) {
  const [nummer] = args;
  if (args.length !== 1 || !/^[1-9]\d*$/.test(nummer ?? '')) throw new Error('Gebruik: pnpm pr:log <nummer>');
  return Number(nummer);
}

/** De argumenten voor `gh`: alleen `api` en het endpoint, nooit een schrijvende optie. @param {string} endpoint */
export function ghArgs(endpoint) {
  return ['api', endpoint];
}

/** De rode jobs (failure, timed_out) uit een jobs-antwoord. @param {unknown} antwoord @returns {Job[]} */
export function rodeJobs(antwoord) {
  const jobs = veld(antwoord, 'jobs');
  if (!Array.isArray(jobs)) throw new Error('GitHub-jobs zijn niet leesbaar');
  return jobs.flatMap((job) => {
    const [id, name, conclusion] = [veld(job, 'id'), veld(job, 'name'), veld(job, 'conclusion')];
    return typeof id === 'number' && typeof name === 'string' && typeof conclusion === 'string' && ROOD.has(conclusion)
      ? [{ id, name, conclusion }]
      : [];
  });
}

/**
 * De runs om in te kijken (rood, of nog bezig: die kan al een rode job hebben) en het aantal dat nog loopt.
 * @param {unknown} antwoord @returns {{ runs: Run[], bezig: number }}
 */
export function rodeRuns(antwoord) {
  const lijst = veld(antwoord, 'workflow_runs');
  if (!Array.isArray(lijst)) throw new Error('GitHub-runs zijn niet leesbaar');
  const bezig = lijst.filter((run) => veld(run, 'status') !== 'completed');
  const runs = lijst.flatMap((run) => {
    const [id, name] = [veld(run, 'id'), veld(run, 'name')];
    const kijken = ROOD.has(String(veld(run, 'conclusion'))) || veld(run, 'status') !== 'completed';
    return kijken && typeof id === 'number' && typeof name === 'string' ? [{ id, name }] : [];
  });
  return { runs, bezig: bezig.length };
}

/** Vensters rond elke fout, samengevoegd als ze overlappen of aansluiten. @param {number[]} fouten @returns {[number, number][]} */
function vensters(fouten) {
  /** @type {[number, number][]} */
  const uit = [];
  for (const fout of fouten) {
    const laatste = uit.at(-1);
    const begin = Math.max(0, fout - VOOR);
    if (laatste !== undefined && begin <= laatste[1] + 1) laatste[1] = fout;
    else uit.push([begin, fout]);
  }
  return uit;
}

/**
 * Het uittreksel van een log: BOM en tijdstempels weg, per `##[error]` de 15 regels ervóór, blokken gescheiden door `…`,
 * hooguit 120 regels; zonder fout de laatste 30 regels.
 * @param {string} log @returns {string[]}
 */
export function foutUittreksel(log) {
  const regels = log
    .replace(/^\uFEFF/u, '')
    .split('\n')
    .map((regel) => regel.replace(/^\S+Z /, ''));
  const fouten = regels.flatMap((regel, index) => (regel.includes('##[error]') ? [index] : []));
  if (fouten.length === 0) return regels.slice(-STAART);
  const volledig = vensters(fouten).flatMap(([begin, eind], index) => [
    ...(index === 0 ? [] : ['…']),
    ...regels.slice(begin, eind + 1),
  ]);
  return volledig.length <= MAX
    ? volledig
    : [...volledig.slice(0, MAX), `… (${String(volledig.length - MAX)} regels weggelaten)`];
}

/** De uitvoer. @param {{ nummer: number, sha: string, jobs: RodeJob[], bezig: number }} uitslag */
export function verslag({ nummer, sha, jobs, bezig }) {
  const regels = [`PR #${String(nummer)} · ${sha}`];
  if (jobs.length === 0) regels.push(`Geen rode jobs op ${sha}.`);
  for (const job of jobs) regels.push('', `## ${job.run} / ${job.job} (${job.conclusion})`, ...job.regels);
  if (bezig > 0) regels.push(`Nog bezig: ${String(bezig)} run(s)`);
  return regels.join('\n');
}

/**
 * Leest de PR, zijn runs, de rode jobs en hun log via `api`, en geeft het verslag.
 * @param {Api} api @param {{ repository: string, nummer: number }} doel
 */
export function leesPr(api, { repository, nummer }) {
  const basis = `repos/${repository}`;
  const sha = parsePullRequest(api.json(`${basis}/pulls/${String(nummer)}`)).headSha;
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`GitHub is niet leesbaar: ${basis}/pulls/${String(nummer)}`);
  const runsEndpoint = `${basis}/actions/runs?head_sha=${sha}&per_page=100`;
  const { runs, bezig } = metEndpoint(runsEndpoint, () => rodeRuns(api.json(runsEndpoint)));
  /** @type {RodeJob[]} */
  const jobs = runs.flatMap((run) =>
    jobsVan(api, `${basis}/actions/runs/${String(run.id)}/jobs?per_page=100`).map((job) => ({
      run: run.name,
      job: job.name,
      conclusion: job.conclusion,
      regels: foutUittreksel(api.tekst(`${basis}/actions/jobs/${String(job.id)}/logs`)),
    })),
  );
  return verslag({ nummer, sha, jobs, bezig });
}

/**
 * Een antwoord met een verkeerde vorm geeft dezelfde melding als een onleesbaar antwoord, met het endpoint (spec punt 9).
 * @template T @param {string} endpoint @param {() => T} lees @returns {T}
 */
function metEndpoint(endpoint, lees) {
  try {
    return lees();
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    throw new Error(tekst.startsWith('GitHub is niet leesbaar') ? tekst : `GitHub is niet leesbaar: ${endpoint}`, {
      cause: fout,
    });
  }
}

/** @param {Api} api @param {string} endpoint */
function jobsVan(api, endpoint) {
  return metEndpoint(endpoint, () => rodeJobs(api.json(endpoint)));
}

/**
 * De echte `Api` op een `exec` (standaard `gh` via execFileSync): elke fout of onleesbare JSON wordt
 * `GitHub is niet leesbaar: <endpoint>`.
 * @param {(endpoint: string) => string} exec @returns {Api}
 */
export function maakApi(exec) {
  const tekst = (/** @type {string} */ endpoint) => metEndpoint(endpoint, () => exec(endpoint));
  return {
    tekst,
    json: (endpoint) => {
      const ruw = tekst(endpoint);
      return metEndpoint(endpoint, () => JSON.parse(ruw));
    },
  };
}

/** @param {string} endpoint @returns {string} */
function ghExec(endpoint) {
  return execFileSync('gh', ghArgs(endpoint), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: ZONDER_BIN,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  const root = process.cwd();
  const nummer = argumenten(process.argv.slice(2));
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis');
  console.log(leesPr(maakApi(ghExec), { repository: authority.repository, nummer }));
}

if (import.meta.main)
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
