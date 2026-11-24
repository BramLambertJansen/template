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

  // Stap 8 draait na de merge; een opgelost leerpunt moet dus al in de PR staan (ADR 0101 punt 6, Herzien).
  test('leerlus-bewijs/AC-14: CI-lus stap 1 noemt de zoektocht vóór het openen van de PR met Closes en ## Leerpunt', () => {
    const start = SKILL.search(/^## CI-lus tot groen/m);
    const eind = SKILL.search(/^2\. Wacht met/m);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(eind).toBeGreaterThan(start);
    const stap1 = SKILL.slice(start, eind);
    expect(stap1).toMatch(/vóór het openen van de PR/i);
    expect(stap1).toContain('Closes #<nr>');
    expect(stap1).toContain('## Leerpunt');
  });

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
    // GEWIJZIGD (leerlus-bewijs/AC-21, ADR 0109): was `/duplicaat/i`; AGENTS.md zegt nu "sluiten" in plaats van "sluiten als
    // duplicaat" (de eigenaar, 2026-11-24). De verwijzing naar 0101 en "bijwerken" blijven.
    expect(regel).toContain('(aanmaken, bijwerken, sluiten)');
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

// Spec leerlus-bewijs AC-17 (skilltekst), AC-18 en AC-21, ADR 0109.
describe('leerlus-bewijs/AC-17 opleveren stap 8: de MCP-route in de cloud', () => {
  test('leerlus-bewijs/AC-17: noemt state_reason completed (na de comment) of duplicate, en nooit not_planned of heropenen', () => {
    expect(stap).toContain('state_reason');
    expect(stap).toMatch(/state_reason[^\n]*`completed`|`completed`[^\n]*state_reason/);
    expect(stap).toMatch(/state_reason[^\n]*`duplicate`|`duplicate`[^\n]*state_reason/);
    const na = stap.split(/nooit/i).slice(1);
    expect(na.some((deel) => deel.slice(0, 200).includes('not_planned'))).toBe(true);
    expect(na.some((deel) => /heropen|`open`/i.test(deel.slice(0, 250)))).toBe(true);
  });

  test('leerlus-bewijs/AC-17: elke MCP-schrijfactie is een toestemmingsprompt; zonder meekijker staat de route stil', () => {
    expect(stap).toMatch(/toestemmingsprompt/i);
    expect(stap).toMatch(/stil/i);
  });
});

describe('leerlus-bewijs/AC-18 opleveren stap 8: opgelost op main, met verwijzing', () => {
  test('leerlus-bewijs/AC-18: noemt de uitkomst "opgelost op main" en ADR 0109', () => {
    expect(stap).toContain('opgelost op main');
    expect(stap).toContain('0109');
  });

  test("leerlus-bewijs/AC-18: de drie commando's staan in volgorde: gh issue view, gh issue comment met `opgelost: `, gh issue close --reason completed", () => {
    const tekst = eerste('opgelost: ');
    expect(tekst, 'de comment `opgelost: ` ontbreekt in stap 8').toBeGreaterThanOrEqual(0);
    const sluit = stap.search(/gh issue close --repo <repo> <nr> --reason completed/);
    expect(sluit, 'gh issue close --repo <repo> <nr> --reason completed ontbreekt').toBeGreaterThanOrEqual(0);
    const view = stap.search(/gh issue view <nr> --repo <repo> --json labels,state,url/);
    expect(view).toBeGreaterThanOrEqual(0);
    const comment = stap.slice(0, tekst).lastIndexOf('gh issue comment --repo <repo> <nr> --body-file');
    expect(
      comment,
      'gh issue comment --repo <repo> <nr> --body-file staat niet vóór `opgelost: `',
    ).toBeGreaterThanOrEqual(0);
    expect(view).toBeLessThan(comment);
    expect(comment).toBeLessThan(sluit);
    expect(tekst).toBeLessThan(sluit);
  });

  test.each(['#<nr>', 'ADR <nnnn>', 'commit-SHA', 'komma'])(
    'leerlus-bewijs/AC-18: noemt de verwijzingsvormen (%s)',
    (fragment) => {
      expect(stap).toContain(fragment);
    },
  );

  test('leerlus-bewijs/AC-18: elke verwijzing moet geldig zijn; anders geen sluiting maar deels', () => {
    expect(stap).toMatch(/elke verwijzing[^\n]*geldig|geldig[^\n]*elke verwijzing/i);
    expect(stap).toMatch(/ongeldig[\s\S]{0,200}deels|deels[\s\S]{0,200}ongeldig/i);
  });

  test('leerlus-bewijs/AC-18: not planned, achterhaald en heropenen blijven bij de eigenaar', () => {
    expect(stap).toMatch(/not\s+planned/);
    expect(stap).toMatch(/achterhaald/);
    expect(stap).toMatch(/heropen/);
    expect(stap).toMatch(/eigenaar/);
  });

  test.each(['R-ROL-12', 'R-SEC-09', 'R-WERK-13'])(
    'leerlus-bewijs/AC-18: framework %s noemt sluiten als opgelost met verwijzing en ADR 0109',
    (id) => {
      const regel = regelMet(framework, `**${id}**`);
      expect(regel.length).toBeGreaterThan(0);
      expect(regel).toContain('0109');
      expect(regel).toMatch(/opgelost/i);
      expect(regel).toMatch(/verwijzing/i);
    },
  );
});

describe('leerlus-bewijs/AC-21 AGENTS.md: sluiten in plaats van sluiten als duplicaat', () => {
  test('leerlus-bewijs/AC-21: de regel over externe diensten noemt "een leerpunt-issue (aanmaken, bijwerken, sluiten)"', () => {
    const regel = regelMet(agents, 'Externe diensten via hun CLI');
    expect(regel).toContain('een leerpunt-issue (aanmaken, bijwerken, sluiten)');
    expect(regel).toContain('0101');
  });

  test('leerlus-bewijs/AC-21: "sluiten als duplicaat" komt in AGENTS.md niet meer voor', () => {
    expectAbsent(agents, /sluiten als duplicaat/i, {
      recognizes: ['sluiten als duplicaat', 'Sluiten als duplicaat'],
      allows: ['sluiten', 'sluiten) of een PR'],
    });
  });
});
