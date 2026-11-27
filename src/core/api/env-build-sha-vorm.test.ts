import { expect, test } from 'vitest';
import { parseEnv } from './env.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-7: BUILD_SHA is optioneel, 7 tot 40 kleine hexadecimale
// tekens; leeg telt als niet gezet; een andere vorm weigert de omgeving met de naam in de melding en zonder de waarde.
const local = {
  APP_ENV: 'local',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_BASE_URL: 'http://localhost:5173',
  AUTH_SECRET: 'ab12'.repeat(10),
  DATABASE_URL: 'postgres://db.example.test:5432/app',
  AUTH_DATABASE_URL: 'postgres://db.example.test:5432/app',
  JOBS_DATABASE_URL: 'postgres://db.example.test:5432/app',
  SMTP_URL: 'smtp://mail.example.test:2525',
};

const SEVEN = 'abc1234';
const FORTY = '0123456789abcdef'.repeat(2) + '01234567';

test('release-versie/AC-7: zonder BUILD_SHA is de omgeving geldig en buildSha undefined', () => {
  expect(parseEnv(local).buildSha).toBeUndefined();
});

test('release-versie/AC-7: een lege BUILD_SHA telt als niet gezet', () => {
  expect(parseEnv({ ...local, BUILD_SHA: '' }).buildSha).toBeUndefined();
});

test.each([
  ['zeven tekens', SEVEN],
  ['veertig tekens', FORTY],
])('release-versie/AC-7: %s: geldig', (_case, value) => {
  expect(value).toHaveLength(_case === 'zeven tekens' ? 7 : 40);
  expect(parseEnv({ ...local, BUILD_SHA: value }).buildSha).toBe(value);
});

test.each([
  ['zes tekens', 'abc123'],
  ['41 tekens', `${FORTY}a`],
  ['een hoofdletter', 'ABC1234'],
  ['één hoofdletter tussen kleine letters', 'abC1234'],
  ['een teken buiten hexadecimaal', 'abc123g'],
  ['een streepje', 'abc-1234'],
  ['een spatie achteraan', 'abc1234 '],
  ['een regeleinde achteraan', 'abc1234\n'],
])('release-versie/AC-7: %s: geweigerd met de naam BUILD_SHA en zonder de waarde', (_case, value) => {
  let message = '';
  try {
    parseEnv({ ...local, BUILD_SHA: value });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain('Ongeldige omgeving (env)');
  expect(message).toContain('BUILD_SHA');
  expect(message).not.toContain(value);
});
