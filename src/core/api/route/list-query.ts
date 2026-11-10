import { z } from 'zod';
import { assert } from '../../shared/assert.ts';
import { decodeCursor } from '../../shared/cursor.ts';
import type { ListSearch, ListSearchConfig } from '../../shared/list-search.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { AppError } from '../errors.ts';

// Gedeelde helpers voor lijstroutes (spec lijstpagina, "Lijstquery-helpers", leerpunt #662): één decoder voor de cursor en één
// escape voor `ilike`, zodat een resource ze niet kopieert. Staat in core/api omdat de decoder `AppError` gooit.

export type ListCursorParts = readonly [z.ZodType, ...z.ZodType[]];

export type ListCursorKey<Parts extends ListCursorParts> = {
  [K in keyof Parts]: Parts[K] extends z.ZodType ? z.infer<Parts[K]> : never;
};

// `%`, `_` en `\` zoeken letterlijk (`ilike` gebruikt `\` als escape). Totaal: lege invoer geeft `%%`.
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// Zonder cursor `null`; anders de geparste sleuteldelen na de sorteernaam. Een gemanipuleerde cursor (ZodError) is invoer van de
// client en dus VALIDATION; elke andere fout (een bug in een sleutelschema) gaat ongewijzigd door als INTERNAL_ERROR.
export function decodeListCursor<Config extends ListSearchConfig, Parts extends ListCursorParts>(
  search: ListSearch<Config>,
  input: { readonly sort: Config['sorts'][number]; readonly cursor?: string | undefined },
  parts: Parts,
): ListCursorKey<Parts> | null {
  const { sort, cursor } = input;
  if (cursor === undefined) return null;
  const declared = search.cursorKeys[sort];
  assert(
    declared !== undefined && parts.length === declared.length,
    `decodeListCursor: sortering '${sort}' heeft ${String(parts.length)} sleutelschema's, cursorKeys geeft er ${String(declared?.length)}`,
  );
  const schema = unsafeCast<z.ZodType<readonly unknown[]>>(
    z.tuple([z.literal(sort), ...parts]),
    'z.tuple met een gespreide tuple geeft geen vaste tuple af; het schema parst een array',
  );
  try {
    const [, ...key] = decodeCursor(cursor, schema);
    return unsafeCast<ListCursorKey<Parts>>(key, 'de delen na de sorteernaam zijn door de schema’s in parts geparst');
  } catch (error) {
    if (error instanceof z.ZodError) throw new AppError('VALIDATION');
    throw error;
  }
}
