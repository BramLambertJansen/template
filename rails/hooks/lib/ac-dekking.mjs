// De AC-dekking van specs (ADR 0104, spec gebouwd-zonder-nummer): of een spec gebouwd is, volgt uit de boom. Een AC is
// gebouwd als een testbestand `<namespace>/AC-n` of `<specnaam>/AC-n` als heel woord noemt; een `goedgekeurde` spec is
// gebouwd als elk levend eigen AC dat is, anders deels (OV-9: zonder levend AC `niet`). Puur: geen fs, geen git en niets uit
// scripts/kit, zodat het rolhek dit laadt zonder git-laag (de git-laag staat in scripts/kit/ac-dekking.mjs).
import path from 'node:path';
import { acIds } from './document-state.mjs';

/** @typedef {{ bestanden: readonly string[], lees: (pad: string) => string | null }} Boom */
/** @typedef {'voorstel' | 'goedgekeurd' | 'vervallen'} Eigenaarstatus */
/**
 * `gebouwd` en `levend` zijn AC-ids `AC-n`, numeriek oplopend; `vervallen` de eigen AC's in de vervallen-vorm (AC-5).
 * @typedef {{ eigenaar: Eigenaarstatus | undefined, stand: 'niet' | 'deels' | 'gebouwd', gebouwd: string[], levend: string[], vervallen: string[] }} Dekking
 */

// Testpaden uit .claude/gates.json (`testpaden`): `*.test.*`, `*.spec.*`, `db/tests/**`, `e2e/**`, `test/**`.
export const TESTBESTAND = /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$|^(?:db\/tests|e2e|test)\//;
// Specs in docs/specs/ en docs/template/specs/ (framework §10); `_template.md` en dergelijke tellen niet.
export const SPEC_BESTAND = /^docs\/(?:template\/)?specs\/[^_/][^/]*\.md$/;
export const ADR_STATUS = /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m;
// Een AC-id als heel woord, met een optioneel voorvoegsel `<naam>/` (groep 1); groep 2 is het id.
export const AC_ID = /(?<![\w/-])(?:([\w.-]+)\/)?(AC-\d+)(?![\w-])/g;

const STATUS = /^status:\s*(voorstel|goedgekeurd|gebouwd|vervallen)\b/m;
const GEBOUWD_REGEL = /^status:[ \t]*gebouwd\b[^\n]*$/m;
// Een id met voorvoegsel als heel woord in een testbestand, zoals `heelWoord` het toetst: de index van één testtekst.
const GENOEMD = /(?<![\w/.-])([\w.-]+\/AC-\d+)(?![\w-])/g;

/**
 * Regex die `naam` als heel woord vindt: geen woordteken, `/`, `.` of `-` ervoor (dus niet in `andere/mijn/AC-1` of
 * `x.mijn/AC-1`), geen woordteken of `-` erna. @param {string} naam
 */
