import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec ontwerp-overnemen (5b): de UX-modus van de reviewer. Elke toets kijkt alleen in de eigen sectie, zodat een term
// elders in het bestand niet meetelt. De tests op formuleringen in de skill `nieuw-scherm` en framework §8 zijn weg
// (refactorplan stap 3b, R-TEST-02).
const reviewer = readFileSync('.claude/agents/reviewer.md', 'utf8');

// Van de kop `## <titel>` (aan het begin van een regel) tot de volgende kop van niveau 2, of het einde.
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n');
}

const modusUx = section(reviewer, '## Modus UX');
const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(reviewer)?.[1] ?? '';

describe('reviewer: sectie Modus UX', () => {
  test('ontwerp-overnemen/AC-11: kop "## Modus UX" staat na "## Modus spec-review"', () => {
    const lines = reviewer.split('\n');
    const specReview = lines.indexOf('## Modus spec-review');
    const ux = lines.indexOf('## Modus UX');

    expect(specReview, '## Modus spec-review bestaat').toBeGreaterThan(-1);
    expect(ux, '## Modus UX bestaat').toBeGreaterThan(-1);
    expect(ux).toBeGreaterThan(specReview);
  });

  test.each(['hiërarchie', 'ritme', 'consistentie', 'leeg', 'laden', 'fout', '44 px', 'focus', 'tekst', 'referentie'])(
    'ontwerp-overnemen/AC-11: Modus UX noemt checklistterm "%s"',
    (term) => {
      expect(modusUx.toLowerCase()).toContain(term);
    },
  );

  test.each(['docs/ontwerp/', '375', '1280', 'UX zonder screenshots: alleen op code getoetst'])(
    'ontwerp-overnemen/AC-11: Modus UX noemt "%s"',
    (term) => {
      expect(modusUx).toContain(term);
    },
  );

  test('ontwerp-overnemen/AC-12: tools blijven Read, Grep, Glob, Bash en het rapport staat onder "## Bevindingen"', () => {
    expect(frontmatter).toMatch(/^tools: Read, Grep, Glob, Bash$/m);
    expect(reviewer).toContain('## Bevindingen');
    expect(modusUx.length, 'sectie Modus UX bestaat').toBeGreaterThan(0);
  });
});
