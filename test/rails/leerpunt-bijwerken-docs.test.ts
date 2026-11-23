import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Spec leerlus-bewijs AC-14 en AC-15, ADR 0101: tekstcontroles op de skill `opleveren` (stap 8), docs/framework.md,
// AGENTS.md en docs/nieuwe-app.md. Alleen betekenisdragende fragmenten, geen hele zinnen.
const SKILL = readFileSync('.claude/skills/opleveren/SKILL.md', 'utf8');
const framework = readFileSync('docs/framework.md', 'utf8');
const agents = readFileSync('AGENTS.md', 'utf8');
const nieuweApp = readFileSync('docs/nieuwe-app.md', 'utf8');

/** Stap 8 (Leerpunt) van "Opruimen": van de regel `8. Leerpunt` tot de volgende kop of het einde. */
function stap8(): string {
  const start = SKILL.search(/^8\. Leerpunt/m);
  if (start < 0) return '';
  const rest = SKILL.slice(start);
  const volgende = rest.slice(1).search(/^## /m);
  return volgende < 0 ? rest : rest.slice(0, volgende + 1);
}
const stap = stap8();
const eerste = (tekst: string): number => stap.indexOf(tekst);

/** De regel van framework.md of AGENTS.md die een regel-id of zin bevat. */
const regelMet = (tekst: string, zin: string): string => tekst.split('\n').find((regel) => regel.includes(zin)) ?? '';

describe('leerlus-bewijs/AC-14 opleveren stap 8: afstemmen, bijwerken en sluiten', () => {
  test('leerlus-bewijs/AC-14: de leerpuntstap is te vinden', () => {
    expect(stap.length).toBeGreaterThan(200);
  });

  test.each(['gh issue list', '--label leerpunt', '--state open', '--search'])(
    'leerlus-bewijs/AC-14: noemt de zoektocht naar geraakte open leerpunten (%s)',
    (fragment) => {
      expect(stap).toContain(fragment);
    },
  );

  // De slotstap moet letterlijk direct na de slotregel staan (leerlus/AC-3), dus `gh issue create` komt in de tekst eerst;
  // de volgorde in de tijd staat er met woorden: de zoektocht gebeurt vóór het indienen.
  test('leerlus-bewijs/AC-14: de zoektocht staat vóór het indienen van een nieuw leerpunt', () => {
    const zoek = eerste('gh issue list');
    expect(zoek).toBeGreaterThanOrEqual(0);
    expect(stap.slice(Math.max(0, zoek - 300), zoek)).toMatch(/vóór het indienen/i);
  });

  test.each(['opgelost', 'deels', 'zelfde les opnieuw', 'Closes #', '## Leerpunt'])(
    'leerlus-bewijs/AC-14: noemt de uitkomst per geraakt leerpunt (%s)',
    (fragment) => {
      expect(stap).toContain(fragment);
    },
  );

  test('leerlus-bewijs/AC-14: de slotregel is "geen open leerpunt geraakt"', () => {
    expect(stap).toContain('geen open leerpunt geraakt');
  });

  test('leerlus-bewijs/AC-14: de doelcheck (gh issue view … --json labels) staat vóór elke schrijfactie', () => {
    expect(stap).toMatch(/gh issue view[^\n]*--json[^\n]*labels/);
    const view = eerste('gh issue view');
    for (const schrijf of ['gh issue comment', 'gh issue edit', 'gh issue close']) {
      expect(eerste(schrijf), `${schrijf} ontbreekt in stap 8`).toBeGreaterThanOrEqual(0);
      expect(view, `gh issue view staat niet vóór ${schrijf}`).toBeGreaterThanOrEqual(0);
      expect(view).toBeLessThan(eerste(schrijf));
    }
  });

  test.each(['gh issue comment --repo', 'gh issue edit --repo', 'gh issue close --repo'])(
    'leerlus-bewijs/AC-14: de gh-vorm uit AC-12 (%s)',
    (vorm) => {
      expect(stap).toContain(vorm);
    },
  );

  test('leerlus-bewijs/AC-14: de gh-vormen gebruiken --body-file, --title en --duplicate-of, niet -R', () => {
    expect(stap).toContain('--body-file');
    expect(stap).toContain('--title');
    expect(stap).toContain('--duplicate-of');
    expectAbsent(stap, /gh issue (comment|edit|close) -R/, {
      recognizes: ['gh issue comment -R o/r 5', 'gh issue edit -R o/r 5', 'gh issue close -R o/r 5'],
      allows: ['gh issue comment --repo o/r 5'],
    });
  });

  test('leerlus-bewijs/AC-14: bij een duplicaat eerst gh issue comment met "duplicaat van #", daarna gh issue close --duplicate-of', () => {
    const comment = eerste('duplicaat van #');
    expect(comment).toBeGreaterThanOrEqual(0);
    const sluit = stap.search(/gh issue close[^\n]*--duplicate-of|--duplicate-of[^\n]*gh issue close/);
    expect(sluit).toBeGreaterThanOrEqual(0);
    expect(comment).toBeLessThan(stap.indexOf('--duplicate-of'));
  });

  test('leerlus-bewijs/AC-14: in de cloud de MCP-issuetool voor dezelfde acties plus labels', () => {
    expect(stap).toMatch(/MCP[^\n]*(comment|bijwerk)/i);
    expect(stap).toMatch(/MCP[\s\S]{0,400}label/i);
  });

  test.each(['`leerpunt`', '`leerpunt-onvolledig`', '`leerpunt-zonder-bewijs`'])(
    'leerlus-bewijs/AC-14: de MCP-hoofdsessie zet nooit het label %s',
    (label) => {
      const na = stap.split(/nooit/i).slice(1);
      expect(na.some((deel) => deel.slice(0, 250).includes(label))).toBe(true);
    },
  );
});

describe('leerlus-bewijs/AC-15 framework, AGENTS.md en nieuwe-app verwijzen naar ADR 0101', () => {
  test.each(['R-WERK-13', 'R-ROL-07', 'R-ROL-12', 'R-SEC-09'])(
    'leerlus-bewijs/AC-15: framework %s noemt bijwerken en sluiten als duplicaat met ADR 0101',
    (id) => {
      const regel = regelMet(framework, `**${id}**`);
      expect(regel.length).toBeGreaterThan(0);
      expect(regel).toContain('0101');
      expect(regel).toMatch(/duplicaat/i);
      expect(regel).toMatch(/bijwerk/i);
    },
  );

  test('leerlus-bewijs/AC-15: AGENTS.md, de regel over externe diensten, noemt bijwerken en sluiten als duplicaat met ADR 0101', () => {
    const regel = regelMet(agents, 'Externe diensten via hun CLI');
    expect(regel.length).toBeGreaterThan(0);
    expect(regel).toContain('0101');
    expect(regel).toMatch(/duplicaat/i);
    expect(regel).toMatch(/bijwerk/i);
  });

  test('leerlus-bewijs/AC-15: nieuwe-app.md verwijst naar 0101', () => {
    expect(nieuweApp).toContain('0101');
  });

  test.each(['comment', 'edit', 'close'])(
    'leerlus-bewijs/AC-15: nieuwe-app.md noemt de allow-regel voor gh issue %s bij de fork',
    (actie) => {
      expect(nieuweApp).toContain(`Bash(gh issue ${actie} --repo <repo> *)`);
    },
  );

  test('leerlus-bewijs/AC-15: de drie allow-regels staan in dezelfde regel als de bestaande voor gh issue create', () => {
    const regel = regelMet(nieuweApp, 'Bash(gh issue create --repo <repo> --label leerpunt *)');
    expect(regel).toContain('Bash(gh issue comment --repo <repo> *)');
    expect(regel).toContain('Bash(gh issue edit --repo <repo> *)');
    expect(regel).toContain('Bash(gh issue close --repo <repo> *)');
  });
});
