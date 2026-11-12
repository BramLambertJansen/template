import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import {
  PR,
  S1,
  basisRoadmap,
  commit,
  doneItem,
  maakRepo,
  opruimen,
  read,
  roadmapSleutels,
  roadmapTekst,
  write,
} from '../hooks/follow-up-kit';

// docs/specs/spec-en-bouw-in-een-pr.md (ADR 0062): spec, tests, code, docs en `gebouwd` in één PR; alleen kritiek werk vraagt
// eerst een aparte besluit-PR. Echte tijdelijke Git-repositories; de checker draait zoals guard.yml hem draait, met main als
// vertrouwde basis en een `gh`-stub (geen netwerk). `laneVan` wordt dynamisch aangeroepen: de parameter `mini` vervalt.
afterEach(opruimen);
const CODE = 'export const x = 1;\n';

function zetStatusRegel(root: string, file: string, regel: string): void {
  write(root, file, read(root, file).replace(/^status:.*$/m, regel));
}

describe('spec-en-bouw/AC-8: gebouwd # #<n> zonder SHA in de eigen PR', () => {
  test('spec-en-bouw/AC-8 check-roadmap accepteert gebouwd # #<n> met het roadmapvinkje in dezelfde PR', async () => {
    const fixture = maakRepo({ specs: [S1], mandaat: [], roadmap: basisRoadmap() });
    write(fixture.root, 'src/web/features/s1.tsx', CODE);
    zetStatusRegel(fixture.root, S1, `status: gebouwd # #${String(PR)}`);
    const [, ...rest] = basisRoadmap();
    write(fixture.root, 'docs/roadmap.md', roadmapTekst([doneItem(S1), ...rest]));
    commit(fixture.root, 'feat: s1 gebouwd');
    expect(await roadmapSleutels(fixture.root)).not.toContain(`spec:bewijs:${S1}`);
  });
});

/** Van de kop `## <titel>` tot de volgende kop van niveau 2, of het einde. */
function sectie(tekst: string, kop: string): string {
  const regels = tekst.split('\n');
  const start = regels.indexOf(kop);
  if (start === -1) return '';
  const rest = regels.slice(start + 1);
  const einde = rest.findIndex((regel) => regel.startsWith('## '));
  return rest.slice(0, einde === -1 ? rest.length : einde).join('\n');
}

describe('spec-en-bouw/AC-13: reviewer en PR-sjabloon', () => {
  const reviewer = readFileSync('.claude/agents/reviewer.md', 'utf8');

  test('spec-en-bouw/AC-13 de modus spec-review geldt bij elke spec in de PR', () => {
    const modus = sectie(reviewer, '## Modus spec-review');
    expect(modus).toMatch(/elke spec/i);
    expect(modus).not.toMatch(/^Bij een spec met een migratie, route of permissie/m);
  });

  test('spec-en-bouw/AC-13 de modus spec-review vraagt een oordeel over "kritiek"', () => {
    expect(sectie(reviewer, '## Modus spec-review')).toMatch(/kritiek/i);
  });

  test('spec-en-bouw/AC-13 .github/pull_request_template.md opent met de sectie "## Spec"', () => {
    const sjabloon = readFileSync('.github/pull_request_template.md', 'utf8');
    const eerste = sjabloon.split('\n').find((regel) => regel.trim() !== '');
    expect(eerste).toBe('## Spec');
  });
});
