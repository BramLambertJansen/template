import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// De job `secrets` leest op een PR alleen de commits van die PR (`origin/main..HEAD`) en op main de hele
// geschiedenis. Alle refs scannen liet één valse melding op één branch elke open PR rood maken (#97, #99); de scan op
// main houdt de volledige dekking (framework §6).
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = workflow.slice(workflow.indexOf('\n  secrets:'), workflow.indexOf('\n  image:'));

test('op een PR alleen de commits van die PR', () => {
  expect(job).toContain('origin/main..HEAD');
  expect(job).toContain('pull_request');
});

test('op main de hele geschiedenis, altijd met de eigen config en zonder inline allows', () => {
  expect(job).toContain('-c scripts/kit/betterleaks.toml');
  expect(job).toContain('--ignore-gitleaks-allow');
  expect(job).toMatch(/fetch-depth: 0/);
});
