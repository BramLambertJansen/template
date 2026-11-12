// Eén nummering per ADR-map (ADR 0089 punt 6): `docs/adr/` (van de app, met het archief zolang dat bestaat) en
// `docs/template/adr/` (van de template) tellen elk apart; geen apart historisch register.

/** De ADR-mappen, app eerst. */
export const ADR_MAPPEN = /** @type {const} */ (['docs/adr/', 'docs/template/adr/']);

const ADR_BESTAND = /^docs\/(?:(template\/adr)|adr(?:\/archief)?)\/(\d{4})-[^/]+\.md$/;

/** @param {string} file */
export function adrNumber(file) {
  return ADR_BESTAND.exec(file)?.[2];
}

/**
 * De map waarin het nummer van een ADR telt (`docs/adr/archief/` telt in `docs/adr/`), of undefined voor een ander pad.
 * @param {string} file @returns {(typeof ADR_MAPPEN)[number] | undefined}
 */
export function adrMap(file) {
  const match = ADR_BESTAND.exec(file);
  if (match === null) return undefined;
  return match[1] === undefined ? 'docs/adr/' : 'docs/template/adr/';
}

/**
 * Elk `.md`-bestand in docs/adr/ (en archief/) en docs/template/adr/ heet `NNNN-slug.md`, anders valt het buiten de nummering
 * (`0040_x.md`, `00400-x.md`). Uitgezonderd: README.md en sjablonen (naam begint met `_`).
 * @param {readonly string[]} files @returns {{ key: string, message: string }[]}
 */
export function invalidAdrNames(files) {
  return files
    .filter(
      (file) =>
        /^docs\/(?:template\/adr|adr(?:\/archief)?)\/(?!README\.md$|_)[^/]+\.md$/.test(file) &&
        adrNumber(file) === undefined,
    )
    .map((file) => ({
      key: `docs:${file}:adr-naam`,
      message: `${file}: een ADR heet NNNN-slug.md (vier cijfers, een streepje, een slug); README.md en _sjablonen uitgezonderd`,
    }));
}

/**
 * Het nummer in de kop (`# NNNN — titel`) is het nummer van het bestand (ADR 0089 punt 4).
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {{ key: string, message: string }[]}
 */
export function adrKopViolations(files, read) {
  return files.flatMap((file) => {
    const nummer = adrNumber(file);
    if (nummer === undefined) return [];
    const kop = /^# (.*)$/m.exec(read(file))?.[1];
    if (kop?.startsWith(`${nummer} `) === true) return [];
    return [
      {
        key: `docs:${file}:adr-kop`,
        message: `${file}: de kop begint niet met het bestandsnummer; schrijf "# ${nummer} — <titel>"`,
      },
    ];
  });
}

/**
 * Een nummer is uniek per map (ADR 0089 punt 6): hetzelfde nummer in `docs/adr/` en `docs/template/adr/` is geen dubbel.
 * `docs/adr/` houdt de sleutel `docs:adr:<nummer>:dubbel`, de template-map krijgt `docs:template/adr:<nummer>:dubbel`.
 * @param {readonly string[]} files @returns {{ key: string, message: string }[]}
 */
export function duplicateAdrNumbers(files) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const file of files) {
    const number = adrNumber(file);
    const groep = `${adrMap(file) ?? ''}:${number ?? ''}`;
    if (number !== undefined) groups.set(groep, [...(groups.get(groep) ?? []), file]);
  }
  return [...groups]
    .filter(([, paths]) => paths.length > 1)
    .map(([groep, paths]) => {
      const [map = '', number = ''] = groep.split(':');
      const names = paths.map((file) => file.replace('docs/adr/archief/', 'docs/adr/')).sort();
      const legacy =
        names.join('\n') ===
        ['docs/adr/0039-lokale-gate-hergebruik.md', 'docs/adr/0039-stack-provider-neutraal-en-toolchain.md'].join('\n');
      // De bestaande ratchet-sleutel geldt uitsluitend voor dit historische paar, nooit voor nieuw misbruik van 0039.
      const suffix = number === '0039' && !legacy ? `:${[...paths].sort().join('|')}` : '';
      return {
        key: `docs:${map.slice('docs/'.length, -1)}:${number}:dubbel${suffix}`,
        message: `ADR-nummer ${number} is al gebruikt in meer dan één bestand: ${paths.join(', ')}`,
      };
    });
}
