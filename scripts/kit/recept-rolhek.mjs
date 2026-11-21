// Spec agent-recepten (leerpunt #893): een commando dat een agentinstructie of de receptenkaart voorschrijft, komt door het
// rolhek (`decide`) en door `permissions.deny`, en een `gh api`-endpoint met {owner} of {repo} staat tussen aanhalingstekens.
// Aangeroepen vanuit `docsViolations` (check-docs.mjs).

import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { CODESPAN, HEK, sluitHek } from './markdown.mjs';
import { KAART, kaartRijen } from './recepten.mjs';
import { dekt } from './zonder-prompt.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {import('../../rails/hooks/lib/rolhek.mjs').Config} Config */
/** @typedef {{ config: Config, netwerkvormen: string[], deny: string[] }} Regels */
/** `span`: uit een codespan buiten de kaart (alleen daar geldt de uitzondering voor een kale `pnpm <script>`). */
/** @typedef {{ commando: string, regel: number, uitzondering: boolean, span: boolean }} Kandidaat */

const GATES = '.claude/gates.json';
const APP = '.claude/gates.app.json';
const SETTINGS = '.claude/settings.json';
const INSTRUCTIES = [
  /^\.claude\/skills\/.+\/SKILL\.md$/,
  /^\.claude\/(?:agents|rules)\/[^/]+\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
];
const PROGRAMMA = /^(?:git|gh|pnpm|node) /;
const AFGEKORT = /[*…]|\.\.\./;
const AFWIJZING = /(?<![\p{L}\p{N}_-])(?:nooit|weigert|weigeren|verboden|dicht)(?![\p{L}\p{N}_-])/iu;
// Een zin eindigt bij `;`, een zinseinde, een witregel, een `|` zonder `\` ervoor, of een regeleinde vóór `|` of een lijstmarker.
const ZINSGRENS = /;|[.!?](?=\s)|\n[ \t]*\n|(?<!\\)\||\n(?=[ \t]*(?:\||[-*][ \t]|\d+\.[ \t]))/g;
const ENDPOINT = /\{(?:owner|repo)\}/g;

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

/** @param {string} tekst @returns {boolean} */
function geldigeJson(tekst) {
  try {
    JSON.parse(tekst);
    return true;
  } catch {
    return false;
  }
}

/**
 * De regels uit gates.json (met het app-bestand) en settings.json, een melding bij ongeldige JSON, of null als het rolhek
 * de configuratie niet laadt.
 * @param {string[]} files @param {(file: string) => string} read @returns {Regels | Violation | null}
 */
function leesRegels(files, read) {
  const bronnen = [GATES, SETTINGS, ...(files.includes(APP) ? [APP] : [])];
  const kapot = bronnen.find((file) => !geldigeJson(read(file)));
  if (kapot !== undefined) return { key: 'docs:recept-rolhek:config', message: `${kapot}: geen geldige JSON` };
  /** @type {unknown} */
  const settings = JSON.parse(read(SETTINGS));
  try {
    const config = loadConfig(read(GATES), files.includes(APP) ? read(APP) : null);
    const deny = teksten(veld(veld(settings, 'permissions'), 'deny')).flatMap((regel) =>
      regel.startsWith('Bash(') && regel.endsWith(')') ? [regel.slice(5, -1)] : [],
    );
    return { config, netwerkvormen: teksten(veld(veld(settings, 'sandbox'), 'excludedCommands')), deny };
  } catch {
    // Een gates.json die het rolhek niet laadt: de vorm bewaken andere deelchecks (docs:paden), het rolhek faalt dan dicht.
    return null;
  }
}

/** De weigering van het rolhek voor de hoofdsessie, of null. @param {Regels} regels @param {string} commando */
function rolhekReden(regels, commando) {
  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config: regels.config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    netwerkvormen: regels.netwerkvormen,
    mergeTrusted: true,
    kitTrusted: true,
    runnerTrusted: true,
  };
  return decide({ tool_name: 'Bash', tool_input: { command: commando } }, ctx).deny[0] ?? null;
}

