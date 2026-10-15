// Overzicht van de meethook (ADR 0029 punt 12): `pnpm meting [--json] [--sessie <id>] [--branch <naam>]`.
// Leest `<opslagmap>/*.jsonl` (.claude/hooks/lib/meting.mjs: METING_DIR of `<git common dir>/agent-meting`) en telt per
// sessie en per branch: prompts (permissievragen) per pad of commandoprefix, weigeringen, beurten, eigenaarberichten na de
// opdracht (een bovengrens), pushes (geslaagde `git push`) en CI-rondes via `gh run list` (METING_GH, METING_GH_TIMEOUT_MS;
// een fout, timeout of ongeldige uitvoer geeft "onbekend"). Kapotte regels slaat hij over.
// Getest in test/rails/meting-overzicht.test.ts.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { opslagmap } from '../../.claude/hooks/lib/meting.mjs';

/** @typedef {{ e: string, s: string, b: string, k: string, id: string | undefined, opdracht?: boolean }} Regel */
/** @typedef {{ prompts: number, promptsPerSleutel: Record<string, number>, weigeringen: number, weigeringenPerSleutel: Record<string, number>, beurten: number, eigenaarberichten: number, pushes: number }} Telling */
/** @typedef {number | 'onbekend'} Ci */
/** @typedef {(branch: string) => Ci} CiVoor */

/** @param {unknown} value @param {string} fallback */
function tekst(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/** @param {string} lijn @param {string} sessie */
function parse(lijn, sessie) {
  try {
    /** @type {unknown} */
    const waarde = JSON.parse(lijn);
    if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) return null;
    const r = Object.fromEntries(Object.entries(waarde));
    if (typeof r['e'] !== 'string') return null;
    const id = typeof r['id'] === 'string' ? r['id'] : undefined;
    /** @type {Regel} */
    const uit = { e: r['e'], s: tekst(r['s'], sessie), b: tekst(r['b'], 'onbekend'), k: tekst(r['k'], ''), id };
    return uit;
  } catch {
    return null;
  }
}

/** De meetbestanden in `dir`, gesorteerd; een ontbrekende map is leeg. @param {string} dir */
function bestanden(dir) {
  try {
    return readdirSync(dir)
      .filter((naam) => naam.endsWith('.jsonl'))
      .sort();
  } catch {
    return [];
  }
}

/** Alle regels per sessie, in bestandsvolgorde; zonder map geen. @param {string | null} dir */
function lees(dir) {
  /** @type {Map<string, Regel[]>} */
  const perSessie = new Map();
  if (dir === null) return perSessie;
  for (const naam of bestanden(dir)) {
    const regels = readFileSync(path.join(dir, naam), 'utf8')
      .split('\n')
      .map((lijn) => parse(lijn, naam.slice(0, -'.jsonl'.length)))
      .filter((r) => r !== null);
    for (const r of regels) perSessie.set(r.s, [...(perSessie.get(r.s) ?? []), r]);
  }
  return perSessie;
}

/** @returns {Telling} */
function leeg() {
  return {
    prompts: 0,
    promptsPerSleutel: {},
    weigeringen: 0,
    weigeringenPerSleutel: {},
    beurten: 0,
    eigenaarberichten: 0,
    pushes: 0,
  };
}

/** @param {Record<string, number>} teller @param {string} k */
function plus(teller, k) {
  teller[k] = (teller[k] ?? 0) + 1;
}

/**
 * Een weigering: een PermissionDenied, of een PreToolUse zonder Post(Failure) met hetzelfde id (rolhek, de eigenaar zei nee).
 * Een id met beide telt één keer.
 * @param {readonly Regel[]} regels
 */
function weigeringen(regels) {
  const afgerond = new Set(regels.filter((r) => r.e.startsWith('PostToolUse')).map((r) => r.id));
  const geweigerd = regels.filter((r) => r.e === 'PermissionDenied');
  const ids = new Set(geweigerd.map((r) => r.id).filter((id) => id !== undefined));
  const zonderPost = regels.filter(
    (r) => r.e === 'PreToolUse' && r.id !== undefined && !afgerond.has(r.id) && !ids.has(r.id),
  );
  return new Set([...geweigerd, ...zonderPost]);
}

/** @param {Telling} t @param {Regel} r @param {boolean} geweigerd */
function tel(t, r, geweigerd) {
  if (r.e === 'PermissionRequest') {
    t.prompts += 1;
    plus(t.promptsPerSleutel, r.k);
  }
  if (geweigerd) {
    t.weigeringen += 1;
    plus(t.weigeringenPerSleutel, r.k);
  }
  if (r.e === 'Stop') t.beurten += 1;
  if (r.e === 'UserPromptSubmit' && r.opdracht !== true) t.eigenaarberichten += 1;
  if (r.e === 'PostToolUse' && r.k === 'git push') t.pushes += 1;
}

/** Het eerste bericht van de sessie is de opdracht, geen correctie. @param {readonly Regel[]} regels */
function markeerOpdracht(regels) {
  const eerste = regels.findIndex((r) => r.e === 'UserPromptSubmit');
  return regels.map((r, i) => (i === eerste ? { ...r, opdracht: true } : r));
}

