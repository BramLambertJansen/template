import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec agents-leveren (punt 1c): geen geneste subagents of MCP voor de rollen, en een vast budget met skelet eerst voor de
// reviewer en de architect (leerpunten #792, #676). Alleen de hoofdsessie start subagents.
function frontmatter(tekst: string): Record<string, string> {
  const blok = /^---\n([\s\S]*?)\n---\n/.exec(tekst)?.[1] ?? '';
  return Object.fromEntries(
    blok
      .split('\n')
      .map((regel) => /^([\w-]+):\s*(.*)$/.exec(regel))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', (match[2] ?? '').replace(/^"(.*)"$/, '$1')]),
  );
}

const lijst = (waarde: string | undefined): string[] =>
  (waarde ?? '')
    .split(',')
    .map((deel) => deel.trim())
    .filter((deel) => deel !== '');

/** Waarom deze rol nog een geneste subagent of MCP kan starten; leeg is goed. */
function gereedschapFouten(rol: string, tekst: string): string[] {
  const meta = frontmatter(tekst);
  if (meta['tools'] !== undefined) {
    const verboden = lijst(meta['tools']).filter(
      (tool) => tool === 'Agent' || tool === 'Task' || tool.startsWith('mcp__'),
    );
    return verboden.map((tool) => `${rol}: tools bevat ${tool}`);
  }
  const uit = lijst(meta['disallowedTools']);
  return ['Agent', 'mcp__*']
    .filter((tool) => !uit.includes(tool))
    .map((tool) => `${rol}: disallowedTools mist ${tool}`);
}

/** De tekst vóór de eerste genummerde stap. */
function voorStap1(tekst: string): string {
  const lichaam = tekst.replace(/^---\n[\s\S]*?\n---\n/, '');
  const index = lichaam.search(/^1\. /m);
  return index === -1 ? lichaam : lichaam.slice(0, index);
}

const rollen = readdirSync('.claude/agents')
  .filter((bestand) => bestand.endsWith('.md'))
  .map((bestand) => bestand.replace(/\.md$/, ''));
const lees = (rol: string): string => readFileSync(`.claude/agents/${rol}.md`, 'utf8');

describe('agents-leveren/AC-11 geen geneste Agent-tool en geen MCP voor de rollen', () => {
  test.each(rollen)('agents-leveren/AC-11 %s', (rol) => {
    expect(gereedschapFouten(rol, lees(rol))).toStrictEqual([]);
  });

  test('agents-leveren/AC-11 de toets is rood op een rol zonder lijst en op tools met Agent of mcp__', () => {
    expect(gereedschapFouten('x', '---\nname: x\n---\n')).toStrictEqual([
      'x: disallowedTools mist Agent',
      'x: disallowedTools mist mcp__*',
    ]);
    expect(gereedschapFouten('x', '---\nname: x\ndisallowedTools: mcp__*\n---\n')).toStrictEqual([
      'x: disallowedTools mist Agent',
    ]);
    expect(gereedschapFouten('x', '---\nname: x\ntools: Read, Agent, mcp__x\n---\n')).toStrictEqual([
      'x: tools bevat Agent',
      'x: tools bevat mcp__x',
    ]);
  });
});

describe('agents-leveren/AC-12 en AC-13 budget en skelet eerst', () => {
  test('agents-leveren/AC-12 de reviewer rapporteert na hooguit 25 toolcalls, met het skelet eerst', () => {
    const reviewer = lees('reviewer');
    expect(voorStap1(reviewer)).toContain(
      'Budget: rapporteer na hooguit 25 toolcalls. Zet eerst het skelet van je rapport neer (de koppen, met ## Bevindingen) en vul het daarna in. Is het budget op, lever dan wat je hebt en noem wat je niet hebt getoetst.',
    );
    expect(reviewer).toContain('## Bevindingen');
  });

  test('agents-leveren/AC-13 de architect schrijft na hooguit 15 toolcalls, eerst als skelet', () => {
    expect(voorStap1(lees('architect'))).toContain(
      'Budget: schrijf het spec- of ADR-bestand na hooguit 15 toolcalls, eerst als skelet (frontmatter en de koppen uit het sjabloon), en vul het daarna in. Lees alleen wat de opdracht raakt.',
    );
  });
});
