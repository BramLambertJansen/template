import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { COMPONENT_TOKENS } from '../../src/web/features/design-system/component-tokens.ts';
import { declaredTokens } from './token-resolve.ts';

// app-thema/AC-7: elk componenttoken uit components.css (behalve --layer-*, die staan bij Lagen in de sectie Tokens) staat
// in de sectie "Componenttokens" op /design-system met component en standaard, en `feiten.mjs tokens --json` geeft het
// `laag`, `component` en `standaard` (de toets van AC-7 in de spec).
const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const COMPONENT_NAMES = ['button', 'control', 'card', 'dialog', 'table', 'badge', 'tabs', 'notice', 'toast', 'shell'];
const GROUP_NAMES = ['focus-ring', 'layer', 'qr'];
const componentOf = (token: string) =>
  [...COMPONENT_NAMES, ...GROUP_NAMES]
    .filter((name) => token.startsWith(`--${name}-`))
    .sort((a, b) => b.length - a.length)[0] ?? '(onbekend)';

const byToken = (a: { token: string }, b: { token: string }) => a.token.localeCompare(b.token);

const DECLARATIONS = [...declaredTokens(read('src/core/web/styles/components.css'), 'licht')]
  .filter(([token]) => !token.startsWith('--layer-'))
  .map(([token, standaard]) => ({ token, component: componentOf(token), standaard }))
  .toSorted(byToken);

test('app-thema/AC-7: elk componenttoken staat in de sectie Componenttokens met component en standaard', () => {
  expect(DECLARATIONS.map(({ token }) => token)).toEqual(
    expect.arrayContaining(['--button-radius', '--control-h', '--focus-ring-width']),
  );
  const listed = COMPONENT_TOKENS.map(({ token, component, standaard }) => ({ token, component, standaard }));
  expect(listed.toSorted(byToken)).toStrictEqual(DECLARATIONS);
  expect(read('src/web/features/design-system/vak-panels.tsx')).toContain('<ComponentTokensExamples />');
});

function feitenTokenItems(): Record<string, unknown>[] {
  const result = spawnSync(process.execPath, ['scripts/kit/feiten.mjs', 'tokens', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const json: unknown = JSON.parse(result.stdout);
  const groups: unknown = typeof json === 'object' && json !== null ? Reflect.get(json, 'tokens') : undefined;
  if (typeof groups !== 'object' || groups === null) return [];
  return Object.values(groups)
    .flatMap((items: unknown): unknown[] => (Array.isArray(items) ? items.map((item: unknown) => item) : []))
    .filter((item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null);
}

test('app-thema/AC-7: feiten.mjs tokens --json geeft elk componenttoken laag, component en standaard', () => {
  const items = feitenTokenItems();
  const actual = DECLARATIONS.map(({ token }) => {
    const item = items.find((candidate) => candidate['token'] === token);
    return { token, laag: item?.['laag'], component: item?.['component'], standaard: item?.['standaard'] };
  });
  expect(actual).toStrictEqual(DECLARATIONS.map((declaration) => ({ ...declaration, laag: 'component' })));
});