/** @param {readonly Regel[]} alle @param {string | undefined} filterBranch @param {CiVoor} ciVoor */
function sessieTelling(alle, filterBranch, ciVoor) {
  const regels = markeerOpdracht(alle);
  const geweigerd = weigeringen(regels);
  const totaal = leeg();
  /** @type {Record<string, Telling>} */
  const branches = {};
  for (const r of regels) {
    if (filterBranch !== undefined && r.b !== filterBranch) continue;
    const isWeigering = geweigerd.has(r);
    tel(totaal, r, isWeigering);
    const perBranch = branches[r.b] ?? leeg();
    branches[r.b] = perBranch;
    tel(perBranch, r, isWeigering);
  }
  /** @type {Record<string, Telling & { ciRondes: Ci }>} */
  const metCi = {};
  for (const [naam, t] of Object.entries(branches)) metCi[naam] = { ...t, ciRondes: ciVoor(naam) };
  return { ...totaal, ciRondes: som(Object.values(metCi).map((t) => t.ciRondes)), branches: metCi };
}

/** De som, of "onbekend" zodra één branch onbekend is. @param {readonly Ci[]} waarden @returns {Ci} */
function som(waarden) {
  let totaal = 0;
  for (const waarde of waarden) {
    if (waarde === 'onbekend') return 'onbekend';
    totaal += waarde;
  }
  return totaal;
}

/**
 * CI-runs van een branch via `<gh> run list` (zonder shell, met timeout).
 * @param {string} gh
 * @param {string} branch
 * @param {number} timeout
 * @returns {Ci}
 */
function ciRondes(gh, branch, timeout) {
  if (branch === 'onbekend' || branch === 'detached' || branch.startsWith('-')) return 'onbekend';
  try {
    const args = ['run', 'list', `--branch=${branch}`, '--json', 'databaseId', '--limit', '200'];
    const uit = execFileSync(gh, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
    /** @type {unknown} */
    const runs = JSON.parse(uit);
    return Array.isArray(runs) ? runs.length : 'onbekend';
  } catch {
    return 'onbekend';
  }
}

/** Eén gh-aanroep per branch. @param {Record<string, string | undefined>} env @returns {CiVoor} */
export function ghCi(env) {
  const gh = env['METING_GH'] === undefined || env['METING_GH'] === '' ? 'gh' : env['METING_GH'];
  const ms = Number(env['METING_GH_TIMEOUT_MS']);
  const timeout = Number.isFinite(ms) && ms > 0 ? ms : 10_000;
  /** @type {Map<string, Ci>} */
  const cache = new Map();
  return (branch) => {
    const bekend = cache.get(branch) ?? ciRondes(gh, branch, timeout);
    cache.set(branch, bekend);
    return bekend;
  };
}

/** @param {string | null} dir @param {{ sessie?: string, branch?: string }} filter @param {CiVoor} ciVoor */
export function overzicht(dir, filter, ciVoor) {
  const perSessie = lees(dir);
  /** @type {Record<string, ReturnType<typeof sessieTelling>>} */
  const sessies = {};
  for (const sessie of [...perSessie.keys()].sort()) {
    if (filter.sessie !== undefined && sessie !== filter.sessie) continue;
    const regels = perSessie.get(sessie) ?? [];
    if (filter.branch !== undefined && !regels.some((r) => r.b === filter.branch)) continue;
    sessies[sessie] = sessieTelling(regels, filter.branch, ciVoor);
  }
  return { sessies };
}

/** @param {Record<string, number>} teller */
function perSleutel(teller) {
  const delen = Object.entries(teller)
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => `${k === '' ? '(geen)' : k} ${String(n)}`);
  return delen.length === 0 ? '' : ` (${delen.join(', ')})`;
}

/** @param {Telling & { ciRondes: Ci }} t */
function regelTekst(t) {
  const ci = `pushes ${String(t.pushes)} · ci-rondes ${String(t.ciRondes)}`;
  return `beurten ${String(t.beurten)} · eigenaarberichten ${String(t.eigenaarberichten)} · ${ci}`;
}

/** @param {ReturnType<typeof overzicht>} data @param {string | null} dir */
export function alsTekst(data, dir) {
  const sessies = Object.entries(data.sessies);
  if (sessies.length === 0) return `Geen metingen in ${dir ?? '(geen git-repo en geen METING_DIR)'}.\n`;
  const regels = [];
  for (const [sessie, t] of sessies) {
    regels.push(`sessie ${sessie}`, `  prompts ${String(t.prompts)}${perSleutel(t.promptsPerSleutel)}`);
    regels.push(`  weigeringen ${String(t.weigeringen)}${perSleutel(t.weigeringenPerSleutel)}`, `  ${regelTekst(t)}`);
    for (const [naam, b] of Object.entries(t.branches))
      regels.push(
        `  branch ${naam}: prompts ${String(b.prompts)} · weigeringen ${String(b.weigeringen)} · ${regelTekst(b)}`,
      );
  }
  return `${regels.join('\n')}\n`;
}

/** @param {readonly string[]} args */
function opties(args) {
  /** @type {(naam: string) => string | undefined} */
  const waarde = (naam) => {
    const i = args.indexOf(naam);
    return i === -1 ? undefined : args[i + 1];
  };
  return { json: args.includes('--json'), sessie: waarde('--sessie'), branch: waarde('--branch') };
}

const args = opties(process.argv.slice(2));
const dir = opslagmap(process.cwd(), process.env);
const filter = {
  ...(args.sessie === undefined ? {} : { sessie: args.sessie }),
  ...(args.branch === undefined ? {} : { branch: args.branch }),
};
const data = overzicht(dir, filter, ghCi(process.env));
process.stdout.write(args.json ? `${JSON.stringify(data, null, 2)}\n` : alsTekst(data, dir));