/** Staat `{owner}` of `{repo}` ergens buiten aanhalingstekens? @param {string} commando */
function kaalEndpoint(commando) {
  if (!/^gh\s+api\s/.test(commando)) return false;
  for (const treffer of commando.matchAll(ENDPOINT)) {
    const ervoor = commando.slice(0, treffer.index);
    const enkel = (ervoor.match(/'/g) ?? []).length % 2 === 1;
    const dubbel = (ervoor.replace(/'[^']*'/g, '').match(/"/g) ?? []).length % 2 === 1;
    if (!enkel && !dubbel) return true;
  }
  return false;
}

/** De reden van een melding, of null. @param {Regels} regels @param {string} commando */
function reden(regels, commando) {
  const ingevuld = commando.replace(/<[^>]+>/g, '1');
  const rolhek = rolhekReden(regels, ingevuld);
  if (rolhek !== null) return ` weigert het rolhek: ${rolhek}`;
  if (regels.deny.some((patroon) => dekt(patroon, ingevuld))) return ` staat in permissions.deny van ${SETTINGS}`;
  if (kaalEndpoint(commando))
    return ': zet een endpoint met {owner} of {repo} tussen aanhalingstekens, anders draait gh api in de sandbox en geeft het 401';
  return null;
}

/** De inhoud van een codespan, als hij op een commando lijkt. @param {string} span @returns {string | null} */
function alsCommando(span) {
  const inhoud = span
    .replace(/^`+|`+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\\|/g, '|');
  return PROGRAMMA.test(inhoud) && !AFGEKORT.test(inhoud) ? inhoud : null;
}

/** De regels van codeblokken als kandidaat; de tekst erbuiten met lege regels op hun plek. @param {string} ruw */
function splitsBlokken(ruw) {
  /** @type {Kandidaat[]} */
  const blokregels = [];
  /** @type {string | null} */
  let open = null;
  const tekst = ruw.split('\n').map((regel, index) => {
    if (open === null) {
      open = HEK.exec(regel)?.[1] ?? null;
      return open === null ? regel : '';
    }
    if (sluitHek(regel, open)) open = null;
    else if (!regel.trimEnd().endsWith('\\')) {
      const commando = alsCommando(regel);
      if (commando !== null) blokregels.push({ commando, regel: index + 1, uitzondering: false, span: false });
    }
    return '';
  });
  return { tekst: tekst.join('\n'), blokregels };
}

/** De zin rond `index`, zonder codespans. @param {string} tekst @param {{ start: number, eind: number }[]} spans @param {number} index */
function zinRond(tekst, spans, index) {
  const binnen = (/** @type {number} */ i) => spans.some((span) => i >= span.start && i < span.eind);
  let begin = 0;
  let eind = tekst.length;
  for (const m of tekst.matchAll(ZINSGRENS)) {
    if (binnen(m.index)) continue;
    if (m.index < index) begin = m.index + m[0].length;
    else {
      eind = m.index;
      break;
    }
  }
  return spans
    .filter((span) => span.start >= begin && span.eind <= eind)
    .reduceRight(
      (zin, span) => zin.slice(0, span.start - begin) + ' ' + zin.slice(span.eind - begin),
      tekst.slice(begin, eind),
    );
}

/** @param {string} ruw @returns {Kandidaat[]} */
function instructieKandidaten(ruw) {
  const { tekst, blokregels } = splitsBlokken(ruw);
  const spans = [...tekst.matchAll(CODESPAN)].map((m) => ({ start: m.index, eind: m.index + m[0].length }));
  const uitSpans = spans.flatMap((span) => {
    const commando = alsCommando(tekst.slice(span.start, span.eind));
    if (commando === null) return [];
    const regel = tekst.slice(0, span.start).split('\n').length;
    return [{ commando, regel, uitzondering: AFWIJZING.test(zinRond(tekst, spans, span.start)), span: true }];
  });
  return [...uitSpans, ...blokregels].filter(({ uitzondering }) => !uitzondering);
}

/** @param {string} ruw @returns {Kandidaat[]} */
function kaartKandidaten(ruw) {
  return kaartRijen(ruw).flatMap(({ lokaal, cloud, regel }) =>
    [...`${lokaal} ${cloud}`.matchAll(CODESPAN)].flatMap((m) => {
      const commando = alsCommando(m[0]);
      return commando === null ? [] : [{ commando, regel, uitzondering: false, span: false }];
    }),
  );
}

/** Een kale `pnpm <script>` die met een nummer wel door het rolhek komt, is een verwijzing. @param {Regels} regels @param {string} commando */
function verwijzing(regels, commando) {
  return /^pnpm [\w:-]+$/.test(commando) && rolhekReden(regels, `${commando} 1`) === null;
}

/**
 * Spec agent-recepten: de voorgeschreven commando's in de agentinstructies en de kaart.
 * @param {string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
export function receptRolhekViolations(files, read) {
  if (!files.includes(GATES) || !files.includes(SETTINGS)) return [];
  const regels = leesRegels(files, read);
  if (regels === null) return [];
  if ('key' in regels) return [regels];
  const gezien = new Set();
  return files
    .filter((file) => file === KAART || INSTRUCTIES.some((re) => re.test(file)))
    .flatMap((file) => {
      const kandidaten = file === KAART ? kaartKandidaten(read(file)) : instructieKandidaten(read(file));
      return kandidaten.flatMap(({ commando, regel, span }) => {
        const waarom = span && verwijzing(regels, commando) ? null : reden(regels, commando);
        return waarom === null
          ? []
          : [
              {
                key: `docs:recept-rolhek:${file}:${commando}`,
                message: `${file}:${String(regel)}: \`${commando}\`${waarom}`,
              },
            ];
      });
    })
    .filter((v) => !gezien.has(v.key) && Boolean(gezien.add(v.key)));
}
