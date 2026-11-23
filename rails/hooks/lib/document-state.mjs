// Een status is afgeleid. Alleen de inhoud buiten die ene regel krijgt een digest (ADR 0046).
import { createHash } from 'node:crypto';

const SPEC_STATES = new Set(['voorstel', 'goedgekeurd', 'gebouwd', 'vervallen']);
const ADR_STATES = new Set(['voorgesteld', 'geaccepteerd', 'vervallen']);

/**
 * Een spec in `docs/specs/`, `docs/specs/archief/` of `docs/template/specs/`, een ADR in `docs/adr/`, `docs/adr/archief/` of
 * `docs/template/adr/` (framework §10, ADR 0080, ADR 0089 punt 1). @param {string} file
 */
export function documentKind(file) {
  if (/^docs\/(?:template\/specs|specs(?:\/archief)?)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) return 'spec';
  if (/^docs\/(?:template\/adr|adr(?:\/archief)?)\/\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) return 'adr';
  return null;
}

const ARCHIEVEN = [['docs/adr/archief/', 'docs/adr/'], ['docs/specs/archief/', 'docs/specs/']];

/** Een gearchiveerd ADR of gearchiveerde spec: wijzigt en verdwijnt nooit, ook niet met een record (framework §10, ADR 0080). @param {string} file */
export function isArchief(file) {
  return documentKind(file) !== null && ARCHIEVEN.some(([archief]) => file.startsWith(archief ?? ''));
}

/** De map waaruit een archiefpad verhuist (`docs/adr/` of `docs/specs/`), of null voor een pad buiten het archief. @param {string} file */
export function archiefBron(file) {
  if (!isArchief(file)) return null;
  const [archief = '', map = ''] = ARCHIEVEN.find(([prefix]) => file.startsWith(prefix ?? '')) ?? [];
  return `${map}${file.slice(archief.length)}`;
}

/** De markering van een AC die nog gebouwd moet worden in een gebouwde spec (ADR 0080 punt 4). */
export const MARKERING = ' (nog niet gebouwd)';
const AC_REGEL = /^- \*\*([a-z0-9][\w.-]*\/AC-\d+)\*\*( \(nog niet gebouwd\))?/gm;

/**
 * De AC-id's die een spec definieert (`- **<ns>/AC-n**`), met of zonder markering (ADR 0080).
 * @param {string} text @returns {{ alle: Set<string>, gemarkeerd: Set<string> }}
 */
export function acIds(text) {
  const regels = [...text.replaceAll('\r\n', '\n').matchAll(AC_REGEL)];
  return {
    alle: new Set(regels.map((match) => match[1] ?? '')),
    gemarkeerd: new Set(regels.filter((match) => match[2] !== undefined).map((match) => match[1] ?? '')),
  };
}

/** @param {string} kind @param {string} status */
export function validStatus(kind, status) {
  return kind === 'spec' ? SPEC_STATES.has(status) :
    kind === 'adr' && (ADR_STATES.has(status) || /^vervangen door \d{4}$/.test(status));
}

/**
 * Een oude `status: gebouwd` (met elk commentaar) is de eigenaarstatus `goedgekeurd`; gebouwd volgt uit de AC-dekking
 * (ADR 0104, gebouwd-zonder-nummer/AC-17; `eigenaarStatus` in ./ac-dekking.mjs leest hetzelfde).
 * @param {string} kind @param {string} line
 */
