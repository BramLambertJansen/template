import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Regelboek en instructies voor de agent-merge (ADR 0069, spec agent-merge-niet-kritiek AC-6): elke regel uit de AC staat
// in de tekst van het bestand dat hem moet dragen. Faalt op de tekst van vóór 0069 ("alleen de eigenaar merget").
const FRAMEWORK = readFileSync('docs/framework.md', 'utf8');
const ROADMAP = readFileSync('docs/roadmap.md', 'utf8');

/** De regel `- **<id>** …` uit het regelboek. */
function regel(id: string): string {
  const gevonden = FRAMEWORK.split('\n').find((r) => r.startsWith(`- **${id}** `));
  if (gevonden === undefined) throw new Error(`${id} ontbreekt in docs/framework.md`);
  return gevonden;
}

/** Het roadmap-item dat begint met `**<titel>`, tot het volgende item. */
function item(titel: string): string {
  const start = ROADMAP.indexOf(`**${titel}`);
  if (start === -1) throw new Error(`roadmap-item ${titel} ontbreekt`);
  const einde = ROADMAP.indexOf('\n- [', start);
  return ROADMAP.slice(start, einde === -1 ? undefined : einde);
}

// GEWIJZIGD (templateregime AC-13, ADR 0089 punt 5): vier tests die de formulering "oordeel agent-merge: ja" in R-REPO-01,
// R-WERK-12, AGENTS.md en CLAUDE.md vastpinden zijn verwijderd; de job agent-merge en dat oordeel bestaan niet meer.
describe('agent-merge-niet-kritiek/AC-6 regelboek', () => {
  test('R-REPO-05: mergen alleen via pnpm pr:merge', () => {
    expect(regel('R-REPO-05')).toMatch(/merge alleen via `pnpm pr:merge`/);
  });

  test('R-ROL-08: pnpm pr:merge van de hoofdsessie is de enige uitzondering op mergen', () => {
    expect(regel('R-ROL-08')).toMatch(/mergen \(behalve `pnpm pr:merge <nr>` van de hoofdsessie[^)]*0069\)/);
  });

  test('R-WERK-23: alleen de hoofdsessie in Claude Code merget, een andere runtime nooit', () => {
    expect(regel('R-WERK-23')).toMatch(/alleen de hoofdsessie in Claude Code merget zelf, een andere runtime nooit \(0069\)/);
  });

  // GEWIJZIGD (templateregime AC-12, ADR 0089 punt 5): de inhoudstoets bestaat niet meer; de regel noemt nu de review van
  // een code-eigenaar als grens. Sleutelwoorden in plaats van de oude zin.
  test('R-ROL-10: pnpm pr:merge en rolhek zijn een vangnet, de grens is de review van een code-eigenaar', () => {
    const tekst = regel('R-ROL-10');
    expect(tekst).toContain('CODEOWNERS');
    expect(tekst).toMatch(/`pnpm pr:merge` en het rolhek zijn een vangnet, geen grens/);
  });

  test('R-DOC-09 verwijst naar 0069, niet naar "na de GitHub App"', () => {
    const tekst = regel('R-DOC-09');
    expect(tekst).toMatch(/0069/);
    expect(tekst).not.toMatch(/na de GitHub App/);
  });
});

describe('agent-merge-niet-kritiek/AC-6 instructies', () => {
  test('skill opleveren: mergen via pnpm pr:merge, daarna PR en SHA melden en CI op main volgen', () => {
    const skill = readFileSync('.claude/skills/opleveren/SKILL.md', 'utf8');
    expect(skill).toMatch(/`pnpm pr:merge <nr>`/);
    expect(skill).toMatch(/Meld PR en SHA aan de eigenaar en volg de CI op `main`/);
    expect(skill).toMatch(/Nooit `gh pr merge`/);
  });
});

describe('agent-merge-niet-kritiek/AC-6 specs en roadmap', () => {
  test('spec agent-merge staat op vervallen', () => {
    // GEWIJZIGD (specarchief-en-bouwvorm, ADR 0080, OV-1): de vervallen spec verhuist naar docs/specs/archief/; lees het pad dat bestaat.
    const pad = existsSync('docs/specs/agent-merge.md') ? 'docs/specs/agent-merge.md' : 'docs/specs/archief/agent-merge.md';
    expect(readFileSync(pad, 'utf8')).toMatch(/^status: vervallen\b/m);
  });

  test.each(['ADR 0029 stap 7', 'ADR 0030 PR 2', 'Volledig pad naar `gh` in het rolhek'])(
    'roadmap-item %s verwijst naar de spec agent-merge-niet-kritiek',
    (titel) => {
      expect(item(titel)).toMatch(/docs\/specs\/agent-merge-niet-kritiek\.md/);
    },
  );
});
