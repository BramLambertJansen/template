import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ROLE_NAME_MAX_LENGTH } from '../../src/core/shared/limits.ts';

// Spec rollenregister, AC-14 (R-CODE-07): een grens uit limits.ts met een CHECK van dezelfde waarde krijgt een gelijkheidstest.
// De database bewijst de grens zelf in db/tests/roles.sql (33 tekens: CHECK); hier de tekst van de migratie.
describe('ROLE_NAME_MAX_LENGTH en de CHECK op app.roles.name', () => {
  const dir = path.join(import.meta.dirname, '../../db/migrations');
  const texts = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(path.join(dir, file), 'utf8'))
    .filter((text) => /create table app\.roles\b/i.test(text));
  const table = /create table app\.roles\b[\s\S]*?\n\);/i.exec(texts[0] ?? '')?.[0] ?? '';

  test('rollenregister/AC-14: precies één migratie maakt app.roles', () => {
    expect(texts).toHaveLength(1);
  });

  test('rollenregister/AC-14: de CHECK op de naam begrenst op ROLE_NAME_MAX_LENGTH tekens', () => {
    expect(table).toMatch(new RegExp(`length\\(name\\)\\s*<=\\s*${String(ROLE_NAME_MAX_LENGTH)}\\b`));
  });

  test('rollenregister/AC-14: de CHECK op de naam eist ^[a-z][a-z0-9_]*$, zoals defineRoles', () => {
    expect(table).toContain('^[a-z][a-z0-9_]*$');
  });
});
