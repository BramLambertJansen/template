import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// ADR 0046 punt 16, 25 en 26: de skill `opleveren`.
// GEWIJZIGD (refactorplan stap 3b, R-TEST-02): weg zijn de tests op het frontmatter (dubbel met test/hooks/agents.test.ts),
// `--json merged`, "modus eigenaar" (getest in test/scripts/pr-merge.test.ts), framework §8 stap 6, de CI-lus in CLAUDE.md
// en de MCP-uitzondering in de regels. De tests van de leerlus blijven (eigenaarbesluit 2026-11-17).
const SKILL = '.claude/skills/opleveren/SKILL.md';
const skill = existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '';
const framework = readFileSync('docs/framework.md', 'utf8');

describe('skill opleveren', () => {
  test.each([
    'pnpm pr:verify',
    '--watch',
    'gh run view',
    '--log-failed',
    'Opruimen',
    'state',
    'mergedAt',
    'git merge --ff-only origin/main',
    'git branch -D',
    'git push origin --delete',
  ])('noemt %s', (term) => {
    expect(skill).toContain(term);
  });

  test.each([
    { name: 'afzwakken', pattern: /afzwak/i },
    { name: 'drie keer dezelfde fout', pattern: /drie keer/i },
    { name: 'oorzaak buiten de code', pattern: /buiten de code/i },
    { name: 'gate-pad', pattern: /gate-pad/i },
  ])('stopgrond: $name', ({ pattern }) => {
    expect(skill).toMatch(pattern);
  });
});