export function heelWoord(naam) {
  return new RegExp(`(?<![\\w/.-])${naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
}

/**
 * Is `ac` van deze spec gedekt door de tekst van één testbestand?
 * @param {string} tekst @param {{ naam: string, namespace: string | undefined }} spec @param {string} ac
 */
export function dekt(tekst, spec, ac) {
  const namen = [spec.naam, ...(spec.namespace === undefined ? [] : [spec.namespace])];
  return namen.some((naam) => heelWoord(`${naam}/${ac}`).test(tekst));
}

// Een vervallen AC (ADR 0095 punt 6): `- **<ns>/AC-n** — Vervallen door ADR <nummer> … Was: …`, direct na het streepje.
const VERVALLEN_AC = /^- \*\*([a-z0-9][\w.-]*)\/(AC-\d+)\*\* — Vervallen door ADR (\d{4})\b/gm;

/**
 * De eigen AC-id's (`AC-n`) die vervallen zijn door een ADR dat in de ADR-map naast de specmap staat
 * (`docs/template/adr/` voor `docs/template/specs/`, anders `docs/adr/`) en `geaccepteerd` is (gebouwd-zonder-nummer/AC-5).
 * @param {{ file: string, text: string, eigen: ReadonlySet<string | undefined> }} spec
 * @param {readonly string[]} files @param {(file: string) => string | null} read
 * @returns {Set<string>}
 */
export function vervallenAcs({ file, text, eigen }, files, read) {
  const map = file.startsWith('docs/template/specs/') ? 'docs/template/adr/' : 'docs/adr/';
  const geaccepteerd = (/** @type {string} */ nummer) =>
    files.some(
      (adr) =>
        adr.startsWith(`${map}${nummer}-`) &&
        !adr.slice(map.length).includes('/') &&
        adr.endsWith('.md') &&
        ADR_STATUS.exec(read(adr) ?? '')?.[1] === 'geaccepteerd',
    );
  return new Set(
    [...text.replaceAll('\r\n', '\n').matchAll(VERVALLEN_AC)]
      .filter(([, naam, , nummer = '']) => eigen.has(naam) && geaccepteerd(nummer))
      .map(([, , id = '']) => id),
  );
}

/**
 * De eigenaarstatus van een spec; een oude `status: gebouwd` (met elk commentaar) telt als `goedgekeurd` (AC-17).
 * @param {string} text @returns {Eigenaarstatus | undefined}
 */
export function eigenaarStatus(text) {
  const status = STATUS.exec(text)?.[1];
  if (status === 'gebouwd' || status === 'goedgekeurd') return 'goedgekeurd';
  return status === 'voorstel' || status === 'vervallen' ? status : undefined;
}

/** De letterlijke statusregel als die met `status: gebouwd` begint, anders null. @param {string} text */
export function gebouwdRegel(text) {
  return GEBOUWD_REGEL.exec(text.replaceAll('\r\n', '\n'))?.[0] ?? null;
}

/** Naam en namespace van een spec, en de voorvoegsels van haar eigen AC's. @param {string} file @param {string} text */
export function specNamen(file, text) {
  const naam = path.posix.basename(file, '.md');
  const namespace = /^namespace:\s*(\S+)\s*$/m.exec(text)?.[1];
  return { naam, namespace, eigen: new Set([naam, namespace]) };
}

/** @param {readonly string[]} ids */
const oplopend = (ids) => [...new Set(ids)].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));

/** De index per boom, zodat `dekkingVanSpec` over dezelfde boom de testbestanden één keer leest. */
/** @type {WeakMap<Boom, ReadonlySet<string>>} */
const INDEX = new WeakMap();

/** Alle ids met voorvoegsel die de testbestanden van de boom als heel woord noemen. @param {Boom} boom */
function genoemdInTests(boom) {
  const bekend = INDEX.get(boom);
  if (bekend !== undefined) return bekend;
  /** @type {Set<string>} */
  const genoemd = new Set();
  for (const pad of boom.bestanden) {
    if (!TESTBESTAND.test(pad)) continue;
    for (const [, id = ''] of (boom.lees(pad) ?? '').matchAll(GENOEMD)) genoemd.add(id);
  }
  INDEX.set(boom, genoemd);
  return genoemd;
}

/**
 * De dekking van één spec tegen een al geïndexeerde set genoemde ids.
 * @param {{ file: string, text: string }} spec @param {Boom} boom @param {ReadonlySet<string>} genoemd
 * @returns {Dekking}
 */
function dekkingMet({ file, text }, boom, genoemd) {
  const { naam, namespace, eigen } = specNamen(file, text);
  // Een eigen AC is een lijstitem `- **<naam of namespace>/AC-n**`; een ander voorvoegsel is een kruisverwijzing.
  const eigenAcs = [...acIds(text).alle].flatMap((id) => {
    const [voor = '', ac = ''] = id.split('/');
    return eigen.has(voor) ? [ac] : [];
  });
  const vervallen = vervallenAcs({ file, text, eigen }, boom.bestanden, boom.lees);
  const levend = oplopend(eigenAcs.filter((ac) => !vervallen.has(ac)));
  const namen = [naam, ...(namespace === undefined ? [] : [namespace])];
  const gebouwd = levend.filter((ac) => namen.some((voor) => genoemd.has(`${voor}/${ac}`)));
  const eigenaar = eigenaarStatus(text);
  const vol = levend.length > 0 && gebouwd.length === levend.length;
  /** @type {Dekking['stand']} */
  const stand = eigenaar !== 'goedgekeurd' || gebouwd.length === 0 ? 'niet' : vol ? 'gebouwd' : 'deels';
  return { eigenaar, stand, gebouwd, levend, vervallen: oplopend([...vervallen]) };
}

/**
 * De dekking van één spec; `boom` levert de testbestanden en de ADR-map.
 * @param {{ file: string, text: string }} spec @param {Boom} boom @returns {Dekking}
 */
export function dekkingVanSpec(spec, boom) {
  return dekkingMet(spec, boom, genoemdInTests(boom));
}

/**
 * De dekking van elk specbestand (`SPEC_BESTAND`) in de boom.
 * @param {Boom} boom @returns {Map<string, Dekking>}
 */
export function acDekking(boom) {
  const genoemd = genoemdInTests(boom);
  /** @type {Map<string, Dekking>} */
  const kaart = new Map();
  for (const file of boom.bestanden) {
    if (!SPEC_BESTAND.test(file)) continue;
    const text = boom.lees(file);
    if (text !== null) kaart.set(file, dekkingMet({ file, text }, boom, genoemd));
  }
  return kaart;
}
