import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from './security-headers.ts';

// Spec files, AC-5 (CSP): contentSecurityPolicy(nonce?, connectOrigin?) en securityHeaders(nonce?, connectOrigin?). De tweede
// parameter is de uploadOrigin van de adapter; zonder (of null) blijft connect-src precies 'self'. vite.config.ts (dev en
// preview) geeft nooit een origin mee.

const ORIGIN = 'https://opslag.example.test';

function directive(policy: string, name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`directive ${name} ontbreekt in: ${policy}`);
  return found.split(/\s+/).slice(1);
}

function cspOf(headers: Record<string, string>): string {
  const value = headers['Content-Security-Policy'];
  if (value === undefined) throw new Error('Content-Security-Policy ontbreekt');
  return value;
}

describe('files/AC-5: connect-src in security-headers.ts', () => {
  test("files/AC-5: met een origin bevat connect-src precies 'self' en die origin", () => {
    expect(directive(contentSecurityPolicy(undefined, ORIGIN), 'connect-src')).toStrictEqual(["'self'", ORIGIN]);
  });

  test.each([
    ['zonder tweede parameter', () => contentSecurityPolicy()],
    ['met null', () => contentSecurityPolicy(undefined, null)],
    ['met undefined', () => contentSecurityPolicy(undefined, undefined)],
  ])("files/AC-5: %s is connect-src precies 'self'", (_, policy) => {
    expect(directive(policy(), 'connect-src')).toStrictEqual(["'self'"]);
  });

  test('files/AC-5: de origin raakt de andere directives en de nonce niet', () => {
    const met = contentSecurityPolicy('abc', ORIGIN);
    const zonder = contentSecurityPolicy('abc');

    expect(met.replace(` ${ORIGIN}`, '')).toBe(zonder);
    expect(directive(met, 'script-src')).toStrictEqual(["'self'", "'nonce-abc'"]);
    expect(directive(met, 'default-src')).toStrictEqual(["'self'"]);
  });

  test('files/AC-5: securityHeaders geeft de origin door aan de CSP en laat de andere headers gelijk', () => {
    const met = securityHeaders(undefined, ORIGIN);
    const zonder = securityHeaders();

    expect(directive(cspOf(met), 'connect-src')).toStrictEqual(["'self'", ORIGIN]);
    expect(directive(cspOf(zonder), 'connect-src')).toStrictEqual(["'self'"]);
    expect({ ...met, 'Content-Security-Policy': '' }).toStrictEqual({ ...zonder, 'Content-Security-Policy': '' });
  });

  test("files/AC-5: de headers die vite.config.ts gebruikt (met en zonder nonce, zonder origin) hebben connect-src precies 'self'", () => {
    expect(directive(cspOf(securityHeaders('dev-only-nonce')), 'connect-src')).toStrictEqual(["'self'"]);
    expect(directive(cspOf(securityHeaders()), 'connect-src')).toStrictEqual(["'self'"]);
  });

  test('files/AC-5: vite.config.ts roept securityHeaders alleen aan met de nonce en geeft nooit een origin mee', () => {
    const source = readFileSync(path.join(import.meta.dirname, '../../../../vite.config.ts'), 'utf8');
    const calls = [...source.matchAll(/securityHeaders\(([^)]*)\)/g)].map((match) => match[1] ?? '');

    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const args of calls) expect(args).not.toContain(',');
  });
});