// Spec leerlus (docs/template/specs/leerlus.md), ADR 0059: de slotstap na de slotregel, de signaalmomenten en de documentatie.
// De tekst wordt vergeleken na het weghalen van backticks en het samenvoegen van witruimte (regelafbreking in markdown).
const flat = (text: string): string => text.replace(/`/g, '').replace(/\s+/g, ' ');
const SLOTREGEL =
  'Wat moet er in het spec-sjabloon, het gouden pad of een check veranderen zodat de volgende feature dit niet opnieuw betaalt?';
const SLOTSTAP =
  'Loop de signaalmomenten van deze sessie af: slotvraag, derde CI-ronde, eigenaarcorrectie (pnpm meting), blokkerende reviewbevinding (Leerpunt: ja), tweede mislukte correctiepoging. Per les: Leerpunt? Generiek: dien het in volgens het sjabloon leerpunt (gh issue create naar template.repository met --label leerpunt) en toon de tekst. Alleen voor deze app: een padregel, spec of ADR (docs/specs/, docs/adr/) in de app, geen issue. Niets: zeg "geen leerpunt".';
const ADR_0059 = 'template/adr/0059-leerlus-van-app-naar-template.md';
const PROTOCOL = 'docs/operations/st-09-praktijkproef.md';
const protocol = existsSync(PROTOCOL) ? readFileSync(PROTOCOL, 'utf8') : '';

/** Tekst tussen twee koppen (de eindkop telt niet mee); leeg als de beginkop ontbreekt. */
function section(text: string, start: RegExp, end: RegExp): string {
  const from = text.search(start);
  if (from === -1) return '';
  const rest = text.slice(from);
  const kop = rest.indexOf('\n') + 1;
  const to = rest.slice(kop).search(end);
  return to === -1 ? rest : rest.slice(0, kop + to);
}

/** Alinea's, en per tabelregel een eigen eenheid; witruimte samengevoegd. */
function units(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .flatMap((block) => (block.trimStart().startsWith('|') ? block.split('\n') : [block]))
    .map(flat);
}

describe('leerlus: slotstap in opleveren', () => {
  test('leerlus/AC-3: de slotregel blijft en de slotstap volgt er direct op, letterlijk', () => {
    const text = flat(skill);
    const regel = text.indexOf(SLOTREGEL);
    const stap = text.indexOf(SLOTSTAP);
    expect(regel, 'slotregel ontbreekt').toBeGreaterThanOrEqual(0);
    expect(stap, 'slotstap ontbreekt of wijkt af van de spec').toBeGreaterThan(regel);
    // Tussen beide alleen opmaak (aanhalingsteken, nummering, een korte vetgedrukte kop), geen andere stap.
    expect(text.slice(regel + SLOTREGEL.length, stap).length).toBeLessThanOrEqual(40);
  });

  // GEWIJZIGD (templateregime AC-9, ADR 0089 punt 6): de slotstap en spec leerlus noemen de mappen van de app in plaats van de reeks vanaf 0100.
  // GEWIJZIGD (spec agent-recepten AC-8, leerpunt #807): het leerpuntdoel is template.repository, zoals in het rolhek.
  test('leerlus/AC-3: de slotstap noemt gh issue create, --label leerpunt, template.repository en de app-uitzondering', () => {
    const stap = flat(skill).slice(flat(skill).indexOf('Loop de signaalmomenten'));
    expect(stap).toContain('gh issue create');
    expect(stap).toContain('--label leerpunt');
    expect(stap).toContain('template.repository');
    expect(stap).toMatch(
      /Alleen voor deze app: een padregel, spec of ADR \(docs\/specs\/, docs\/adr\/\) in de app, geen issue\./,
    );
  });

  test('leerlus/AC-3: stopgrond (b) verwijst naar de slotstap', () => {
    const text = flat(skill);
    const verwijzingen = [...text.matchAll(/\(b\)/g)].map((match) => {
      const na = text.slice(match.index, match.index + 300);
      const einde = na.indexOf('(c)');
      return einde === -1 ? na : na.slice(0, einde);
    });
    expect(verwijzingen.some((na) => /slotstap|leerpunt/i.test(na))).toBe(true);
  });

  test('leerlus/AC-11: de slotstap noemt alle vijf signaalmomenten met hun bron', () => {
    const text = flat(skill);
    const start = text.indexOf('Loop de signaalmomenten');
    expect(start, 'slotstap ontbreekt').toBeGreaterThanOrEqual(0);
    const stap = text.slice(start, start + SLOTSTAP.length + 200);
    expect({
      slotvraag: stap.includes('slotvraag'),
      'derde CI-ronde': stap.includes('derde CI-ronde'),
      'eigenaarcorrectie (pnpm meting)': stap.includes('eigenaarcorrectie (pnpm meting)'),
      'blokkerende reviewbevinding (Leerpunt: ja)': stap.includes('blokkerende reviewbevinding (Leerpunt: ja)'),
      'tweede mislukte correctiepoging': stap.includes('tweede mislukte correctiepoging'),
    }).toStrictEqual({
      slotvraag: true,
      'derde CI-ronde': true,
      'eigenaarcorrectie (pnpm meting)': true,
      'blokkerende reviewbevinding (Leerpunt: ja)': true,
      'tweede mislukte correctiepoging': true,
    });
  });
});

describe('leerlus: framework en ST-09-protocol', () => {
  test('leerlus/AC-9: framework §10 "Template-updates naar een app" noemt het label leerpunt met link naar ADR 0059', () => {
    const tekst = flat(section(framework, /^### Template-updates naar een app/m, /^#{2,3} /m));
    expect(tekst.length).toBeGreaterThan(0);
    expect(tekst).toContain('leerpunt');
    expect(tekst).toContain(ADR_0059);
  });

  test('leerlus/AC-9: framework §8 (rolhekregel) noemt de nieuwe gh issue-regels', () => {
    const rijen = section(framework, /^## 8\. /m, /^## 9\. /m)
      .split('\n')
      .filter((line) => (line.startsWith('|') || line.startsWith('- ')) && /rolhek/i.test(line))
      .map(flat)
      .join('\n');
    expect(rijen).toContain('gh issue create');
    expect(rijen).toContain('leerpunt');
    expect(rijen).toContain('onderhoud.repository');
    expect(rijen).toMatch(/schrijvende gh issue|gh issue (?:edit|close|comment)/);
  });

  test.each(['ST09-08', 'ST09-09', 'ST09-11'])('leerlus/AC-9: het protocol noemt bij %s het label leerpunt', (id) => {
    expect(units(protocol).some((unit) => unit.includes(id) && unit.includes('leerpunt'))).toBe(true);
  });

  test('leerlus/AC-9: het protocol linkt naar ADR 0059 en noemt leerpunt in het eindrapport', () => {
    expect(protocol).toContain(`../${ADR_0059}`);
    expect(flat(section(protocol, /^### 5\. Eindrapport/m, /^#{2,3} /m))).toContain('leerpunt');
  });

  test('leerlus/AC-9: bij ST09-09 is het bewijs de keten leerpunt-issue → roadmap-item → template-PR met merge-commit', () => {
    const keten = /leerpunt-issue.*roadmap-item.*aanleiding.*template-PR.*merge-commit/;
    expect(units(protocol).some((unit) => unit.includes('ST09-09') && keten.test(unit))).toBe(true);
  });

  test('leerlus/AC-10: het eindrapport vraagt totaal, opgepakt en herhalingen met het commando en nulmeting 0', () => {
    const rapport = flat(section(protocol, /^### 5\. Eindrapport/m, /^#{2,3} /m));
    expect(rapport).toContain('gh issue list --label leerpunt --state all');
    expect(rapport).toMatch(/totaal/i);
    expect(rapport).toMatch(/opgepakt/i);
    expect(rapport).toMatch(/herhaling/i);
    expect(rapport).toMatch(/nulmeting\D{0,30}\b(?:0|nul)\b/i);
  });
});

describe('leerlus-bewijs/AC-8 MCP in de cloud en de sectie Leerpunt', () => {
  // GEWIJZIGD (spec agent-recepten AC-8, leerpunt #807): de MCP-schrijfweg gaat naar template.repository.
  test('leerlus-bewijs/AC-8: de slotstap noemt de MCP-schrijfweg en de sectie ## Leerpunt', () => {
    const stap = flat(skill).slice(flat(skill).indexOf('Loop de signaalmomenten'));
    // GEWIJZIGD (ADR 0101, leerlus-bewijs/AC-14): de MCP-tool mag een leerpunt ook bijwerken en sluiten als duplicaat;
    // was "alleen aanmaken". Het doel blijft alleen template.repository en aanmaken blijft met label leerpunt.
    expect(stap).toMatch(
      /MCP-tool voor issues \(aanmaken, comment, bijwerken\), alleen naar template\.repository: aanmaken met label leerpunt/,
    );
    expect(stap).toContain('## Leerpunt');
    // GEWIJZIGD (spec gedragsbaseline AC-7, ADR 0107): de regel met een testpad noemt alleen de treden met een test.
    expect(stap).toContain('- #<nr>: trede <Type|Check|Gouden pad of generator>; bewijs <testpad>');
    expect(stap).toContain('bewijs geen test: <reden>');
  });

  test('leerlus-bewijs/AC-8: het PR-sjabloon heeft de sectie ## Leerpunt met de regelvorm', () => {
    const sjabloon = readFileSync('.github/pull_request_template.md', 'utf8');
    expect(sjabloon).toMatch(/^## Leerpunt$/m);
    // GEWIJZIGD (spec gedragsbaseline AC-7, ADR 0107): Skill, Padregel en AGENTS.md bewijzen met een baseline.
    expect(sjabloon).toContain('- #<nr>: trede <Type|Check|Gouden pad of generator>; bewijs <testpad>');
  });
});

describe('leerlus-bewijs/AC-8 de MCP-uitzondering in de regels', () => {
  test('leerlus-bewijs/AC-8: mcpLezen bevat geen schrijvende issuetool', () => {
    const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
    const lezen = typeof gates === 'object' && gates !== null && 'mcpLezen' in gates ? gates.mcpLezen : [];
    expectAbsent(JSON.stringify(lezen), /issue_write|create_issue/, {
      recognizes: ['mcp__github__issue_write', 'mcp__github__create_issue'],
      allows: ['mcp__github__issue_read'],
    });
  });
});

// Spec agent-recepten (leerpunten #679 en #807): de skill werkt in de cloud en volgt het leerpuntdoel van het rolhek.
describe('agent-recepten/AC-8: opleveren in de cloud', () => {
  test('agent-recepten/AC-8: de CI-lus noemt de log van een job via gh api', () => {
    expect(flat(section(skill, /^## CI-lus/m, /^## /m))).toContain('actions/jobs/<job-id>/logs');
  });

  test('agent-recepten/AC-8: Opruimen noemt de gebeurtenissen van de PR', () => {
    expect(flat(section(skill, /^## Opruimen/m, /^## /m))).toContain('issues/<nr>/events');
  });

  test('agent-recepten/AC-8: de slotstap noemt template.repository en niet meer onderhoud.repository', () => {
    const stap = flat(skill).slice(flat(skill).indexOf('Loop de signaalmomenten'));
    expect(stap).toContain('template.repository');
    expectAbsent(skill, /onderhoud\.repository/, {
      recognizes: ['naar onderhoud.repository met'],
      allows: ['naar template.repository met'],
    });
  });

  test('agent-recepten/AC-8: elk gh api-endpoint met {owner} staat tussen aanhalingstekens', () => {
    const kaal = [...skill.matchAll(/gh api(?: -X \w+| --paginate)* ([^\s"'`]*\{owner\}[^\s`]*)/g)].map((m) => m[1]);
    expect(kaal).toStrictEqual([]);
  });
});

// Leerpunt #789 (beperkte fix): main bijhalen met --no-commit en een losse commit, want de kale merge kan in de cloud niet
// ondertekenen; bij een wijziging onder .claude/skills of .claude/agents stopt de agent.
describe('opleveren: main bijhalen in de cloud', () => {
  test('stap 1 noemt git merge --no-commit origin/main, git commit -F en de controle op de paden die de sandbox afschermt', () => {
    const stap = flat(section(skill, /^## CI-lus/m, /^## /m));
    expect(stap).toContain('git merge --no-commit origin/main');
    expect(stap).toContain('git commit -F <bestand>');
    expect(stap).toContain(
      'git diff --name-only HEAD...origin/main -- .claude/skills .claude/agents .claude/hooks .claude/settings.json .claude/settings.local.json',
    );
  });
});
