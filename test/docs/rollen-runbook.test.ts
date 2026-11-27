import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec achtergrondtaken (namespace jobs), jobs/AC-18: docs/operations/rollen.md noemt elke rol uit db/init/01-roles.sql met
// dezelfde attributen (login/nologin, noinherit, in role) en dezelfde `alter role … set`-instellingen (timeouts, search_path).
// Het SQL-bestand wordt geparsed: een nieuwe rol of instelling zonder runbook-regel laat deze test falen.
//
// Aanname over de vorm van het runbook: de gegevens van een rol staan bij elkaar, in een tabelrij waarin de rolnaam voorkomt, in
// een regel of lijstitem met de rolnaam, of in de sectie onder een kop die de rolnaam bevat. De test voegt die stukken samen.
const SQL = readFileSync('db/init/01-roles.sql', 'utf8');
const RUNBOOK_PATH = 'docs/operations/rollen.md';

interface RoleSpec {
  readonly name: string;
  readonly attributes: readonly string[];
  readonly parent: string | null;
  readonly settings: readonly { readonly key: string; readonly value: string }[];
}

function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function parseRoles(sql: string): RoleSpec[] {
  const statements = withoutComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim());
  const roles = new Map<string, { attributes: string[]; parent: string | null }>();
  for (const statement of statements) {
    const create = /^create role (\w+)(.*)$/i.exec(statement);
    if (create === null) continue;
    const [, name = '', rest = ''] = create;
    const parent = /\bin role (\w+)/i.exec(rest)?.[1] ?? null;
    const attributes = ['nologin', 'login', 'noinherit'].filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(rest));
    roles.set(name, { attributes, parent });
  }
  return [...roles].map(([name, { attributes, parent }]) => ({
    name,
    attributes,
    parent,
    settings: statements.flatMap((statement) => {
      const alter = /^alter role (\w+) set (\w+) = '?([^']+?)'?$/i.exec(statement);
      return alter !== null && alter[1] === name ? [{ key: alter[2] ?? '', value: alter[3] ?? '' }] : [];
    }),
  }));
}

const mentions = (line: string, name: string) => new RegExp(`(?<![\\w])${name}(?![\\w])`).test(line);

// De tekst van het runbook die bij een rol hoort (zie de aanname bovenaan).
function chunkFor(runbook: string, name: string): string {
  const lines = runbook.split('\n');
  const parts: string[] = [];
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line) && mentions(line, name)) {
      const level = /^#+/.exec(line)?.[0].length ?? 1;
      const section: string[] = [line];
      for (const next of lines.slice(index + 1)) {
        const heading = /^(#+)\s/.exec(next);
        if (heading !== null && (heading[1]?.length ?? 0) <= level) break;
        section.push(next);
      }
      parts.push(section.join('\n'));
    } else if (mentions(line, name)) {
      parts.push(line);
    }
  });
  return parts.join('\n');
}

// "5s" in de SQL mag in het runbook als "5s" of "5 s" staan.
function valuePattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/^(\d+)([a-z]+)$/i, '$1\\s?$2'), 'i');
}

const roles = parseRoles(SQL);

describe('db/init/01-roles.sql wordt gelezen', () => {
  test('jobs/AC-18: de parser vindt alle rollen, ook app_jobs, met hun timeouts', () => {
    expect(roles.map((role) => role.name)).toEqual(
      expect.arrayContaining([
        'app_migrator',
        'app_authenticated',
        'api_user',
        'auth_service',
        'app_definer',
        'app_jobs',
      ]),
    );
    const jobs = roles.find((role) => role.name === 'app_jobs');
    expect(jobs?.attributes).toStrictEqual(['login', 'noinherit']);
    expect(jobs?.settings).toStrictEqual([
      { key: 'statement_timeout', value: '5s' },
      { key: 'idle_in_transaction_session_timeout', value: '10s' },
    ]);
  });
});

describe('docs/operations/rollen.md', () => {
  const runbook = (() => {
    try {
      return readFileSync(RUNBOOK_PATH, 'utf8');
    } catch {
      return null;
    }
  })();

  test('jobs/AC-18: het runbook bestaat', () => {
    expect(runbook, `${RUNBOOK_PATH} ontbreekt`).not.toBeNull();
  });

  test.each(roles.map((role) => [role.name, role] as const))(
    'jobs/AC-18: noemt rol %s met dezelfde attributen en instellingen als 01-roles.sql',
    (name, role) => {
      const chunk = runbook === null ? '' : chunkFor(runbook, name);

      expect(chunk, `rol ${name} komt niet voor in ${RUNBOOK_PATH}`).not.toBe('');
      for (const attribute of role.attributes) {
        expect(chunk.toLowerCase(), `${name}: ${attribute}`).toMatch(new RegExp(`(?<![a-z])${attribute}(?![a-z])`));
      }
      if (role.parent !== null) expect(chunk, `${name}: in role ${role.parent}`).toContain(role.parent);
      for (const { key, value } of role.settings) {
        expect(chunk, `${name}: ${key}`).toContain(key);
        expect(chunk, `${name}: ${key} = ${value}`).toMatch(valuePattern(value));
      }
    },
  );
});
