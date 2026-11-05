import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// agent-merge-niet-kritiek/AC-10: geen externe reviewdienst in de actieve werkstraat. De opdracht uit de spec (zonder de
// fixtures) mag alleen nog de vier uitzonderingen geven, letterlijk. Het zoekwoord wordt samengesteld, zodat dit bestand zichzelf
// niet vindt; het sluit zichzelf bovendien uit (uitzondering 4). Een treffer in docs/adr/ of docs/specs/ telt niet: die mappen
// staan niet in de opdracht (historie blijft).
const WOORD = ['co', 'dex'].join('');
const ZICHZELF = 'test/docs/geen-externe-review-docs.test.ts';
const PADEN = [
  'scripts',
  '.claude',
  'README.md',
  'docs/operations',
  'test',
  'src',
  'rails',
  'db',
  'e2e',
  '.github',
  'package.json',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/framework.md',
  'docs/dod.md',
];

// Uitzondering 1: de meting, tot de aparte meting-PR (OV-1), per bestand.
const METING = new Set([
  'scripts/kit/meting.mjs',
  'scripts/kit/meting-trend.mjs',
  'test/rails/leesbudget.test.ts',
  'test/rails/meting-kerncijfers-pr-tabel.test.ts',
  'test/rails/meting-stuurt.test.ts',
]);
// Uitzondering 2: per regel. In de skill alleen stap 8; in de doorloop alleen de twee zinnen over de maat in de meting.
const SKILL = '.claude/skills/opleveren/SKILL.md';
const DOORLOOP = 'docs/operations/agent-doorloop.md';
const STAP_8 = new RegExp(`CI-rood of ${WOORD}-bevindingen`, 'i');
const MAAT = new RegExp(`${WOORD}-bevindingen`, 'i');
// Uitzondering 3: de constante `KOP_0069` (vaste historische kop), per regel binnen zijn `lines(…)`.
const ADR_HERZIEN = 'test/rails/adr-herzien.test.ts';

type Treffer = { bestand: string; regel: number; tekst: string };

/** Het bereik (1-based, inclusief) van de constante `KOP_0069` in de tekst van adr-herzien.test.ts. */
function bereikKop(tekst: string): [number, number] {
  const regels = tekst.split('\n');
  const start = regels.findIndex((r) => r.startsWith('const KOP_0069 = '));
  if (start === -1) return [0, 0];
  const einde = regels.findIndex((r, i) => i > start && r === ');');
  return [start + 1, einde === -1 ? regels.length : einde + 1];
}

/** Alle treffers buiten de vier uitzonderingen. `lees` geeft de tekst van een bestand (voor het bereik van `KOP_0069`). */
function buitenUitzonderingen(treffers: Treffer[], lees: (bestand: string) => string): Treffer[] {
  const [kopVan, kopTot] = bereikKop(lees(ADR_HERZIEN));
  return treffers.filter((t) => {
    if (t.bestand === ZICHZELF || METING.has(t.bestand)) return false;
    if (t.bestand === SKILL) return !STAP_8.test(t.tekst);
    if (t.bestand === DOORLOOP) return !MAAT.test(t.tekst);
    if (t.bestand === ADR_HERZIEN) return !(t.regel >= kopVan && t.regel <= kopTot);
    return true;
  });
}

function treffers(): Treffer[] {
  const uit = spawnSync(
    'git',
    ['grep', '--untracked', '-I', '-i', '-n', WOORD, '--', ...PADEN, ':(exclude)test/rails/fixtures'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (uit.status !== 0 && uit.status !== 1) throw new Error(`git grep faalde: ${uit.stderr}`);
  return uit.stdout
    .split('\n')
    .filter(Boolean)
    .map((r) => {
      const m = /^([^:]+):(\d+):(.*)$/.exec(r);
      return { bestand: m?.[1] ?? r, regel: Number(m?.[2] ?? 0), tekst: m?.[3] ?? '' };
    });
}

const lees = (bestand: string) => readFileSync(bestand, 'utf8');
const T = (bestand: string, regel: number, tekst: string): Treffer => ({ bestand, regel, tekst });

describe('agent-merge-niet-kritiek/AC-10 de uitzonderingen per regel', () => {
  const [kopVan, kopTot] = bereikKop(lees(ADR_HERZIEN));

  test('de constante KOP_0069 bestaat en heeft een bereik', () => {
    expect(kopVan).toBeGreaterThan(0);
    expect(kopTot).toBeGreaterThan(kopVan);
  });

  test('uitzondering 1: de vijf metingbestanden zijn vrij, een ander bestand niet', () => {
    const vrij = [...METING].map((b) => T(b, 1, WOORD));
    expect(buitenUitzonderingen(vrij, lees)).toEqual([]);
    const fout = T('scripts/kit/pr-merge.mjs', 1, WOORD);
    expect(buitenUitzonderingen([fout], lees)).toEqual([fout]);
  });

  test('uitzondering 2: in de skill alleen stap 8, een andere regel in de skill niet', () => {
    const stap8 = T(SKILL, 40, `CI-rood of ${WOORD}-bevindingen; het leespad: groei`);
    const stap3 = T(SKILL, 50, `3. ${WOORD} telt als het een afgeronde review liet`);
    expect(buitenUitzonderingen([stap8, stap3], lees)).toEqual([stap3]);
  });

  test('uitzondering 2: in de doorloop alleen de twee metingzinnen, een runtimezin niet', () => {
    const pr = T(DOORLOOP, 56, `reviewrondes, CI-rood, weigeringen, ${WOORD}-bevindingen handmatig via gh api`);
    const trend = T(DOORLOOP, 61, `vergelijkt CI-rood, ${WOORD}-bevindingen en reviewrondes`);
    const runtime = T(DOORLOOP, 236, `${WOORD} gebruikt zijn eigen runtimebeleid`);
    expect(buitenUitzonderingen([pr, trend, runtime], lees)).toEqual([runtime]);
  });

  test('uitzondering 3: alleen regels binnen KOP_0069 in adr-herzien.test.ts', () => {
    const binnen = T(ADR_HERZIEN, kopVan + 4, `Herzien: versoepelt de ${WOORD}-voorwaarde`);
    const buiten = T(ADR_HERZIEN, kopTot + 5, `// ${WOORD}`);
    expect(buitenUitzonderingen([binnen, buiten], lees)).toEqual([buiten]);
  });

  test('uitzondering 4: dit bestand sluit zichzelf uit', () => {
    expect(buitenUitzonderingen([T(ZICHZELF, 1, WOORD)], lees)).toEqual([]);
  });
});

describe('agent-merge-niet-kritiek/AC-10 de vervangende zinnen', () => {
  test('stap 3 van "Mergen" in de skill opleveren', () => {
    expect(lees(SKILL)).toContain('Threads zijn opgelost; een externe review is geen voorwaarde.');
  });

  test('review-checklists: de PR-review, zonder de vraag van de externe dienst', () => {
    const tekst = lees('docs/operations/review-checklists.md');
    expect(tekst).toContain('de PR-review');
    expect(tekst).not.toMatch(/de PR- of \S+-review/);
    expect(tekst).not.toContain('vraagt hier steeds naar.');
  });
});

describe('agent-merge-niet-kritiek/AC-10 geen externe reviewdienst in de actieve werkstraat', () => {
  test('de git grep uit de spec geeft alleen de vier uitzonderingen', () => {
    const over = buitenUitzonderingen(treffers(), lees).map((t) => `${t.bestand}:${String(t.regel)}`);
    expect(over).toEqual([]);
  });
});
