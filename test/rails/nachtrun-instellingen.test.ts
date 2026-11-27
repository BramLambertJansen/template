import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec nachtrun AC-6 en AC-7 (ADR 0115 punt 5, 6, 7 en 8): instellingen, skill en regels voor een nachtrun.
const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const lees = (pad: string) => readFileSync(pad, 'utf8');
const plat = (tekst: string) => tekst.replace(/\s+/g, ' ');

function allow(): string[] {
  if (typeof settings !== 'object' || settings === null || !('permissions' in settings)) return [];
  const { permissions } = settings;
  if (typeof permissions !== 'object' || permissions === null || !('allow' in permissions)) return [];
  const lijst = permissions.allow;
  return Array.isArray(lijst) ? lijst.filter((regel): regel is string => typeof regel === 'string') : [];
}

describe('nachtrun/AC-6: instellingen', () => {
  // Review B1: de doorlaat is voorwaardelijk en hoort in het rolhek; een MCP-tool in permissions.allow geldt ook zonder hook.
  test('nachtrun/AC-6: geen MCP-tool in permissions.allow', () => {
    expect(allow().filter((regel) => regel.startsWith('mcp__'))).toStrictEqual([]);
  });

  test('nachtrun/AC-6: .tmp/ is genegeerd door git en eslint', () => {
    expect(lees('.gitignore').split('\n')).toContain('.tmp/');
    expect(lees('eslint.config.js')).toContain("'.tmp/',");
  });

  test('nachtrun/AC-6: CLAUDE.md noemt .tmp/ en niet langer $TMPDIR voor scripts', () => {
    const claude = plat(lees('CLAUDE.md'));
    expect(claude).toContain('in `.tmp/<bestand>` van je werkmap');
    expect(claude).not.toContain('zet je in `$TMPDIR`');
  });
});

describe('nachtrun/AC-7: skill en regels', () => {
  const skill = plat(lees('.claude/skills/nachtrun/SKILL.md'));

  test.each([
    'Vragenronde',
    '**OV-3 ⏳ voorlopig**',
    '**OV-4 ⏸ geparkeerd**',
    'feiten.mjs besluiten',
    'Ochtendrapport',
  ])('nachtrun/AC-7: de skill noemt %s', (term) => {
    expect(skill).toContain(term);
  });

  test('nachtrun/AC-7: R-WERK-20 en CLAUDE.md noemen de nachtrun', () => {
    const regel = lees('docs/framework.md')
      .split('\n')
      .find((line) => line.startsWith('- **R-WERK-20**'));
    expect(regel).toContain('skill `nachtrun`');
    expect(plat(lees('CLAUDE.md'))).toContain('In een nachtrun (skill `nachtrun`, ADR 0115) vraag je niets meer');
  });
});
