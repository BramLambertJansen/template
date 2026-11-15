import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

// Spec release-versie (docs/template/specs/release-versie.md), ontwerp "Build-SHA": de Dockerfile krijgt in de
// runtime-stage, na de COPY-stappen, `ARG BUILD_SHA` en zet hem als ENV. Dat de echte image de waarde toont, bewijst
// alleen CI of de eigenaar (AC-9, vervolg-PR); deze test bewaakt de plaats in het bestand.
const lines = readFileSync(path.join(import.meta.dirname, '../../Dockerfile'), 'utf8').split('\n');
const indexOf = (line: string) => lines.indexOf(line);
const lastIndex = (prefix: string) => lines.findLastIndex((line) => line.startsWith(prefix));

test('release-versie: ARG BUILD_SHA staat één keer in de Dockerfile, in de runtime-stage na de laatste COPY', () => {
  const arg = indexOf('ARG BUILD_SHA');
  const runtime = lines.findIndex((line) => line.endsWith(' AS runtime'));

  expect(lines.filter((line) => line.startsWith('ARG BUILD_SHA'))).toStrictEqual(['ARG BUILD_SHA']);
  expect(runtime).toBeGreaterThan(0);
  expect(lastIndex('FROM ')).toBe(runtime);
  expect(arg).toBeGreaterThan(runtime);
  expect(arg).toBeGreaterThan(lastIndex('COPY '));
});

test('release-versie: de runtime-stage zet BUILD_SHA als ENV uit de build-arg, vóór het proces start', () => {
  const env = lines.findIndex((line) => /^ENV BUILD_SHA=\$\{BUILD_SHA\}$/.test(line));

  expect(env).toBeGreaterThan(indexOf('ARG BUILD_SHA'));
  expect(indexOf('ARG BUILD_SHA')).toBeGreaterThan(0);
  expect(env).toBeLessThan(lastIndex('CMD '));
});
