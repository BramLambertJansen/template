// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { UserId } from '#core/shared/ids.ts';

export const userRoles = pgTable('user_roles', {
  userId: text('user_id').$type<UserId>().primaryKey(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .default(sql`now()`),
});
