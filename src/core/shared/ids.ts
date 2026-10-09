import { z } from 'zod';

// Branded IDs (framework §4): een UserId is geen willekeurige string. Een app definieert eigen IDs in src/shared/ids.ts
// met brandedId(); na schema-introspectie zet een script $type<…>() in het Drizzle-schema (stuk 5c).
export function brandedId<const Brand extends string>(brand: Brand) {
  return z.string().min(1).max(200).brand(brand);
}

export const UserId = brandedId('UserId');
export type UserId = z.infer<typeof UserId>;
