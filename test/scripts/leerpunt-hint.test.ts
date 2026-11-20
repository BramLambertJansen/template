import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { COMMENT_ONVOLLEDIG, commentOnvolledig, leesSjabloon, toetsBody } from '../../scripts/kit/leerpunt.mjs';
import { stappen } from '../../scripts/kit/leerpunt-check.mjs';

// Leerpunt #759: bij een onbekende keuzewaarde noemt de comment welke waarden wel mogen.
const velden = leesSjabloon(readFileSync('.github/ISSUE_TEMPLATE/leerpunt.yml', 'utf8'));

const WAARDEN: Record<string, string> = {
  Soort: 'Valkuil zonder check',
  Bron: 'PR #502, tweede review',
  Kosten: '1 extra reviewronde',
  'Generieke reproductie': '1. verse kopie\n2. post zonder pre',
  'Voorstel voor de plek': 'Check',
  'Template-SHA van de app': 'a'.repeat(40),
  Eerder: '_No response_',
};
const body = (waarden: Record<string, string>) =>
  velden
    .map((v) => v.label)
    .filter((label) => label in waarden)
    .map((label) => `### ${label}\n\n${waarden[label] ?? ''}`)
    .join('\n\n');

const opties = (label: string) => velden.find((v) => v.label === label)?.opties ?? [];
const hint = (label: string) =>
  `Kies bij ${label} precies één van: ${opties(label)
    .map((o) => `\`${o}\``)
    .join(', ')}; zet toelichting onder Bron of Onderbouwing, niet achter de waarde.`;

describe('leerpunt #759 hint bij een onbekende keuzewaarde', () => {
  test('leerpunt-hint: toelichting achter de plekwaarde geeft een hint met alle opties van het veld', () => {
    const waarde = 'Skill (skill opleveren, CI-lus stap 3)';
    const fouten = toetsBody(body({ ...WAARDEN, 'Voorstel voor de plek': waarde }), velden);
    expect(fouten).toEqual([`onbekende waarde bij Voorstel voor de plek: ${waarde}`]);
    expect(opties('Voorstel voor de plek').length).toBeGreaterThan(1);
    expect(commentOnvolledig(fouten, velden)).toBe(
      [COMMENT_ONVOLLEDIG, '', `- ${fouten.join('')}`, hint('Voorstel voor de plek')].join('\n'),
    );
  });

  test('leerpunt-hint: een plekwaarde als Soort geeft de hint met de opties van Soort', () => {
    const fouten = toetsBody(body({ ...WAARDEN, Soort: 'Check' }), velden);
    expect(fouten).toEqual(['onbekende waarde bij Soort: Check']);
    const comment = commentOnvolledig(fouten, velden);
    expect(comment).toContain(hint('Soort'));
    expect(opties('Soort').length).toBeGreaterThan(1);
  });

  test('leerpunt-hint: twee fouten in hetzelfde label geven één hint', () => {
    const fouten = ['onbekende waarde bij Soort: Check', 'onbekende waarde bij Soort: Skill'];
    const comment = commentOnvolledig(fouten, velden);
    expect(comment.split('Kies bij Soort precies één van:')).toHaveLength(2);
    expect(comment.match(/^Kies bij /gm)).toHaveLength(1);
  });

  test('leerpunt-hint: zonder velden is de uitvoer exact de oude tekst', () => {
    const fouten = ['onbekende waarde bij Soort: Check', 'leeg: Bron'];
    expect(commentOnvolledig(fouten)).toBe([COMMENT_ONVOLLEDIG, '', ...fouten.map((f) => `- ${f}`)].join('\n'));
  });

  test('leerpunt-hint: stappen met velden geeft de comment met hint', () => {
    const fouten = ['onbekende waarde bij Soort: Check'];
    const uit = stappen({ fouten, oordeel: null, heropend: false, velden });
    expect(uit.map((s) => s.comment)).toEqual([commentOnvolledig(fouten, velden)]);
    expect(uit[0]?.comment).toContain(hint('Soort'));
  });
});
