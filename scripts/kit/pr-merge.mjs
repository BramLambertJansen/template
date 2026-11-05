// `pnpm pr:merge <nr>` (ADR 0069 punt 3, spec agent-merge-niet-kritiek AC-3): de enige route waarlangs de hoofdsessie een PR
// zelf merget. Alles wordt via de REST-API van GitHub gelezen, niet uit de lokale `origin/main`; elke ontbrekende voorwaarde
// geeft een eigen regel en exit 1 zonder schrijfactie. Pas als alles klopt: squash-merge met de head-SHA als voorwaarde.
// Onopgeloste review-threads houdt de ruleset op main tegen (`required_review_thread_resolution`); REST kent hun stand niet.
// Omvang en steekproefregel: spec agent-merge-niet-kritiek AC-7 en AC-9; bytegrens: spec agent-merge-bytegrens AC-4.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { expectedCheckAppId } from '../../rails/hooks/lib/built-evidence.mjs';
import {
  BYTES_ONLEESBAAR,
  OMVANG_ONLEESBAAR,
  agentMergeFouten,
  binairReden,
  leesAgentMerge,
  leesModus,
  patchBytes,
  teGroot,
  teGrootBytes,
} from './agent-merge.mjs';
import { parseCheckRun } from './github-evidence.mjs';
import { leerpuntMergeRedenen } from './leerpunt.mjs';
import { checkProgress, verifyEffect } from './pr-verify.mjs';

