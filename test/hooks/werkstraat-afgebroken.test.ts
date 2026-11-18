import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';

// Vervolg op leerpunt #720 (zie werkstraat-startfout.test.ts): "kon niet starten" hoort alleen bij een proces dat niet
// startte (ENOENT, EACCES). Een timeout (ETIMEDOUT) of een overschreden maxBuffer (ENOBUFS) betekent dat het proces wel
// liep: dan meldt `run` "afgebroken na <ms> ms: <commando>" respectievelijk "uitvoer te groot: <commando>", mét de
// gedeeltelijke uitvoer die er was. De code blijft in alle drie de gevallen 1 (rood).
//
// Contract voor de developer: de `run` uit makeDeps (rails/hooks/werkstraat.mjs) verhuist ongewijzigd van gedrag naar
// rails/hooks/lib/run.mjs als `createRun(root)`, dat `(command, args, options)` teruggeeft (hooguit drie parameters,
// R-CODE-02), met options `{ timeout?, env? }` en als resultaat `{ code, output }`; werkstraat.mjs gebruikt hem (het entry-script is niet importeerbaar: het leest stdin en
// roept process.exit aan). Via het entry-script is een timeout niet te zien: de uitvoer van de 5000 ms-aanroepen
// (git fetch, gh, claude --version) komt nooit in een hookmelding.
const RUN_MODULE = path.join(process.cwd(), 'rails/hooks/lib/run.mjs');

interface RunResult {
  code: number;
  output: string;
}

function isRunResult(value: unknown): value is RunResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'number' &&
    'output' in value &&
    typeof value.output === 'string'
  );
}

/** Laadt `createRun` en maakt de `run` voor `root`; ontbreekt hij, dan faalt de test op een assertie met de reden. */
async function laadRunCommand(): Promise<(command: string, args: readonly string[], timeout?: number) => RunResult> {
  expect(existsSync(RUN_MODULE), 'rails/hooks/lib/run.mjs bestaat nog niet (export createRun)').toBe(true);
  const module: unknown = await import(pathToFileURL(RUN_MODULE).href);
  const createRun =
    typeof module === 'object' && module !== null && 'createRun' in module ? module.createRun : undefined;
  expect(typeof createRun, 'rails/hooks/lib/run.mjs exporteert createRun niet').toBe('function');
  if (typeof createRun !== 'function') throw new Error('createRun ontbreekt');
  const run: unknown = Reflect.apply(createRun, undefined, [root]);
  if (typeof run !== 'function') throw new Error('createRun geeft geen functie');
  return (command, args, timeout) => {
    const result: unknown = Reflect.apply(run, undefined, [command, args, timeout === undefined ? {} : { timeout }]);
    if (!isRunResult(result)) throw new Error('run geeft geen { code, output }');
    return result;
  };
}

const tmpDirs: string[] = [];
const root = tijdelijkeMap('werkstraat-afgebroken-root-');

function tijdelijkeMap(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

describe('werkstraat run: een proces dat wel startte maar is afgebroken', () => {
  test('timeout: meldt "afgebroken na <ms> ms: <commando>" en houdt de gedeeltelijke stdout en stderr', async () => {
    const run = await laadRunCommand();
    const script =
      'process.stdout.write("deel-stdout\\n"); process.stderr.write("deel-stderr\\n"); setTimeout(() => {}, 60000);';

    const result = run(process.execPath, ['-e', script], 1500);

    expect(result.code).toBe(1);
    expect(result.output).toContain(`afgebroken na 1500 ms: ${process.execPath}`);
    expect(result.output).toContain('deel-stdout');
    expect(result.output).toContain('deel-stderr');
    expect(result.output).not.toContain('kon niet starten');
  });

  test('timeout: noemt de timeout die is meegegeven, niet een vaste waarde', async () => {
    const run = await laadRunCommand();

    const result = run(process.execPath, ['-e', 'setTimeout(() => {}, 60000);'], 700);

    expect(result.code).toBe(1);
    expect(result.output).toContain('afgebroken na 700 ms');
    expect(result.output).not.toContain('afgebroken na 1500 ms');
  });

  test('maxBuffer (ENOBUFS): meldt "uitvoer te groot: <commando>" en houdt de uitvoer tot de grens', async () => {
    const run = await laadRunCommand();
    // Meer dan de 32 MiB maxBuffer van run; de kop staat voorin en overleeft dus in de gedeeltelijke uitvoer.
    const script = 'process.stdout.write("begin-uitvoer\\n"); process.stdout.write("x".repeat(40 * 1024 * 1024));';

    const result = run(process.execPath, ['-e', script]);

    expect(result.code).toBe(1);
    expect(result.output).toContain(`uitvoer te groot: ${process.execPath}`);
    expect(result.output).toContain('begin-uitvoer');
    expect(result.output).not.toContain('kon niet starten');
    expect(result.output).not.toContain('afgebroken na');
  });
});

describe('werkstraat run: een proces dat niet startte houdt "kon niet starten"', () => {
  test('ENOENT: een commando dat niet bestaat meldt "kon niet starten: <commando> (ENOENT)" met code 1', async () => {
    const run = await laadRunCommand();

    const result = run('werkstraat-bestaat-niet-xyz', ['--versie']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('kon niet starten: werkstraat-bestaat-niet-xyz (ENOENT)');
    expect(result.output).not.toContain('afgebroken na');
    expect(result.output).not.toContain('uitvoer te groot');
  });

  test('EACCES: een bestand zonder uitvoerrechten meldt "kon niet starten: <commando> (EACCES)" met code 1', async () => {
    const run = await laadRunCommand();
    const script = path.join(tijdelijkeMap('werkstraat-afgebroken-eacces-'), 'geen-rechten.sh');
    writeFileSync(script, '#!/bin/sh\nexit 0\n');
    chmodSync(script, 0o644);

    const result = run(script, []);

    expect(result.code).toBe(1);
    expect(result.output).toContain(`kon niet starten: ${script} (EACCES)`);
    expect(result.output).not.toContain('afgebroken na');
  });

  test('een gewoon rood proces houdt zijn eigen exitcode en uitvoer, zonder foutmelding van run', async () => {
    const run = await laadRunCommand();

    const result = run(
      process.execPath,
      ['-e', 'process.stdout.write("uit\\n"); process.stderr.write("err\\n"); process.exit(3);'],
      5000,
    );

    expect(result.code).toBe(3);
    expect(result.output).toBe('uit\nerr\n');
  });
});