function statusValue(kind, line) {
  const value = (kind === 'spec'
    ? /^status: (voorstel|goedgekeurd|gebouwd|vervallen)(?:\s+#.*)?$/
    : /^Status: (voorgesteld|geaccepteerd|vervallen|vervangen door \d{4})(?:\s+(?:#|—|\().*)?$/).exec(line)?.[1];
  return value === 'gebouwd' ? 'goedgekeurd' : (value ?? null);
}

/** @param {string[]} lines @param {number} statusIndex */
function validFrontmatter(lines, statusIndex) {
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || statusIndex === 0 || statusIndex >= end) return false;
  const fields = lines.slice(1, end).filter((line) => line !== '' && !line.startsWith('#'));
  if (fields.some((line) => !/^[a-z][a-z0-9-]*: .+$/.test(line))) return false;
  const names = fields.map((line) => line.split(':')[0]);
  return new Set(names).size === names.length;
}

/** @param {string} file @param {string} text */
export function documentInfo(file, text) {
  const kind = documentKind(file);
  if (kind === null) return null;
  const normalized = text.replaceAll('\r\n', '\n');
  const label = kind === 'spec' ? 'status:' : 'Status:';
  const lines = normalized.split('\n');
  const positions = lines.flatMap((line, index) => line.startsWith(label) ? [index] : []);
  const index = positions[0];
  if (positions.length !== 1 || index === undefined) return null;
  if (kind === 'spec' && !validFrontmatter(lines, index)) return null;
  if (kind === 'adr' && (!/^# \d{4} — /.test(lines[0] ?? '') || index > 5 || lines.slice(1, index).some((line) => line !== ''))) return null;
  const status = statusValue(kind, lines[index] ?? '');
  if (status === null) return null;
  lines.splice(index, 1);
  // De markering telt niet mee: alleen weghalen is geen inhoudswijziging (ADR 0080 punt 4).
  const tekst = lines.join('\n');
  const canonical = kind !== 'spec' ? tekst : tekst.replaceAll(AC_REGEL, (regel, _id, markering) =>
    markering === undefined ? regel : regel.slice(0, -MARKERING.length));
  const digest = createHash('sha256').update(canonical).digest('hex');
  return { kind, status, digest, canonical };
}

/** `(JJJJ-MM-DD)` met een datum die in de kalender bestaat. @param {string} deel */
function bestaandeDatum(deel) {
  const datum = /^\((\d{4})-(\d{2})-(\d{2})\)$/.exec(deel);
  if (datum === null) return false;
  const [jaar, maand, dag] = [datum[1], datum[2], datum[3]].map(Number);
  const tijd = new Date(Date.UTC(jaar ?? 0, (maand ?? 0) - 1, dag ?? 0));
  return tijd.getUTCFullYear() === jaar && tijd.getUTCMonth() + 1 === maand && tijd.getUTCDate() === dag;
}

const VOORSTEL = new Set(['voorstel', 'voorgesteld']);

/** De melding bij A4 (ADR 0046 punt 2) van het rolhek. */
export const A4_MELDING =
  'een geaccepteerd ADR herschrijven of een ADR met een eigenaarstatus verwijderen mag alleen door architect of hoofdsessie (in de template in elke PR, in een app alleen in een besluit-PR), en een herschreven ADR krijgt een herzieningsregel (`Herzien: JJJJ-MM-DD: wat`); een vervallen of vervangen ADR wijzigt in een app niet (in de template verdwijnt het, R-CI-06) en een ADR gaat nooit terug naar voorgesteld; anders schrijf je een nieuw ADR dat het vervangt (`vervangen door NNNN`) (A4, ADR 0046 punt 2, R-CI-05)';

const HERZIEN = /^Herzien: (\d{4}-\d{2}-\d{2})(?: \(#[1-9]\d*\))?: \S.*$/;

/**
 * Geldige herzieningsregels (`Herzien: JJJJ-MM-DD: wat`, bestaande datum; een PR-nummer `(#NNN)` na de datum mag nog,
 * ADR 0097). @param {string} text
 */
function herzieningen(text) {
  const regels = text.replaceAll('\r\n', '\n').split('\n');
  return new Set(regels.filter((line) => bestaandeDatum(`(${HERZIEN.exec(line)?.[1] ?? ''})`)));
}

/**
 * Een geaccepteerd ADR dat geaccepteerd blijft met andere inhoud: de herschrijving uit A4 (in de template in elke PR, in een app
 * alleen in een besluit-PR; R-CI-05).
 * @param {string} file @param {string | null} voor @param {string | null} na
 */
export function isHerschrijving(file, voor, na) {
  const oud = voor === null ? null : documentInfo(file, voor);
  const nieuw = na === null ? null : documentInfo(file, na);
  const kopNummer = (/** @type {string} */ text) => /^# (\d{4}) — /.exec(text)?.[1];
  return oud?.kind === 'adr' && oud.status === 'geaccepteerd' && nieuw?.status === 'geaccepteerd' &&
    oud.digest !== nieuw.digest && kopNummer(voor ?? '') === kopNummer(na ?? '');
}

/** Elke oude geldige herzieningsregel staat er nog, en er is er minstens één bij. @param {string} voor @param {string} na */
function nieuweHerzieningsregel(voor, na) {
  const oud = herzieningen(voor);
  const nieuw = herzieningen(na);
  return [...oud].every((regel) => nieuw.has(regel)) && nieuw.size > oud.size;
}

/**
 * Hoe een document zonder record mag veranderen (ADR 0046 punt 1, 2 en 5). Puur; `voor`/`na` zijn de volledige teksten.
 * - `vrij`: geen eigenaarbesluit (voorstel, of niets wezenlijks gewijzigd);
 * - `a4`: een ADR met een eigenaarstatus wijzigt van inhoud of gaat terug naar voorgesteld, of een gearchiveerd ADR wijzigt;
 * - `herzien`: een geaccepteerd ADR blijft geaccepteerd met andere inhoud en een nieuwe herzieningsregel (in een app alleen in een besluit-PR);
 * - `gebouwd`: architect en hoofdsessie, in de bouw-PR (ADR 0095);
 * - `besluit`: een eigenaarstatus die de merge van de eigenaar beslist (`nieuw`: een nieuw document of vanuit een voorstel);
 * - `geweigerd`: een andere overgang (bijv. vervallen terug naar goedgekeurd); alleen met een record.
 * @param {string} file @param {string | null} voor @param {string} na
 * @returns {{ uitslag: 'vrij' | 'a4' | 'herzien' | 'gebouwd' | 'besluit' | 'geweigerd', nieuw: boolean }}
 */
export function beslisOvergang(file, voor, na) {
  const oud = voor === null ? null : documentInfo(file, voor);
  const nieuwInfo = documentInfo(file, na);
  const uit = (/** @type {'vrij' | 'a4' | 'herzien' | 'gebouwd' | 'besluit' | 'geweigerd'} */ uitslag, nieuw = false) => ({ uitslag, nieuw });
  // Het archief komt alleen via een byte-gelijke verhuizing binnen (het rolhek weigert er elke andere schrijfactie; daarna
  // weigert de padtoets van het mergescript, een vangnet, R-ROL-10 en ADR 0093); elke andere wijziging is A4.
  if (isArchief(file)) return uit(voor === na ? 'vrij' : 'a4');
  if (voor !== null && isHerschrijving(file, voor, na)) return uit(nieuweHerzieningsregel(voor, na) ? 'herzien' : 'a4');
  if (oud?.kind === 'adr' && oud.status !== 'voorgesteld' &&
    (nieuwInfo === null || oud.digest !== nieuwInfo.digest || nieuwInfo.status === 'voorgesteld'))
    return uit('a4');
  if (nieuwInfo === null || (voor !== null && oud === null)) return uit('geweigerd');
  if (oud?.status === 'gebouwd' && nieuwInfo.status === 'gebouwd') return uit(gebouwdBlijft(voor ?? '', na, oud.digest === nieuwInfo.digest));
  if (VOORSTEL.has(nieuwInfo.status) || (oud?.status === nieuwInfo.status && oud.digest === nieuwInfo.digest)) return uit('vrij');
  if (nieuwInfo.status === 'gebouwd') return uit('gebouwd');
  if (oud === null || VOORSTEL.has(oud.status)) return uit('besluit', true);
  return toegestaanZonderRecord(oud.status, nieuwInfo.status, nieuwInfo.kind) ? uit('besluit') : uit('geweigerd');
}

/**
 * Een gebouwde spec blijft gebouwd (ADR 0095 punt 5): het commentaar achter de status telt niet, dus alleen dat wijzigen bij
 * gelijke inhoud is vrij en nieuwe inhoud is een besluit. Een weggehaalde markering is bouw, en een nieuwe
 * `; gevalideerd: <sha>` is de oude bewijsvorm, die het rolhek weigert.
 * @param {string} voor @param {string} na @param {boolean} zelfdeInhoud @returns {'vrij' | 'besluit' | 'gebouwd'}
 */
function gebouwdBlijft(voor, na, zelfdeInhoud) {
  // Vervolgbouw (ADR 0080 punt 4): de bouw-PR haalt de markering weg en laat de statusregel staan.
  const gemarkeerd = acIds(na).gemarkeerd;
  if ([...acIds(voor).gemarkeerd].some((id) => !gemarkeerd.has(id))) return 'gebouwd';
  const sha = builtReference(na)?.sha;
  if (sha !== undefined && sha !== builtReference(voor)?.sha) return 'gebouwd';
  return zelfdeInhoud ? 'vrij' : 'besluit';
}

/**
 * ADR geaccepteerd → vervangen/vervallen; spec goedgekeurd/gebouwd → vervallen; inhoud van een goedgekeurde spec, en de inhoud
 * van een vervallen spec (status blijft `vervallen`; spec rolhek-lezen/AC-19, OV-2). Een vervallen ADR komt hier niet: dat is `a4`.
 * @param {string} van @param {string} naar @param {string} kind
 */
function toegestaanZonderRecord(van, naar, kind) {
  if (kind === 'adr') return van === 'geaccepteerd' && (naar === 'vervallen' || /^vervangen door \d{4}$/.test(naar));
  if (naar === 'vervallen') return van === 'goedgekeurd' || van === 'gebouwd' || van === 'vervallen';
  return van === 'goedgekeurd' && naar === 'goedgekeurd';
}

/**
 * Leest het PR-nummer en de SHA uit de oude vormen `gebouwd # #<PR>` en `gebouwd # #<PR>; gevalideerd: <sha>` (apps,
 * geschiedenis). De vorm is nu `status: gebouwd` zonder nummer (ADR 0095); daarvoor en voor elk ander commentaar: null.
 * @param {string} text @returns {{ pr: number, sha?: string } | null}
 */
export function builtReference(text) {
  const match = /^status: gebouwd # #(\d+)(?:; gevalideerd: ([0-9a-f]{40}))?\r?$/m.exec(text);
  const pr = Number(match?.[1]);
  const sha = match?.[2];
  if (!Number.isSafeInteger(pr) || pr <= 0) return null;
  return sha === undefined ? { pr } : { pr, sha };
}
