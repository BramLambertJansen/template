// Spec zonder-prompt (leerpunt #873): een document dat een commando buiten de sandbox "zonder prompt" noemt, klopt met
// `permissions.allow`, `ask` en `deny` in .claude/settings.json. Aangeroepen vanuit `docsViolations` (check-docs.mjs).

import { CODESPAN, HEK, sluitHek } from './markdown.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {{ allow: string[], ask: string[], deny: string[], excluded: string[], autoAllow: boolean }} Regels */

const SETTINGS = '.claude/settings.json';
const BEREIK = [
  /^docs\/framework\.md$/,
  /^docs\/ENVIRONMENT\.md$/,
  /^docs\/operations\/.+\.md$/,
  /^docs\/(?:template\/)?adr\/[^/]+\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.claude\/(?:rules|agents)\/.+\.md$/,
];
const ADR = /^docs\/(?:template\/)?adr\//;
const ADR_GELDIG = /^Status:\s*(?:voorgesteld|geaccepteerd)\b/m;
const CLAIM = /(?<![\p{L}\p{N}_-])zonder\s+prompt(?![\p{L}\p{N}_-])/giu;
const HOOKZIN = /(?<![\p{L}\p{N}_-])(?:rolhek|hooks?)(?![\p{L}\p{N}_-])/iu;
const ZINSGRENS = /;|[.!?](?=\s)|\n[ \t]*\n/g;
// Scheiding binnen een opsomming: komma, "en", "of" en witruimte, maar geen witregel (die eindigt de alinea).
const SCHEIDING = /^(?:[ \t,]|\n(?![ \t]*\n)|\ben\b|\bof\b)*$/;
const COMMANDO = /^[a-z]\S*\s+\S/;

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** @param {unknown} waarde @returns {string[]} */
function teksten(waarde) {
  return Array.isArray(waarde) ? waarde.filter((x) => typeof x === 'string') : [];
}

/** @param {string[]} regels @returns {string[]} de patronen binnen `Bash(…)` */
function bash(regels) {
  return regels.flatMap((regel) => (regel.startsWith('Bash(') && regel.endsWith(')') ? [regel.slice(5, -1)] : []));
}

/** @param {string} tekst @returns {Regels | null} */
function leesRegels(tekst) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(tekst);
  } catch {
    return null;
  }
  const permissies = veld(data, 'permissions');
  const sandbox = veld(data, 'sandbox');
  return {
    allow: bash(teksten(veld(permissies, 'allow'))),
    ask: bash(teksten(veld(permissies, 'ask'))),
    deny: bash(teksten(veld(permissies, 'deny'))),
    excluded: teksten(veld(sandbox, 'excludedCommands')),
    autoAllow: veld(sandbox, 'autoAllowBashIfSandboxed') === true,
  };
}

/**
 * Dekt een permissiepatroon het commando, zoals in Claude Code: `*` is elke tekst, een afsluitende ` *` dekt ook het kale
 * commando. Het commando wordt letterlijk getoetst.
 * @param {string} patroon @param {string} commando
 */
