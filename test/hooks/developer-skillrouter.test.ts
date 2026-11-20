import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec agents-leveren (punt 1b): de developer laadt per stap de juiste skill. De router noemt elke bouwskill; een nieuwe
// skillmap zonder rij maakt deze toets rood, zodat hij niet stil buiten de router valt.
const UITZONDERINGEN = ['opleveren', 'security-review', 'spec'];
const KOP = '## Welke skill je laadt';

/** De skillnamen in de tweede kolom van de routertabel onder `KOP`. */
function routerSkills(tekst: string): string[] {
  const start = tekst.indexOf(KOP);
  if (start === -1) return [];
  const rest = tekst.slice(start + KOP.length);
  const einde = rest.search(/\n## |\n\d+\. /);
  const sectie = einde === -1 ? rest : rest.slice(0, einde);
  return sectie
    .split('\n')
    .filter((regel) => regel.startsWith('|') && !/^\|\s*-/.test(regel))
    .map((regel) => /`([\w-]+)`\s*\|\s*$/.exec(regel)?.[1])
    .filter((naam) => naam !== undefined);
}

/** Wat er mis is tussen de router en de skillmappen; leeg is goed. */
function routerFouten(tekst: string, skills: readonly string[]): string[] {
  const inRouter = routerSkills(tekst);
  const verwacht = skills.filter((skill) => !UITZONDERINGEN.includes(skill));
  return [
    ...verwacht.filter((skill) => !inRouter.includes(skill)).map((skill) => `skill zonder rij in de router: ${skill}`),
    ...inRouter.filter((naam) => !skills.includes(naam)).map((naam) => `rij zonder skillmap: ${naam}`),
  ];
}

const developer = readFileSync('.claude/agents/developer.md', 'utf8');
const skillmappen = readdirSync('.claude/skills', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('agents-leveren/AC-9 de skillrouter in de developer', () => {
  test('agents-leveren/AC-9 elke bouwskill heeft een rij en elke rij een skillmap', () => {
    expect(routerSkills(developer).length).toBeGreaterThan(0);
    expect(routerFouten(developer, skillmappen)).toStrictEqual([]);
  });

  test('agents-leveren/AC-9 een nieuwe skillmap zonder rij maakt de toets rood', () => {
    expect(routerFouten(developer, [...skillmappen, 'nieuwe-skill'])).toStrictEqual([
      'skill zonder rij in de router: nieuwe-skill',
    ]);
  });

  test('agents-leveren/AC-9 een rij zonder skillmap maakt de toets rood', () => {
    expect(
      routerFouten(
        developer,
        skillmappen.filter((skill) => skill !== 'migratie'),
      ),
    ).toStrictEqual(['rij zonder skillmap: migratie']);
  });
});

describe('agents-leveren/AC-10 geen kopie van AGENTS.md in de developer', () => {
  test('agents-leveren/AC-10 de regels uit AGENTS.md staan er niet meer, punt 5 wel', () => {
    for (const kopie of ['Regels uit AGENTS.md', 'geen casts', 'eslint-disable'])
      expect(developer).not.toContain(kopie);
    // R-TEST-02: structuur, geen hele zin. Punt 5 bestaat en gaat over pushen door de hoofdsessie.
    const punt5 = developer.split('\n').find((regel) => regel.startsWith('5. ')) ?? '';
    expect(punt5).toMatch(/pushen/);
    expect(punt5).toMatch(/hoofdsessie/);
  });
});
