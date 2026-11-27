// Spec nachtrun (ADR 0115 punt 7): de open vragen die een agent zonder de eigenaar afhandelde, als feitensectie `besluiten`.
// Een voorlopige keuze (`⏳ voorlopig`) of een geparkeerde vraag (`⏸ geparkeerd`) staat in `## Open vragen` van een spec:
//   - **OV-3 ⏳ voorlopig** — <vraag>; gekozen: <keuze> (agent, <datum>)
//   - **OV-4 ⏸ geparkeerd** — <vraag>; wacht op de eigenaar (<datum>)
// Zodra de eigenaar beslist, wordt de markering `✅ besloten` en valt de regel hier weg. Puur: de aanroeper leest de bestanden.

export const SPECMAPPEN = ['docs/template/specs', 'docs/specs'];
export const MARKERINGEN = /** @type {const} */ (['⏳ voorlopig', '⏸ geparkeerd']);
const REGEL = /^- \*\*(OV-\d+) (⏳ voorlopig|⏸ geparkeerd)\*\*\s*[—–-]\s*(.*)$/u;

/** @typedef {{ spec: string, id: string, soort: 'voorlopig' | 'geparkeerd', tekst: string, regel: number }} Besluit */
/** @typedef {{ pad: string, tekst: string }} Bestand */

/**
 * De specs uit `SPECMAPPEN` (niet `_*.md`), via de lezer van de aanroeper; een ontbrekende map geeft niets.
 * @param {{ lijst: (map: string) => string[], lees: (pad: string) => string | null }} lezer @returns {Bestand[]}
 */
export function specBestanden(lezer) {
  return SPECMAPPEN.flatMap((map) =>
    lezer
      .lijst(map)
      .filter((naam) => naam.endsWith('.md') && !naam.startsWith('_'))
      .map((naam) => ({ pad: `${map}/${naam}`, tekst: lezer.lees(`${map}/${naam}`) ?? '' })),
  );
}

/**
 * De voorlopige en geparkeerde open vragen van één spec, in volgorde van het bestand; alleen de eerste regel van een punt.
 * @param {Bestand} bestand @returns {Besluit[]}
 */
export function besluitenIn({ pad, tekst }) {
  /** @type {Besluit[]} */
  const gevonden = [];
  tekst.split('\n').forEach((regel, index) => {
    const treffer = REGEL.exec(regel.trimEnd());
    if (treffer === null) return;
    const [, id = '', markering = '', rest = ''] = treffer;
    const soort = markering === '⏳ voorlopig' ? 'voorlopig' : 'geparkeerd';
    gevonden.push({ spec: pad, id, soort, tekst: rest.trim(), regel: index + 1 });
  });
  return gevonden;
}

/**
 * De feitensectie over alle specs: eerst de geparkeerde (die wachten op de eigenaar), dan de voorlopige.
 * @param {Bestand[]} bestanden @returns {{ json: Besluit[], kop: string, inhoud: string[] }}
 */
export function besluitenSectie(bestanden) {
  const alle = bestanden.flatMap((bestand) => besluitenIn(bestand));
  const geparkeerd = alle.filter((besluit) => besluit.soort === 'geparkeerd');
  const voorlopig = alle.filter((besluit) => besluit.soort === 'voorlopig');
  const kop = `${geparkeerd.length} geparkeerd, ${voorlopig.length} voorlopig; herzien: zet de markering op ✅ besloten`;
  const inhoud =
    alle.length === 0
      ? ['geen voorlopige of geparkeerde besluiten']
      : [...geparkeerd, ...voorlopig].map(
          (besluit) => `${besluit.soort} ${besluit.spec}:${besluit.regel} ${besluit.id} — ${besluit.tekst}`,
        );
  return { json: [...geparkeerd, ...voorlopig], kop, inhoud };
}