export function dekt(patroon, commando) {
  const kaal = patroon.endsWith(' *') ? patroon.slice(0, -2) : patroon;
  const bron = kaal
    .split('*')
    .map((deel) => deel.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${bron}${patroon.endsWith(' *') ? '(?: .*)?' : ''}$`, 's').test(commando);
}

/** @param {Regels} regels @param {string} commando @returns {string | null} de reden, of null als de claim klopt */
function reden(regels, commando) {
  for (const lijst of /** @type {const} */ (['deny', 'ask'])) {
    if (regels[lijst].some((p) => dekt(p, commando))) return `staat in permissions.${lijst}`;
  }
  const buiten = !regels.autoAllow || regels.excluded.some((p) => dekt(p, commando));
  return buiten && !regels.allow.some((p) => dekt(p, commando)) ? 'staat niet in permissions.allow' : null;
}

/** Codeblokken tussen hekken worden lege regels; de regelnummers blijven gelijk. @param {string} tekst */
function zonderBlokken(tekst) {
  /** @type {string | null} */
  let open = null;
  return tekst
    .split('\n')
    .map((regel) => {
      if (open === null) {
        open = HEK.exec(regel)?.[1] ?? null;
        return open === null ? regel : '';
      }
      if (sluitHek(regel, open)) open = null;
      return '';
    })
    .join('\n');
}

/** @param {{ start: number, eind: number }[]} spans @param {number} index */
function inSpan(spans, index) {
  return spans.some((span) => index >= span.start && index < span.eind);
}

/** De zin rond `index`, met codespans weggelaten. @param {string} tekst @param {{ start: number, eind: number }[]} spans @param {number} index */
function zinRond(tekst, spans, index) {
  let begin = 0;
  let eind = tekst.length;
  for (const m of tekst.matchAll(ZINSGRENS)) {
    if (inSpan(spans, m.index)) continue;
    if (m.index < index) begin = m.index + m[0].length;
    else if (m.index > index) {
      eind = m.index;
      break;
    }
  }
  return spans.reduce(
    (zin, span) =>
      span.start >= begin && span.eind <= eind ? zin.replace(tekst.slice(span.start, span.eind), ' ') : zin,
    tekst.slice(begin, eind),
  );
}

/** De commando's in de opsomming direct vóór `index`. @param {string} tekst @param {{ start: number, eind: number }[]} spans @param {number} index */
function opsomming(tekst, spans, index) {
  /** @type {string[]} */
  const commandos = [];
  let positie = index;
  for (const span of [...spans].reverse()) {
    if (span.eind > positie) continue;
    if (!SCHEIDING.test(tekst.slice(span.eind, positie))) break;
    const inhoud = tekst
      .slice(span.start, span.eind)
      .replace(/^`+|`+$/g, '')
      .trim();
    if (COMMANDO.test(inhoud)) commandos.unshift(inhoud);
    positie = span.start;
  }
  return commandos;
}

/** @param {string} file @param {string} ruw @param {Regels} regels @returns {Violation[]} */
function bestandViolations(file, ruw, regels) {
  const tekst = zonderBlokken(ruw);
  const spans = [...tekst.matchAll(CODESPAN)].map((m) => ({ start: m.index, eind: m.index + m[0].length }));
  /** @type {Violation[]} */
  const uit = [];
  for (const claim of tekst.matchAll(CLAIM)) {
    if (inSpan(spans, claim.index) || HOOKZIN.test(zinRond(tekst, spans, claim.index))) continue;
    const regel = tekst.slice(0, claim.index).split('\n').length;
    for (const commando of opsomming(tekst, spans, claim.index)) {
      const waarom = reden(regels, commando);
      if (waarom === null) continue;
      uit.push({
        key: `docs:zonder-prompt:${file}:${commando}`,
        message: `${file}:${String(regel)}: \`${commando}\` heet zonder prompt, maar ${waarom} van ${SETTINGS}`,
      });
    }
  }
  return uit;
}

/**
 * Spec zonder-prompt: elke claim "zonder prompt" in de normatieve documenten tegen .claude/settings.json.
 * @param {string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
export function zonderPromptViolations(files, read) {
  if (!files.includes(SETTINGS)) return [];
  const regels = leesRegels(read(SETTINGS));
  if (regels === null) return [{ key: 'docs:zonder-prompt:settings', message: `${SETTINGS}: geen geldige JSON` }];
  const gezien = new Set();
  return files
    .filter((file) => BEREIK.some((re) => re.test(file)))
    .flatMap((file) => {
      const ruw = read(file);
      return ADR.test(file) && !ADR_GELDIG.test(ruw) ? [] : bestandViolations(file, ruw, regels);
    })
    .filter((v) => !gezien.has(v.key) && Boolean(gezien.add(v.key)));
}
