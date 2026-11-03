import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// check-docs regel 12 (leerpunt #393): onder "Hoe (geen norm)" in `.claude/rules/*.md` staat geen normwoord. Een norm
// hoort bij een R-id in het regelboek (R-DOC-03); onder een kop die zichzelf niet-bindend noemt, ziet geen check hem.

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-hoe-'));
  for (const [file, content] of Object.entries({ 'package.json': '{}', ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function hoeNorm(rules: string, file = '.claude/rules/api.md'): Promise<string[]> {
  const violations = await docsViolations(repo({ [file]: rules }));
  return violations.filter(({ key }) => key.includes(':hoe-norm:')).map(({ key }) => key);
}

const regel = (hoe: string, na = '## Besloten, nog niet gebouwd\n\n- Moet nog: x.\n') =>
  `# Regels\n\n- Altijd \`x\`; nooit \`y\`; alleen via \`z\`.\n\nHoe (geen norm):\n\n${hoe}\n\n${na}`;

describe('positieve controle: elk normwoord onder "Hoe (geen norm)" valt op', () => {
  // De tabel bewijst dat de herkenning breed genoeg is (les uit #402): elke vervoeging en hoofdletter, Nederlands en Engels.
  test.each([
    ['nooit', '- Roep `x` nooit aan.'],
    ['nooit', '- Nooit `x` aanroepen.'],
    ['alleen', '- Alleen via `src/api/app.ts`.'],
    ['moet', '- De handler moet dun zijn.'],
    ['moeten', '- Handlers moeten dun zijn.'],
    ['verboden', '- `cors()` is verboden.'],
    ['verplicht', '- Een racetest is verplicht.'],
    ['verplichte', '- De verplichte racetest.'],
    ['must', '- Handlers must be thin.'],
    ['never', '- Never call `x`.'],
    ['only', '- Only via `src/api/app.ts`.'],
    ['forbidden', '- `cors()` is forbidden.'],
  ])('%s in "%s"', async (woord, zin) => {
    expect(await hoeNorm(regel(zin))).toStrictEqual([`docs:.claude/rules/api.md:hoe-norm:${woord}`]);
  });

  test('in elk bestand onder .claude/rules/, ook bij een tweede "Hoe"-sectie', async () => {
    const tekst = `${regel('- Rate limit standaard.')}\nHoe (geen norm):\n\n- Nooit zonder test.\n`;

    expect(await hoeNorm(tekst, '.claude/rules/web.md')).toStrictEqual(['docs:.claude/rules/web.md:hoe-norm:nooit']);
  });

  test('de melding noemt bestand, regel en woord, en wijst naar een R-id', async () => {
    const violations = await docsViolations(repo({ '.claude/rules/api.md': regel('- Racetest.\n- Moet dun.') }));
    const melding = violations.find(({ key }) => key.includes(':hoe-norm:'))?.message ?? '';

    expect(melding).toMatch(/^\.claude\/rules\/api\.md:8: "Moet"/);
    expect(melding).toContain('R-id');
  });
});

describe('toegestaan: buiten de sectie of geen heel woord', () => {
  test.each([
    ['een normwoord in de regels boven "Hoe"', regel('- Rate limit standaard GET `lezen`.')],
    ['een normwoord na de volgende ##-kop', regel('- Racetest: precies één slaagt.')],
    ['een deel van een woord', regel('- Een alleenstaande handler; moeten-lijst; nooitgedacht.')],
    ['een normwoord in een codespan', regel('- Draai `pnpm test --only x` of `git log --never`.')],
    ['een sectie zonder "Hoe (geen norm)"', '# Regels\n\n- Nooit `x`.\n\n## Besloten\n\n- Alleen y.\n'],
  ])('%s', async (_naam, tekst) => {
    expect(await hoeNorm(tekst)).toStrictEqual([]);
  });

  test('buiten .claude/rules/ telt de kop niet', async () => {
    expect(await hoeNorm(regel('- Nooit `x`.'), 'docs/notities.md')).toStrictEqual([]);
  });
});

test('de echte .claude/rules/* hebben geen normwoord onder "Hoe (geen norm)"', async () => {
  const violations = await docsViolations(path.resolve(import.meta.dirname, '../..'));

  expect(violations.filter(({ key }) => key.includes(':hoe-norm:'))).toStrictEqual([]);
});
