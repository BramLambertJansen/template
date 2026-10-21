import { existsSync, readFileSync, utimesSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { lintEnvironment, lintInputKey } from '../../scripts/kit/lint-inputs.mjs';
import { runLocalGate } from '../../scripts/kit/local-gate.mjs';
import { gates } from '../../scripts/kit/gates.mjs';
import { cacheRecord, fixture, git, write } from './local-gate-fixture.ts';

describe('lintinvoer zonder commitafhankelijkheid', () => {
  test('dezelfde inhoud blijft herbruikbaar na stagen en committen', () => {
    const input = fixture();
    write(input.root, 'src/input.ts', 'export const value = 2;\n');
    const key = lintInputKey(input);
    expect(key).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    git(input.root, 'add', '.');
    expect(lintInputKey(input)).toBe(key);
    git(input.root, 'commit', '-qm', 'change');
    expect(lintInputKey(input)).toBe(key);
  });

  test('een elders gewijzigd type maakt de cache ongeldig, ook bij gelijke mtime', () => {
    const input = fixture();
    write(input.root, 'src/types.ts', 'export type Value = string;\n');
    const file = path.join(input.root, 'src/types.ts');
    const before = statSync(file);
    const key = lintInputKey(input);
    write(input.root, 'src/types.ts', 'export type Value = number;\n');
    utimesSync(file, before.atime, before.mtime);
    expect(lintInputKey(input)).not.toBe(key);
  });

  test('de daadwerkelijke dependency-inhoud en omgeving horen bij de sleutel', () => {
    const input = fixture();
    const key = lintInputKey(input);
    write(input.root, 'node_modules/eslint/bin/eslint.js', '// changed without version bump\n');
    expect(lintInputKey(input)).not.toBe(key);
    expect(lintInputKey({ ...input, env: { ...input.env, LANG: 'nl_NL' } })).not.toBe(lintInputKey(input));
  });

  test('gewijzigde runtime en een nieuw, nog ongetrackt bestand maken hergebruik ongeldig', () => {
    const input = fixture();
    const key = lintInputKey(input);
    writeFileSync(input.node, 'other runtime\n');
    const otherRuntime = lintInputKey(input);
    expect(otherRuntime).not.toBe(key);
    write(input.root, 'src/new.ts', 'export const added = true;\n');
    expect(lintInputKey(input)).not.toBe(otherRuntime);
  });

  test.each(['eslint.config.js', 'tsconfig.node.json'])('onbekende configuratie %s geeft terugval', (file) => {
    const input = fixture();
    expect(lintInputKey(input)).not.toBeNull();
    write(input.root, file, '{}\n');
    expect(lintInputKey(input)).toBeNull();
  });

  test('een bron buiten de gecontroleerde boom geeft terugval', () => {
    const input = fixture();
    write(input.root, 'src/input.ts', "export { value } from '../../outside.ts';\n");
    expect(lintInputKey(input)).toBeNull();
  });

  test('een relatieve type-reference buiten de boom geeft terugval', () => {
    const input = fixture();
    write(input.root, 'src/input.ts', '/// <reference types="../../external" />\nexport {};\n');
    expect(lintInputKey(input)).toBeNull();
  });

  test.each(['ts', 'tsx', 'mts', 'cts'])('ook dependency-broncode .%s blijft binnen de boom', (extension) => {
    const input = fixture();
    write(input.root, 'node_modules/pkg/package.json', JSON.stringify({ types: `index.${extension}` }));
    write(input.root, `node_modules/pkg/index.${extension}`, "export { value } from '../../../external';\n");
    expect(lintInputKey(input)).toBeNull();
  });

  test.each(['../.git/hidden.ts', '../.env.local'])(
    'een verwijzing naar uitgesloten invoer %s geeft terugval',
    (file) => {
      const input = fixture();
      write(input.root, 'src/input.ts', `import '${file}';\n`);
      expect(lintInputKey(input)).toBeNull();
    },
  );

  test('ook een dependency-declaratie of package-typings buiten de boom geven terugval', () => {
    const input = fixture();
    write(input.root, 'node_modules/pkg/package.json', '{"types":"../../../../outside.d.ts"}');
    expect(lintInputKey(input)).toBeNull();
    write(input.root, 'node_modules/pkg/package.json', '{"types":"index.d.ts"}');
    write(input.root, 'node_modules/pkg/index.d.ts', '/// <reference path="../../../../outside.d.ts" />\n');
    expect(lintInputKey(input)).toBeNull();
  });

  test('een externe symlink en een runtimeoverride geven terugval', () => {
    const input = fixture();
    expect(lintInputKey({ ...input, env: { ...input.env, NODE_OPTIONS: '--conditions=custom' } })).toBeNull();
    symlinkSync('/tmp', path.join(input.root, 'src/external'));
    expect(lintInputKey(input)).toBeNull();
  });

  test('hookvariabelen verdwijnen ook uit de werkelijke lintomgeving', () => {
    expect(lintEnvironment({ LANG: 'nl', GIT_DIR: '/other', RAILS_ANKER: 'x', SHLVL: '4', _: 'node' })).toStrictEqual({
      LANG: 'nl',
      NO_COLOR: '1',
    });
  });

  test('de werkelijke pre-push-omgeving normaliseert naar dezelfde lintinvoer', () => {
    const input = fixture();
    const hookEnv = {
      ...input.env,
      GIT_DIR: '.git',
      NODE_PATH: path.join(input.root, 'node_modules/.pnpm/node_modules'),
      NO_COLOR: 'true',
      PWD: '/shell-parent',
      'PROGRAMFILES(X86)': 'unused-shell-value',
    };
    expect(lintInputKey({ ...input, env: hookEnv })).toBe(lintInputKey(input));
    expect(lintInputKey({ ...input, env: { ...hookEnv, NODE_PATH: '/outside/packages' } })).toBeNull();
  });

  test('een afwijkende lintopdracht gebruikt de bestaande opdracht', () => {
    const input = fixture();
    write(input.root, 'package.json', '{"scripts":{"lint":"eslint src"}}');
    expect(lintInputKey(input)).toBeNull();
  });
});

describe('alle gates blijven bestaan; alleen lint gebruikt de eigen ESLint-cache', () => {
  test('de volledige volgorde blijft gelijk en dezelfde inhoud na commit krijgt lintcache mee', () => {
    const input = fixture();
    const calls: string[] = [];
    const reused: boolean[] = [];
    const run = ({ command, args }: { command: string; args: readonly string[] }) => {
      calls.push(command === 'pnpm' ? (args[0] ?? '') : 'lint');
      const cache = args[args.indexOf('--cache-location') + 1];
      if (command !== 'pnpm' && cache !== undefined) {
        reused.push(existsSync(cache));
        write(path.dirname(cache), path.basename(cache), '["ESLint-cache"]');
      }
      return 0;
    };
    write(input.root, 'src/input.ts', 'export const value = 3;\n');
    expect(runLocalGate({ ...input, run })).toBe(0);
    git(input.root, 'add', '.');
    git(input.root, 'commit', '-qm', 'change');
    expect(runLocalGate({ ...input, run })).toBe(0);
    expect(calls).toStrictEqual([...gates, ...gates].filter((gate) => gate.snel).map((gate) => gate.script));
    expect(reused).toStrictEqual([false, true]);
  });

  test('CI voert de bestaande lintopdracht uit en gebruikt nooit lokale cache', () => {
    const input = fixture();
    const calls: string[] = [];
    expect(
      runLocalGate({
        ...input,
        env: { ...input.env, CI: 'true' },
        run: ({ command, args }) => {
          calls.push(`${command} ${args.join(' ')}`);
          return 0;
        },
      }),
    ).toBe(0);
    expect(calls).toContain('pnpm lint');
    expect(calls.every((call) => !call.includes('--cache'))).toBe(true);
  });

  test('een rode lint wordt niet gepubliceerd en stopt de gate', () => {
    const input = fixture();
    const prior: boolean[] = [];
    const run = ({ command, args }: { command: string; args: readonly string[] }) => {
      if (command === 'pnpm') return 0;
      const cache = args[args.indexOf('--cache-location') + 1];
      if (cache !== undefined) {
        prior.push(existsSync(cache));
        write(path.dirname(cache), path.basename(cache), '["failed"]');
      }
      return 1;
    };
    expect(runLocalGate({ ...input, run })).toBe(1);
    expect(runLocalGate({ ...input, run })).toBe(1);
    expect(prior).toStrictEqual([false, false]);
  });

  test('wijziging tijdens de lint geeft een ongecachete hercontrole', () => {
    const input = fixture();
    const calls: string[] = [];
    expect(
      runLocalGate({
        ...input,
        run: ({ command, args }) => {
          calls.push(command === 'pnpm' ? (args[0] ?? '') : 'cached lint');
          if (command !== 'pnpm') write(input.root, 'src/input.ts', 'export const changed = true;\n');
          return command === 'pnpm' && args[0] === 'lint' ? 1 : 0;
        },
      }),
    ).toBe(1);
    expect(calls).toStrictEqual(['format:check', 'cached lint', 'lint']);
  });

  test('een beschadigde cache wordt niet aan ESLint doorgegeven; secrets worden niet opgeslagen', () => {
    const input = fixture();
    const env = { ...input.env, PRIVATE_TEST_VALUE: 'voorbeeld-geheim-alleen-in-geheugen' };
    const reused: boolean[] = [];
    const run = ({ command, args }: { command: string; args: readonly string[] }) => {
      if (command === 'pnpm') return 0;
      const cache = args[args.indexOf('--cache-location') + 1];
      if (cache !== undefined) {
        reused.push(existsSync(cache));
        writeFileSync(cache, '["ESLint-cache"]');
      }
      return 0;
    };
    expect(runLocalGate({ ...input, env, run })).toBe(0);
    const record = cacheRecord(input.root);
    expect(readFileSync(record, 'utf8')).not.toContain(env.PRIVATE_TEST_VALUE);
    writeFileSync(record, '{afgebroken publicatie');
    expect(runLocalGate({ ...input, env, run })).toBe(0);
    expect(reused).toStrictEqual([false, false]);
  });

  test('een onbeschrijfbare cachemap geeft gewone lint, geen groen zonder controle', () => {
    const input = fixture();
    const calls: string[] = [];
    expect(
      runLocalGate({
        ...input,
        env: { ...input.env, TMPDIR: input.node },
        run: ({ command, args }) => {
          calls.push(`${command} ${args.join(' ')}`);
          return args[0] === 'lint' ? 1 : 0;
        },
      }),
    ).toBe(1);
    expect(calls).toStrictEqual(['pnpm format:check', 'pnpm lint']);
  });

  test('een oude run kan na een tussengekomen nieuwe run geen oude invoer publiceren', () => {
    const input = fixture();
    const before = lintInputKey(input);
    let interleaved = false;
    const run = ({ command, args }: { command: string; args: readonly string[] }): number => {
      if (command === 'pnpm') return 0;
      const cache = args[args.indexOf('--cache-location') + 1];
      if (cache !== undefined) writeFileSync(cache, '["ESLint-cache"]');
      if (!interleaved) {
        interleaved = true;
        write(input.root, 'src/input.ts', 'export const value = 9;\n');
        expect(runLocalGate({ ...input, run })).toBe(0);
      }
      return 0;
    };
    expect(runLocalGate({ ...input, run })).toBe(0);
    const after = lintInputKey(input);
    expect(after).not.toBe(before);
    const record = readFileSync(cacheRecord(input.root), 'utf8');
    expect(record).toContain(after);
    expect(record).not.toContain(before);
  });
});
