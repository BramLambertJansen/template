// Spec agent-recepten: de receptenkaart docs/operations/recepten.md als feitensectie `recepten` en als bron voor de check
// docs:recept-rolhek (recept-rolhek.mjs). Puur: de aanroeper leest het bestand.

export const KAART = 'docs/operations/recepten.md';
const KOP = /^\|\s*Taak\s*\|\s*Lokaal\s*\|\s*Cloud\s*\|\s*$/;
const SCHEIDING = /^\|[\s:|-]+\|\s*$/;

/** @typedef {{ taak: string, lokaal: string, cloud: string, regel: number }} Rij */
/** @typedef {{ json: unknown, kop: string, inhoud: unknown }} Sectie */

/**
 * De cellen van een tabelregel, zoals GFM: alleen een `|` zonder `\` ervoor scheidt; `\|` wordt een letterlijke `|`.
 * @param {string} regel @returns {string[]}
 */
export function cellen(regel) {
  const binnen = regel
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  return binnen.split(/(?<!\\)\|/).map((cel) => cel.replace(/\\\|/g, '|').trim());
}

/**
 * De rijen van de kaart met hun regelnummer (1-based); `idem` in Cloud is de waarde van Lokaal. Zonder kop geen rijen.
 * @param {string} tekst @returns {Rij[]}
 */
export function kaartRijen(tekst) {
  const regels = tekst.split('\n');
  const start = regels.findIndex((regel) => KOP.test(regel));
  if (start === -1) return [];
  /** @type {Rij[]} */
  const rijen = [];
  for (let index = start + 1; index < regels.length; index += 1) {
    const regel = regels[index] ?? '';
    if (!regel.trimStart().startsWith('|')) break;
    if (SCHEIDING.test(regel)) continue;
    const [taak = '', lokaal = '', cloud = ''] = cellen(regel);
    rijen.push({ taak, lokaal, cloud: cloud === 'idem' ? lokaal : cloud, regel: index + 1 });
  }
  return rijen;
}

/** @param {string} tekst @returns {{ taak: string, lokaal: string, cloud: string }[]} */
export function receptRijen(tekst) {
  return kaartRijen(tekst).map(({ taak, lokaal, cloud }) => ({ taak, lokaal, cloud }));
}

/**
 * De feitensectie: per rij de cel van de eigen runtime, met `alle` beide kolommen.
 * @param {string | null} tekst @param {{ cloud: boolean, alle: boolean }} opties @returns {Sectie}
 */
export function receptenSectie(tekst, { cloud, alle }) {
  const kop = `runtime ${cloud ? 'cloud' : 'lokaal'} (CLAUDE_CODE_REMOTE); bron ${KAART}; --alle toont beide kolommen`;
  const rijen = tekst === null ? [] : receptRijen(tekst);
  /** @type {unknown[]} */
  let inhoud;
  if (tekst === null) inhoud = [`${KAART} ontbreekt`];
  else if (rijen.length === 0) inhoud = [`${KAART}: geen tabel met | Taak | Lokaal | Cloud |`];
  else inhoud = alle ? rijen : rijen.map((rij) => ({ taak: rij.taak, commando: cloud ? rij.cloud : rij.lokaal }));
  return { json: inhoud, kop, inhoud };
}
