// Regel 20 van check-docs (leerpunt #940): een testwijziging voor een AC laat de AC-tekst niet ongemerkt onwaar staan.
// Een nieuwe regel `GEWIJZIGD (… <ns>/AC-n …)` in een testbestand, tegenover de merge-base met origin/main, voor een AC
// dat daar al gebouwd was (ADR 0104), betekent dat de test voor dat AC veranderde (R-TEST-02). Staat het lijstitem van dat AC in de spec dan letterlijk zoals op de basis, dan
// belooft de spec mogelijk iets anders dan test en code (R-WERK-15). Klopt de tekst nog (alleen een testnaam of opzet
// veranderde), dan zegt het commentaar dat met `AC-tekst klopt`. Puur: geen fs en geen git; de bomen komen uit
// scripts/kit/ac-dekking.mjs.
import { dekkingVanSpec, SPEC_BESTAND, specNamen, TESTBESTAND } from '../../rails/hooks/lib/ac-dekking.mjs';

/** @typedef {import('../../rails/hooks/lib/ac-dekking.mjs').Boom} Boom */
/** @typedef {{ key: string, message: string }} Violation */

export const VRIJSTELLING = 'AC-tekst klopt';
const ID = /(?<![\w/.-])([\w.-]+)\/(AC-\d+)(?![\w-])/g;
// Een vervolgregel van hetzelfde commentaar: `//`, `*` of `#` na inspringing, zonder nieuwe GEWIJZIGD-markering.
const VERVOLG = /^\s*(?:\/\/|\*|#)/;

/** De regels met `GEWIJZIGD`, elk met de vervolgregels van hetzelfde commentaar. @param {string} tekst */
function markeringen(tekst) {
  const regels = tekst.replaceAll('\r\n', '\n').split('\n');
  return regels.flatMap((regel, index) => {
    if (!regel.includes('GEWIJZIGD')) return [];
    const blok = [regel];
    for (const volgende of regels.slice(index + 1)) {
      if (!VERVOLG.test(volgende) || volgende.includes('GEWIJZIGD')) break;
      blok.push(volgende);
    }
    return [{ kop: regel.trim(), blok: blok.join('\n') }];
  });
}

/** Alle GEWIJZIGD-koppen in de testbestanden van een boom, zodat een verhuisd testbestand niets nieuws meldt. @param {Boom} boom */
function koppenIn(boom) {
  return new Set(
    boom.bestanden
      .filter((pad) => TESTBESTAND.test(pad))
      .flatMap((pad) => markeringen(boom.lees(pad) ?? '').map((markering) => markering.kop)),
  );
}

/**
 * Het lijstitem van een AC: de regel `- **<voor>/AC-n**` en de ingesprongen vervolgregels, of null.
 * @param {string} tekst @param {string} id `<voor>/AC-n`
 */
export function acItem(tekst, id) {
  const regels = tekst.replaceAll('\r\n', '\n').split('\n');
  const start = regels.findIndex((regel) => regel.startsWith(`- **${id}**`));
  if (start === -1) return null;
  const einde = regels.findIndex((regel, index) => index > start && !/^\s+\S/.test(regel));
  return regels.slice(start, einde === -1 ? regels.length : einde).join('\n');
}

/**
 * De spec in de boom met deze naam of namespace als voorvoegsel, of undefined. @param {Boom} boom @param {string} voor
 * @returns {{ file: string, naam: string } | undefined}
 */
function specVan(boom, voor) {
  for (const file of boom.bestanden) {
    if (!SPEC_BESTAND.test(file)) continue;
    const { naam, eigen } = specNamen(file, boom.lees(file) ?? '');
    if (eigen.has(voor)) return { file, naam };
  }
  return undefined;
}

/**
 * Regel 20: per AC met een nieuwe GEWIJZIGD-regel zonder `AC-tekst klopt`, waarvan het lijstitem in de spec gelijk is aan
 * dat op de basis en dat op de basis gebouwd was, één overtreding `docs:ac-tekst:<spec>:<AC-n>`. Een spec of AC die op de
 * basis niet bestond of niet gebouwd was, telt niet.
 * @param {{ basis: Boom, nu: Boom, hernoemd: Readonly<Record<string, string>> }} stand
 * @returns {Violation[]}
 */
export function acTekstViolations({ basis, nu, hernoemd }) {
  const oud = koppenIn(basis);
  /** @type {Map<string, { test: string, voor: string, ac: string }>} */
  const geraakt = new Map();
  for (const test of nu.bestanden.filter((pad) => TESTBESTAND.test(pad))) {
    for (const { kop, blok } of markeringen(nu.lees(test) ?? '')) {
      if (oud.has(kop) || blok.includes(VRIJSTELLING)) continue;
      for (const [, voor = '', ac = ''] of kop.matchAll(ID)) geraakt.set(`${voor}/${ac}`, { test, voor, ac });
    }
  }
  return [...geraakt].flatMap(([id, { test, voor, ac }]) => {
    const spec = specVan(nu, voor);
    if (spec === undefined) return [];
    const oudPad = hernoemd[spec.file] ?? spec.file;
    const oudeTekst = basis.lees(oudPad) ?? '';
    const item = acItem(nu.lees(spec.file) ?? '', id);
    const vorig = acItem(oudeTekst, id);
    if (item === null || vorig === null || item !== vorig) return [];
    // Alleen een AC dat op main al gebouwd was: bij de bouw noemt een GEWIJZIGD-regel het AC als reden, en klopt de tekst al.
    if (!dekkingVanSpec({ file: oudPad, text: oudeTekst }, basis).gebouwd.includes(ac)) return [];
    return [
      {
        key: `docs:ac-tekst:${spec.naam}:${ac}`,
        message: `${spec.file}: ${test} kreeg een nieuwe GEWIJZIGD-regel voor ${id}, maar de AC-tekst is gelijk aan die op main; werk de AC bij of zet "${VRIJSTELLING}" in het commentaar als de tekst nog waar is (R-WERK-15, leerpunt #940)`,
      },
    ];
  });
}
