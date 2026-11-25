// Leest werkelijk CI-bewijs op de huidige PR-commit; maakt nooit zelf een check-status (ADR 0046).
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { checkedCommit, expectedCheckAppId, requiredProofChecks } from '../../rails/hooks/lib/built-evidence.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { setTimeout } from 'node:timers/promises';
import { unchangedHead } from './status-git.mjs';
import { SANDBOX_LEEG, isNulApparaat } from '../../rails/hooks/lib/sandbox-plaatshouders.mjs';
import { lstatSync } from 'node:fs';
import path from 'node:path';

/** @param {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun[]} checks @param {{ names: string[], sha: string }} required */
function codeqlAnalysisPending(checks, required) {
  return required.names
    .filter((name) => name.startsWith('codeql ('))
    .some((name) => {
      const latest = checks
        .filter((check) => check.name === name && check.headSha === required.sha)
        .toSorted((left, right) => right.id - left.id)[0];
      return latest?.status !== 'completed';
    });
}

/** @param {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkProgress(checks, required) {
  const names = requiredProofChecks(checks, required);
  if (checkedCommit(checks, required)) return { state: 'success', lines: names.map((name) => `${name}: success`) };
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha))
    throw new Error('Geen vertrouwde verplichte checks of geldige commit');
  const entries = names.map((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== expectedCheckAppId(name)))
      return { failed: true, line: `${name}: ongeldige check-identiteit` };
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    const waitingForAnalysis =
      name === 'CodeQL' && latest?.conclusion === 'neutral' && codeqlAnalysisPending(checks, required);
    return {
      failed: !waitingForAnalysis && latest?.status === 'completed' && latest.conclusion !== 'success',
      line: `${name}: ${latest === undefined ? 'ontbreekt' : (latest.conclusion ?? latest.status)}`,
    };
  });
  return {
    state: entries.some((entry) => entry.failed) ? 'failure' : 'pending',
    lines: entries.map((entry) => entry.line),
  };
}

const VLAGGEN = ['--watch', '--zonder-werkmap'];

/**
 * Het nummer eerst, daarna `--watch` en `--zonder-werkmap` elk hooguit één keer, in elke volgorde. `--zonder-werkmap`
 * alleen in een cloudsessie (spec cloud-werkmap-herstel AC-6).
 * @param {string[]} args
 * @param {boolean} cloud cloudsessie
 * @returns {{ number: number, watch: boolean, zonderWerkmap: boolean }}
 */
export function argumentsFor(args, cloud) {
  const [number, ...flags] = args;
  if (
    !/^[1-9]\d*$/.test(number ?? '') ||
    args.length > 3 ||
    flags.some((flag) => !VLAGGEN.includes(flag)) ||
    new Set(flags).size !== flags.length
  )
    throw new Error('Gebruik: pnpm pr:verify <nummer> [--watch] [--zonder-werkmap]');
  const zonderWerkmap = flags.includes('--zonder-werkmap');
  if (zonderWerkmap && !cloud)
    throw new Error('--zonder-werkmap werkt alleen in een cloudsessie (CLAUDE_CODE_REMOTE=true)');
  return { number: Number(number), watch: flags.includes('--watch'), zonderWerkmap };
}

/**
 * Klopt de PR met de gecontroleerde commit: open, `pr.branch === branch` en `pr.headSha === head`, met `head` zoals bij
 * de start vastgelegd (spec cloud-werkmap-herstel AC-7).
 * @param {{ state: string, branch: string, headSha: string }} pr
 * @param {{ branch: string, head: string }} verwacht
 * @returns {boolean}
 */
export function prHeadKlopt(pr, { branch, head }) {
  return pr.state === 'open' && pr.branch === branch && pr.headSha === head;
}

/** @param {string} pad @param {readonly string[]} negeer */
function valtOnderNegeer(pad, negeer) {
  if (pad.split('/').includes('..')) return false;
  return negeer.some((entry) => (entry.endsWith('/') ? pad.startsWith(entry) : pad === entry));
}

/**
 * De paden uit `git status --porcelain` die pr:verify blokkeren: alles behalve ongetrackte bestanden onder `negeer`
 * (ADR 0045 punt 23). Een getrackte wijziging, hernoeming of pad met `..` blokkeert altijd.
 * @param {string} statusPorcelain @param {readonly string[]} negeer
 * @returns {string[]}
 */
export function onbekendeWerkmapBestanden(statusPorcelain, negeer) {
  return statusPorcelain
    .split('\n')
    .filter((regel) => regel !== '')
    .filter((regel) => !(regel.startsWith('?? ') && valtOnderNegeer(regel.slice(3), negeer)))
    .map((regel) => regel.slice(3));
}

/**
 * `werkmapNegeer` uit .claude/gates.json op de vertrouwde basis (nooit uit de werkmap); ongeldige vorm geeft [].
 * @param {string} root @param {string} base
 * @returns {string[]}
 */