const GUARD = '.github/workflows/guard.yml';
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
 * Een run hoort bij deze PR als `pull_requests` haar nummer bevat; GitHub laat de lijst bij `pull_request_target` soms leeg
 * (gezien op #445), dan beslissen pad, event, app en head. Een lijst met alleen andere nummers telt niet.
 * @param {unknown} prs @param {number} nummer
 */
function hoortBij(prs, nummer) {
  const lijst = Array.isArray(prs) ? prs : [];
  return lijst.length === 0 || lijst.some((pr) => veld(pr, 'number') === nummer);
}

/**
 * De job `agent-merge` uit guard.yml (pull_request_target) voor déze PR is geslaagd op de head; een gelijknamige check uit een
 * andere workflow, een ander event of een run voor een andere PR met dezelfde head telt niet.
 * @param {Api} api @param {{ repo: string, checks: unknown[], head: string, nummer: number }} doel
 */
export function guardRedenen(api, { repo, checks, head, nummer }) {
  const kandidaten = checks
    .filter((raw) => tekst(veld(raw, 'name')) === 'agent-merge' && tekst(veld(raw, 'head_sha')) === head)
    .filter((raw) => pad(raw, 'app', 'id') === expectedCheckAppId('agent-merge'))
    .filter((raw) => {
      const suite = pad(raw, 'check_suite', 'id');
      if (typeof suite !== 'number') return false;
      const runs = veld(api(`repos/${repo}/actions/runs?check_suite_id=${String(suite)}`), 'workflow_runs');
      return (
        Array.isArray(runs) &&
        runs.some(
          (run) =>
            veld(run, 'path') === GUARD &&
            veld(run, 'event') === 'pull_request_target' &&
            hoortBij(veld(run, 'pull_requests'), nummer),
        )
      );
    })
    .toSorted((a, b) => Number(veld(b, 'id')) - Number(veld(a, 'id')));
  const laatste = kandidaten[0];
  if (laatste === undefined)
    return ['geen job agent-merge uit guard.yml (pull_request_target) op de head: oordeel nee of nog bezig'];
  return veld(laatste, 'conclusion') === 'success'
    ? []
    : [`agent-merge is ${tekst(veld(laatste, 'conclusion')) || 'nog bezig'}`];
}

/** Een PR-commentaar `Review <head>: geen blokkerende bevindingen` (ADR 0069: een afspraak). @param {unknown[]} comments @param {string} head */
export function reviewRedenen(comments, head) {
  const regel = `Review ${head}: geen blokkerende bevindingen`;
  return comments.some((c) =>
    tekst(veld(c, 'body'))
      .split('\n')
      .some((r) => r.trim() === regel),
  )
    ? []
    : [`geen commentaar "${regel}" (verse review op deze head)`];
}

/**
 * Omvang via REST (spec agent-merge-niet-kritiek AC-9): `additions + deletions` uit `pulls/<nr>` hoogstens `maxRegels`, en elk
 * bestand uit `pulls/<nr>/files` heeft een `patch`, behalve een zuivere hernoeming (`renamed`, `changes: 0`). Zonder `patch`
 * zijn: een binair bestand, een nieuw of verwijderd leeg bestand, een diff die GitHub te groot vindt en een wijziging van
 * alleen de bestandsmodus. Alle worden geweigerd met de letterlijke spectekst `binairReden` (faalt dicht), ook als het
 * bestand niet binair is; de diff-guard geeft bij het lege bestand en de moduswijziging wel `ja` (numstat `0 0`). Een
 * hernoemde binary, zuiver of ook gewijzigd, lijkt hier een zuivere hernoeming en komt door; die vangt de job `agent-merge`
 * (numstat `-`, `nee`).
 * Bytes (spec agent-merge-bytegrens AC-4): zie `bytesRedenen`.
 * @param {unknown} pull @param {unknown[]} files @param {{ maxRegels: number, maxBytes: number }} grenzen
 */
export function omvangRedenen(pull, files, { maxRegels, maxBytes }) {
  const [erbij, eraf] = [veld(pull, 'additions'), veld(pull, 'deletions')];
  const regels = Number.isInteger(erbij) && Number.isInteger(eraf) ? Number(erbij) + Number(eraf) : Number.NaN;
  const zonderPatch = files
    .filter((f) => typeof veld(f, 'patch') !== 'string')
    .filter((f) => !(veld(f, 'status') === 'renamed' && veld(f, 'changes') === 0))
    .map((f) => binairReden(tekst(veld(f, 'filename'))));
  const bytes = bytesRedenen(regels, files, maxBytes);
  if (!(regels >= 0)) return [OMVANG_ONLEESBAAR, ...bytes, ...zonderPatch];
  return [...(regels > maxRegels ? [teGroot(regels, maxRegels)] : []), ...bytes, ...zonderPatch];
}

/**
 * Per bestand met `patch`: bytes via `patchBytes()`, en het aantal `+`- en `-`-regels moet gelijk zijn aan `additions` en
 * `deletions` van dat bestand; de som van alle getelde regels moet gelijk zijn aan `regels` (additions + deletions van de
 * PR). Wijkt iets af, bijvoorbeeld een afgekapte patch, dan de onleesbaar-melding (faalt dicht). Een bestand zonder patch
 * telt hier niet en heeft zijn eigen reden in `omvangRedenen`.
 * @param {number} regels @param {unknown[]} files @param {number} maxBytes
 */
function bytesRedenen(regels, files, maxBytes) {
  let [bytes, som, klopt] = [0, 0, true];
  for (const f of files) {
    const patch = veld(f, 'patch');
    if (typeof patch !== 'string') continue;
    const lijnen = patch.split('\n');
    const erbij = lijnen.filter((r) => r.startsWith('+')).length;
    const eraf = lijnen.filter((r) => r.startsWith('-')).length;
    klopt &&= veld(f, 'additions') === erbij && veld(f, 'deletions') === eraf;
    som += erbij + eraf;
    bytes += patchBytes(patch);
  }
  if (!klopt || som !== regels) return [BYTES_ONLEESBAAR];
  return bytes > maxBytes ? [teGrootBytes(bytes, maxBytes)] : [];
}

/**
 * Alle voorwaarden uit ADR 0069 punt 3; geen redenen betekent mergen. Is `agentMerge`
 * op main onleesbaar (AC-3), dan één reden per fout (`agentMergeFouten`): de omvangreden `OMVANG_ONLEESBAAR` bij een
 * ongeldige `maxRegels`, `BYTES_ONLEESBAAR` bij een ongeldige `maxBytes`, "agentMerge ontbreekt of is onleesbaar" bij een ontbrekend blok of een ongeldige lijst,
 * en de fout van de padtabellezer bij `paden` naast de oude lijsten (spec padtabel AC-5): nooit een crash, nooit een merge.
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
  const agentMerge = leesAgentMerge(gates);
  if (agentMerge === null) return { redenen: agentMergeFouten(gates) };
  const vereist = requiredChecks(bestandOp(api, { repo, sha: mainSha, bestand: '.claude/decisions.json' }));
  const checks = alle(api, `repos/${repo}/commits/${head}/check-runs`, 'check_runs');
  const comments = alle(api, `repos/${repo}/issues/${String(nummer)}/comments`);
  const pull = api(`repos/${repo}/pulls/${String(nummer)}`);
  const redenen = [
    ...prRedenen(pull, { repo, head }),
    ...omvangRedenen(pull, alle(api, `repos/${repo}/pulls/${String(nummer)}/files`), agentMerge),
    ...(veld(api(`repos/${repo}/compare/${mainSha}...${head}`), 'behind_by') === 0
      ? []
      : ['de PR bevat de kop van main niet: eerst git merge origin/main']),
    ...checkRedenen(checks, { names: vereist, sha: head }),
    ...guardRedenen(api, { repo, checks, head, nummer }),
    ...mainRedenen(alle(api, `repos/${repo}/commits/${mainSha}/check-runs`, 'check_runs'), {
      names: vereist,
      sha: mainSha,
    }),
    ...reviewRedenen(comments, head),
    // Leest de beschrijving op het moment van mergen: een later gewijzigd bewijs glipt zo niet langs de eigenaar, ook
    // als het oordeel van de diff-guard (die niet op `edited` draait) nog `ja` was (ADR 0078 punt 1, leerlus-bewijs AC-4).
    ...leerpuntMergeRedenen(tekst(veld(pull, 'body'))).map((reden) => `${reden}: de eigenaar merget`),
  ];
  return { redenen };
}

/** Alle voorwaarden uit ADR 0069 punt 3; een lege lijst betekent mergen. @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel */
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
  verifyEffect(root);
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
