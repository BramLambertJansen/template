import { describe, expect, test } from 'vitest';
import { renderSchema } from '../../scripts/db/schema-source.mjs';

// De generator van src/api/db/schema.ts (pnpm db:generate): catalogus → Drizzle-schema met branded IDs.
type Column = Parameters<typeof renderSchema>[0]['columns'][number];

function column(table: string, name: string, udt: string, extra: Partial<Column> = {}): Column {
  return {
    schema: 'public',
    table,
    name,
    udt,
    isArray: false,
    nullable: false,
    defaultExpr: null,
    identity: null,
    generatedExpr: null,
    length: null,
    precision: null,
    scale: null,
    ...extra,
  };
}

const userRoles = {
  columns: [
    column('user_roles', 'user_id', 'text'),
    column('user_roles', 'role', 'text'),
    column('user_roles', 'created_at', 'timestamptz', { defaultExpr: 'now()' }),
  ],
  primaryKeys: { 'public.user_roles': ['user_id'] },
  foreignKeys: [{ from: 'public.user_roles.user_id', to: 'better_auth.user.id' }],
};

describe('renderSchema', () => {
  test('user_roles: UserId via de foreign key naar better_auth, tijd als ISO-string, default als sql', () => {
    expect(renderSchema(userRoles, {})).toBe(
      [
        '// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.',
        "import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';",
        "import { sql } from 'drizzle-orm';",
        "import type { UserId } from '#core/shared/ids.ts';",
        '',
        "export const userRoles = pgTable('user_roles', {",
        "  userId: text('user_id').$type<UserId>().primaryKey(),",
        "  role: text('role').notNull(),",
        "  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),",
        '});',
        '',
      ].join('\n'),
    );
  });

  test('een id-kolom zonder brand faalt met de weg naar db/ids.json', () => {
    const notes = {
      columns: [column('notes', 'id', 'uuid'), column('notes', 'owner_id', 'text')],
      primaryKeys: { 'public.notes': ['id'] },
      foreignKeys: [{ from: 'public.notes.owner_id', to: 'better_auth.user.id' }],
    };

    expect(() => renderSchema(notes, {})).toThrow(/public\.notes\.id[\s\S]*db\/ids\.json/);
    const source = renderSchema(notes, { 'public.notes.id': 'NoteId' });
    expect(source).toContain("id: uuid('id').$type<NoteId>().primaryKey(),");
    expect(source).toContain("ownerId: text('owner_id').$type<UserId>().notNull(),");
    expect(source).toContain("import type { NoteId } from '#shared/ids.ts';");
  });

  test('een brand gaat via een keten van foreign keys mee; null in db/ids.json betekent bewust geen brand', () => {
    const catalog = {
      columns: [
        column('notes', 'id', 'uuid'),
        column('comments', 'id', 'int8', { identity: 'ALWAYS' }),
        column('comments', 'note_id', 'uuid'),
        column('comments', 'external_id', 'text', { nullable: true }),
      ],
      primaryKeys: { 'public.notes': ['id'], 'public.comments': ['id'] },
      foreignKeys: [{ from: 'public.comments.note_id', to: 'public.notes.id' }],
    };
    const source = renderSchema(catalog, {
      'public.notes.id': 'NoteId',
      'public.comments.id': 'CommentId',
      'public.comments.external_id': null,
    });

    expect(source).toContain("noteId: uuid('note_id').$type<NoteId>().notNull(),");
    expect(source).toContain(
      "id: bigint('id', { mode: 'number' }).$type<CommentId>().primaryKey().generatedAlwaysAsIdentity(),",
    );
    expect(source).toContain("externalId: text('external_id'),");
  });

  test('schema app, samengestelde primary key en arrays', () => {
    const catalog = {
      columns: [
        column('memberships', 'team_id', 'text', { schema: 'app' }),
        column('memberships', 'user_id', 'text', { schema: 'app' }),
        column('memberships', 'tags', 'text', { schema: 'app', isArray: true }),
      ],
      primaryKeys: { 'app.memberships': ['team_id', 'user_id'] },
      foreignKeys: [{ from: 'app.memberships.user_id', to: 'better_auth.user.id' }],
    };
    const source = renderSchema(catalog, { 'app.memberships.team_id': 'TeamId' });

    expect(source).toContain("const appSchema = pgSchema('app');");
    expect(source).toContain("export const appMemberships = appSchema.table('memberships', {");
    expect(source).toContain("tags: text('tags').array().notNull(),");
    expect(source).toContain('(table) => [primaryKey({ columns: [table.teamId, table.userId] })]');
    expect(source).not.toContain('pgTable');
  });

  test('timestamp zonder tijdzone en onbekende types falen hard', () => {
    const at = (udt: string) => ({
      columns: [column('t', 'at', udt)],
      primaryKeys: {},
      foreignKeys: [],
    });

    expect(() => renderSchema(at('timestamp'), {})).toThrow('gebruik timestamptz');
    expect(() => renderSchema(at('bytea'), {})).toThrow('type bytea wordt niet ondersteund');
  });
});