export function werkmapNegeer(root, base) {
  try {
    /** @type {unknown} */
    const gates = JSON.parse(gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '');
    const lijst = typeof gates === 'object' && gates !== null && 'werkmapNegeer' in gates ? gates.werkmapNegeer : null;
    return Array.isArray(lijst) && lijst.every((pad) => typeof pad === 'string') ? lijst.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Een ongetrackte statusregel voor een plaatshouder van de sandbox (ADR 0084 punt 2, ADR 0091 punt 2): een pad op `SANDBOX_LEEG`
 * dat een leeg gewoon bestand zonder uitvoerbit of een tekenapparaat 1,3 is. Een fout is geen plaatshouder (dicht).
 * @param {string} root @param {string} regel
 */
function isPlaatshouderRegel(root, regel) {
  if (!regel.startsWith('?? ') || !SANDBOX_LEEG.includes(regel.slice(3))) return false;
  try {
    const stat = lstatSync(path.join(root, regel.slice(3)));
    return isNulApparaat(stat) || (stat.isFile() && stat.size === 0 && (stat.mode & 0o7111) === 0);
  } catch {
    return false;
  }
}

/** @param {{ root: string, base: string }} context */
export function verifyWorktree({ root, base }) {
  const status = gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':!node_modules']);
  if (status === null)
    throw new Error('Werkmapstatus is niet leesbaar; controleer Git-toegang en haal het bewijs opnieuw op');
  const regels = status.split('\n').filter((regel) => regel !== '' && !isPlaatshouderRegel(root, regel));
  const blocked = onbekendeWerkmapBestanden(regels.join('\n'), werkmapNegeer(root, base));
  if (blocked.length > 0)
    throw new Error(
      `Werkmap bevat blokkerende wijzigingen:\n${blocked.map((file) => `- ${file}`).join('\n')}\nControleer werkmap en index; haal het bewijs opnieuw op`,
    );
}

/** @param {{ root: string, head: string, base: string, authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, number: number }} context */
function verifyHead(context) {
  const pr = pullRequest(context.authority.repository, context.number);
  if (
    pr.headSha !== context.head ||
    pr.branch !== context.authority.branch ||
    pr.state !== 'open' ||
    !unchangedHead(context.root, { head: context.head, branch: context.authority.branch, base: context.base })
  )
    throw new Error('PR, branch of werkmap wijkt af van de gecontroleerde commit; bewijs opnieuw ophalen');
  verifyWorktree(context);
}

/**
 * De melding bij rode CI, met het commando dat de fouten per rode job toont (spec ci-bewijs/AC-7).
 * @param {number} nummer
 */
export function roodMelding(nummer) {
  return `CI is rood; herstel de oorzaak en controleer de nieuwe commit (fouten per rode job: pnpm pr:log ${String(nummer)})`;
}

/**
 * Leest de checks tot ze slagen of falen; `bewaak` loopt vóór en na elke ronde. Bij rood gooit hij `roodMelding(nummer)`.
 * @param {{ repository: string, nummer: number, required: { names: string[], sha: string }, kop: string, watch: boolean, bewaak: () => void }} ronde
 */
async function volgChecks({ repository, nummer, required, kop, watch, bewaak }) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (true) {
    bewaak();
    const progress = checkProgress(checkRuns(repository, required.sha), required);
    bewaak();
    console.log(`${kop}\n${progress.lines.join('\n')}`);
    if (progress.state === 'success') return;
    if (progress.state === 'failure') throw new Error(roodMelding(nummer));
    if (!watch || Date.now() >= deadline) throw new Error('CI ontbreekt of loopt nog; geen geslaagde oplevering');
    await setTimeout(10000);
  }
}

/**
 * `--zonder-werkmap` (spec cloud-werkmap-herstel): de head-SHA komt één keer van de PR en staat daarna vast; werkmap en
 * lokale HEAD worden niet getoetst.
 * @param {{ authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, number: number, watch: boolean }} doel
 */
async function verifyZonderWerkmap({ authority, number, watch }) {
  const verwacht = { branch: authority.branch, head: pullRequest(authority.repository, number).headSha };
  if (!/^[0-9a-f]{40}$/.test(verwacht.head)) throw new Error('Geen vertrouwde verplichte checks of geldige commit');
  const bewaak = () => {
    if (!prHeadKlopt(pullRequest(authority.repository, number), verwacht))
      throw new Error('PR, branch of head wijkt af van de gecontroleerde commit; bewijs opnieuw ophalen');
  };
  await volgChecks({
    repository: authority.repository,
    nummer: number,
    required: { names: authority.registry.requiredChecks, sha: verwacht.head },
    kop: `PR #${String(number)} · ${verwacht.head} (alleen CI-bewijs op de PR-head; werkmap niet getoetst)`,
    watch,
    bewaak,
  });
}

async function main() {
  const root = process.cwd();
  const target = argumentsFor(process.argv.slice(2), process.env['CLAUDE_CODE_REMOTE'] === 'true');
  const base = gitText(root, ['rev-parse', 'refs/remotes/origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  if (target.zonderWerkmap) {
    if (authority === null) throw new Error('Geen leesbare vertrouwde basis of HEAD');
    await verifyZonderWerkmap({ authority, number: target.number, watch: target.watch });
    return;
  }
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim();
  if (authority === null || head === undefined || base === undefined)
    throw new Error('Geen leesbare vertrouwde basis of HEAD');
  const context = { root, head, base, authority, number: target.number };
  await volgChecks({
    repository: authority.repository,
    nummer: target.number,
    required: { names: authority.registry.requiredChecks, sha: head },
    kop: `PR #${String(target.number)} · ${head}`,
    watch: target.watch,
    bewaak: () => verifyHead(context),
  });
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
