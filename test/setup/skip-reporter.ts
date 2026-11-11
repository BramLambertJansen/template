import path from 'node:path';
import type { Reporter, TestModule } from 'vitest/node';
import { isCi } from './vermogen.ts';

// Spec tests-naar-vermogen AC-5 en AC-6 (ADR 0088): telt na elke run de overgeslagen en todo-tests in de projecten unit en
// web. Lokaal één waarschuwing; in CI is elke overgeslagen test rood, met naam. Staat in vitest.config.ts naast de
// standaardreporter. Getest in test/rails/vermogen-reporter.test.ts.
const PROJECTEN = new Set(['unit', 'web']);

function overgeslagen(modules: readonly TestModule[]): string[] {
  const namen: string[] = [];
  for (const module of modules) {
    if (!PROJECTEN.has(module.project.name)) continue;
    const bestand = path.relative(module.project.config.root, module.moduleId);
    for (const test of module.children.allTests())
      if (test.result().state === 'skipped') namen.push(`${bestand} > ${test.fullName}`);
  }
  return namen;
}

function redenKooi(modules: readonly TestModule[]): string | null {
  for (const module of modules) {
    if (!PROJECTEN.has(module.project.name)) continue;
    const kooi: unknown = Reflect.get(module.project.getProvidedContext(), 'kooi');
    if (typeof kooi !== 'object' || kooi === null) continue;
    const melding: unknown = Reflect.get(kooi, 'melding');
    if (Reflect.get(kooi, 'soort') === 'start-niet' && typeof melding === 'string') return melding;
  }
  return null;
}

export default class SkipReporter implements Reporter {
  onTestRunEnd(modules: readonly TestModule[]): void {
    const namen = overgeslagen(modules);
    if (namen.length === 0) return;
    if (isCi()) {
      for (const naam of namen)
        process.stderr.write(`✗ overgeslagen in CI: ${naam}; in CI slaat geen test over (ADR 0088)\n`);
      process.exitCode = 1;
      return;
    }
    const reden = redenKooi(modules);
    const waarom = reden === null ? '' : `, want de kooi kan hier niet starten (${reden})`;
    process.stdout.write(
      `⚠ overgeslagen: ${String(namen.length)} tests${waarom}; ze draaien in CI, waar overslaan rood is (ADR 0088)\n`,
    );
  }
}
