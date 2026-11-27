import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// De vijf rollen en de skills (framework §8, ADR 0045): vaste frontmatter, zodat de werkstraat niet ongemerkt verschuift.
// Schrijfrecht per rol bepaalt het rolhek (.claude/gates.json), niet de tools-lijst; alleen de reviewer is hier beperkt.
function frontmatter(file: string): Record<string, string> {
  const text = readFileSync(file, 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

const ROLES = { architect: 'opus', developer: 'inherit', tester: 'sonnet', reviewer: 'opus', docs: 'sonnet' } as const;

describe('subagents', () => {
  test('precies de vijf rollen uit framework §8', () => {
    expect(
      readdirSync('.claude/agents')
        .filter((file) => file.endsWith('.md'))
        .sort(),
    ).toStrictEqual(
      Object.keys(ROLES)
        .map((role) => `${role}.md`)
        .sort(),
    );
  });

  test.each(Object.entries(ROLES))('%s: name, model %s, maxTurns en "eerst de feiten"', (role, model) => {
    const meta = frontmatter(`.claude/agents/${role}.md`);

    expect([meta['name'], meta['model'], Number(meta['maxTurns']) > 0]).toStrictEqual([role, model, true]);
    expect(readFileSync(`.claude/agents/${role}.md`, 'utf8')).toMatch(/Begin met de feiten/);
  });

  test('reviewer: alleen lezen (Read, Grep, Glob, Bash) en het rapport onder "## Bevindingen" (SubagentStop-hook)', () => {
    expect(frontmatter('.claude/agents/reviewer.md')['tools']).toBe('Read, Grep, Glob, Bash');
    expect(readFileSync('.claude/agents/reviewer.md', 'utf8')).toContain('## Bevindingen');
  });
});

// WS-06: MCP-tools zijn voor deze rollen uit het gereedschap gehaald (naast het rolhek, dat subagent-MCP weigert).
describe('subagents: geen MCP (WS-06)', () => {
  test.each(['tester', 'docs', 'architect'])('%s: disallowedTools bevat mcp__*', (role) => {
    const list = (frontmatter(`.claude/agents/${role}.md`)['disallowedTools'] ?? '')
      .split(',')
      .map((tool) => tool.trim());

    expect(list).toContain('mcp__*');
  });
});

describe('skills', () => {
  const skills = readdirSync('.claude/skills', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // GEWIJZIGD (spec nachtrun, ADR 0115, R-TEST-02): de skill `nachtrun` komt erbij.
  test('de skills uit de roadmap (zonder release: fase 3)', () => {
    expect(skills.sort()).toStrictEqual(
      [
        'migratie',
        'nachtrun',
        'nieuw-component',
        'nieuw-route',
        'nieuw-scherm',
        'nieuwe-koppeling',
        'ontwerp-overnemen',
        'opleveren',
        'security-review',
        'spec',
      ].sort(),
    );
  });

  test.each(skills)('%s: naam, beschrijving en de live feiten via !-injectie', (skill) => {
    const meta = frontmatter(`.claude/skills/${skill}/SKILL.md`);

    expect([meta['name'], (meta['description'] ?? '').length > 20]).toStrictEqual([skill, true]);
    expect(readFileSync(`.claude/skills/${skill}/SKILL.md`, 'utf8')).toContain('!`node scripts/kit/feiten.mjs');
  });
});

// Overnameplan 1a: Claude Code leest de frontmatter als YAML. Een plain scalar met `: ` of ` #` weigert strikte YAML, en een
// waarde die met een indicator begint, betekent iets anders. Zonder YAML-dependency: deze regels dekken de vorm die
// agents en skills gebruiken (één `sleutel: waarde` per regel).
const INDICATOR = /^[-?:,[\]{}#&*!|>%@`]/;

function yamlFouten(file: string, text: string): string[] {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  if (block === undefined) return [`${file}: geen frontmatter`];
  return block.split('\n').flatMap((line, index) => {
    const where = `${file}:${String(index + 2)}`;
    const match = /^([\w-]+):(?: (.*))?$/.exec(line);
    if (match === null) return [`${where}: geen "sleutel: waarde"`];
    const value = match[2] ?? '';
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return [];
    if (value.startsWith('"') || value.startsWith("'")) return [`${where}: quote niet gesloten`];
    if (value.includes(': ') || value.includes(' #') || value.endsWith(':'))
      return [`${where}: plain scalar met ': ' of ' #', quote de waarde`];
    return INDICATOR.test(value) ? [`${where}: begint met een YAML-indicator, quote de waarde`] : [];
  });
}

// GEWIJZIGD (spec agents-leveren, PR-3): alleen de testnamen kregen hun AC-id (AC-5, AC-6), voor de AC-dekking.
describe('frontmatter is strikte YAML (overnameplan 1a)', () => {
  const files = [
    ...readdirSync('.claude/agents')
      .filter((file) => file.endsWith('.md'))
      .map((file) => `.claude/agents/${file}`),
    ...readdirSync('.claude/skills', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `.claude/skills/${entry.name}/SKILL.md`),
  ];

  test.each(files)('agents-leveren/AC-6 %s', (file) => {
    expect(yamlFouten(file, readFileSync(file, 'utf8'))).toStrictEqual([]);
  });

  test('agents-leveren/AC-5 de check is rood op een niet-gequote description met ": "', () => {
    expect(yamlFouten('x.md', '---\nname: x\ndescription: Doet iets: en meer\n---\n')).toStrictEqual([
      "x.md:3: plain scalar met ': ' of ' #', quote de waarde",
    ]);
  });

  test('agents-leveren/AC-5 de check is groen op dezelfde description tussen dubbele quotes', () => {
    expect(yamlFouten('x.md', '---\nname: x\ndescription: "Doet iets: en meer"\n---\n')).toStrictEqual([]);
  });

  test('agents-leveren/AC-5 de check is rood op een ongesloten quote, een indicator en " #"', () => {
    expect(yamlFouten('x.md', '---\na: "open\nb: *alias\nc: tekst #commentaar\n---\n')).toStrictEqual([
      'x.md:2: quote niet gesloten',
      'x.md:3: begint met een YAML-indicator, quote de waarde',
      "x.md:4: plain scalar met ': ' of ' #', quote de waarde",
    ]);
  });
});
