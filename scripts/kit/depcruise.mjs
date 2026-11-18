// Draait dependency-cruiser met .dependency-cruiser.mjs en geeft de overtredingen als stabiele sleutels terug.
// Gebruikt door de ratchet (scripts/kit/ratchet.mjs) en de fixtures (test/rails/depcruise.test.ts).
import { cruise } from 'dependency-cruiser';
import config from '../../.dependency-cruiser.mjs';

/** @param {string} baseDir */
export async function dependencyViolations(baseDir) {
  const { output } = await cruise(['src'], {
    ...config.options,
    baseDir,
    ruleSet: { forbidden: config.forbidden },
    validate: true,
  });
  if (typeof output === 'string') throw new Error('dependency-cruiser gaf geen resultaatobject');
  const comments = new Map(config.forbidden.map((rule) => [rule.name, rule.comment]));
  return output.summary.violations.map((violation) => ({
    key: `${violation.rule.name} ${violation.from} → ${violation.to}`,
    rule: violation.rule.name,
    from: violation.from,
    message: comments.get(violation.rule.name) ?? violation.rule.name,
  }));
}

// Los gedraaid zou dit bestand niets melden en met 0 eindigen, terwijl alleen de ratchet met .kit/baseline.json vergelijkt
// (leerpunt #752). Daarom geen stil groen: verwijs naar de gate, zoals check-docs.mjs.
if (import.meta.main) {
  console.error(
    '✗ depcruise draait alleen via de ratchet (vergelijking met .kit/baseline.json): gebruik `pnpm ratchet`.',
  );
  process.exitCode = 1;
}
