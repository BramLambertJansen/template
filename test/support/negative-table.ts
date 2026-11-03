import { isDeepStrictEqual } from 'node:util';

// Negatieve tabel die eerst zijn basis bewijst (leerpunt #401). Alle rijen van een tabel gaven `false`, maar de gedeelde
// basis was zelf al onwaar: het weghalen van een bewaakte voorwaarde liet alles groen. Daarom eerst: de basis is waar.
// Dan per rij: de wijziging verandert iets, maakt de uitkomst onwaar en laat de basis zelf ongemoeid. Zo bewijst elke rij
// dat precies zijn voorwaarde in de code de uitkomst bepaalt. De rail `rails/negatieve-tabel` (eslint.config.js) laat
// een tabel die per rij `false` eist alleen via deze route toe.

export interface NegativeCase<B> {
  /** Welke ene voorwaarde deze rij onwaar maakt; staat in de melding. */
  readonly name: string;
  /** Een nieuwe waarde op basis van de basis, met precies die ene voorwaarde gewijzigd. */
  readonly change: (base: B) => B;
}

export interface NegativeTable<B> {
  /** Een geldige invoer: `check(base)` is waar. */
  readonly base: B;
  readonly check: (input: B) => boolean;
  readonly cases: readonly NegativeCase<B>[];
}

function caseFailure<B>(table: NegativeTable<B>, row: NegativeCase<B>): string | null {
  const changed = row.change(table.base);
  if (!table.check(table.base)) return `"${row.name}" wijzigt de basis zelf; geef een nieuwe waarde terug`;
  if (isDeepStrictEqual(changed, table.base)) return `"${row.name}" verandert niets aan de basis`;
  if (table.check(changed)) return `"${row.name}" geeft nog steeds waar; die voorwaarde wordt niet bewaakt`;
  return null;
}

export function expectNegativeTable<B>(table: NegativeTable<B>): void {
  if (table.cases.length === 0) throw new Error('expectNegativeTable: geef minstens één rij');
  if (!table.check(table.base)) {
    throw new Error(
      'expectNegativeTable: de basis is al onwaar, dus geen rij bewijst iets; maak eerst de basis geldig',
    );
  }
  const failures = table.cases.map((row) => caseFailure(table, row)).filter((failure) => failure !== null);
  if (failures.length > 0) throw new Error(`expectNegativeTable:\n- ${failures.join('\n- ')}`);
}
