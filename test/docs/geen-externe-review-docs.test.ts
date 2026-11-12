import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// agent-merge-niet-kritiek/AC-10: geen externe reviewdienst in de actieve werkstraat. De opdracht uit de spec (zonder de
// fixtures) mag alleen nog de vijf uitzonderingen geven, letterlijk. Het zoekwoord wordt samengesteld, zodat dit bestand zichzelf
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
// Uitzondering 5: per regel, alleen wat de vervallen sleutel of de bot herkent, meldt of nabouwt: in de twee scripts de
// regels met de sleutel tussen aanhalingstekens of `agentMerge.<woord>` (herkennen en de reden uit AC-8); in de twee opvolgers
// van de oude omvang- en steekproeftests de regels met de botnaam, de marker, de sleutel tussen aanhalingstekens of
// `agentMerge.<woord>`. Elke andere regel in die vier bestanden die het woord noemt, is een treffer.
const SLEUTEL_REGEL = new RegExp(`['"]${WOORD}['"]|agentMerge\\.${WOORD}`, 'i');
// In de testbestanden herkent ook de afwezigheidstoets (`expectAbsent(…, /<woord>/i, …)`) de sleutel in de echte gates.json.
const BOT_REGEL = new RegExp(
  `chatgpt-${WOORD}-connector|${WOORD}-review-state|expectAbsent\\(.*/${WOORD}/|${SLEUTEL_REGEL.source}`,
  'i',
);
const UITZ5_SCRIPTS = new Set(['scripts/kit/check-docs.mjs']);
const UITZ5_TESTS = new Set([
  'test/scripts/pr-merge-omvang-steekproef.test.ts',
]);
// GEWIJZIGD (templateregime AC-13, ADR 0089 punt 5): uitzondering 3 (de kop in test/rails/adr-herzien.test.ts) is vervallen;
// dat testbestand is met adr-herzien.mjs verwijderd.
type Treffer = { bestand: string; regel: number; tekst: string };

/** Alle treffers buiten de uitzonderingen. */
function buitenUitzonderingen(treffers: Treffer[]): Treffer[] {
  return treffers.filter((t) => {
    if (t.bestand === ZICHZELF || METING.has(t.bestand)) return false;
    if (UITZ5_SCRIPTS.has(t.bestand)) return !SLEUTEL_REGEL.test(t.tekst);
    if (UITZ5_TESTS.has(t.bestand)) return !BOT_REGEL.test(t.tekst);
    if (t.bestand === SKILL) return !STAP_8.test(t.tekst);
    if (t.bestand === DOORLOOP) return !MAAT.test(t.tekst);
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

  test('uitzondering 1: de vijf metingbestanden zijn vrij, een ander bestand niet', () => {
    const vrij = [...METING].map((b) => T(b, 1, WOORD));
    expect(buitenUitzonderingen(vrij)).toEqual([]);
    const fout = T('scripts/kit/pr-merge.mjs', 1, WOORD);
    expect(buitenUitzonderingen([fout])).toEqual([fout]);
  });

  test('uitzondering 2: in de skill alleen stap 8, een andere regel in de skill niet', () => {
    const stap8 = T(SKILL, 40, `CI-rood of ${WOORD}-bevindingen; het leespad: groei`);
    const stap3 = T(SKILL, 50, `3. ${WOORD} telt als het een afgeronde review liet`);
    expect(buitenUitzonderingen([stap8, stap3])).toEqual([stap3]);
  });

  test('uitzondering 2: in de doorloop alleen de twee metingzinnen, een runtimezin niet', () => {
    const pr = T(DOORLOOP, 56, `reviewrondes, CI-rood, weigeringen, ${WOORD}-bevindingen handmatig via gh api`);
    const trend = T(DOORLOOP, 61, `vergelijkt CI-rood, ${WOORD}-bevindingen en reviewrondes`);
    const runtime = T(DOORLOOP, 236, `${WOORD} gebruikt zijn eigen runtimebeleid`);
    expect(buitenUitzonderingen([pr, trend, runtime])).toEqual([runtime]);
  });

  test('uitzondering 5: sleutelregels in de twee scripts zijn vrij, een andere regel met het woord niet', () => {
    const herkennen = T('scripts/kit/check-docs.mjs', 117, `Object.keys(blok).includes('${WOORD}')`);
    const melden = T('scripts/kit/check-docs.mjs', 884, `key: 'docs:agentMerge.${WOORD}',`);
    const ander = T('scripts/kit/check-docs.mjs', 12, `// ${WOORD} beoordeelt de PR ook nog`);
    const anderAgent = T('scripts/kit/check-docs.mjs', 20, `const ${WOORD}Wacht = true;`);
    expect(buitenUitzonderingen([herkennen, melden, ander, anderAgent])).toEqual([ander, anderAgent]);
  });

  test('uitzondering 5: botwereld- en sleutelregels in de twee testbestanden zijn vrij, een andere regel niet', () => {
    const steekproef = 'test/scripts/pr-merge-omvang-steekproef.test.ts';
    const bot = T(steekproef, 7, `const BOT = 'chatgpt-${WOORD}-connector[bot]';`);
    const marker = T(steekproef, 8, `const MARKER = '<!-- ${WOORD}-review-state:v1';`);
    const sleutel = T(steekproef,21, `const SLEUTEL = '${WOORD}';`);
    const afwezig = T(steekproef,263, `expectAbsent(TEKST, /${WOORD}/i, {`);
    const ander = T(steekproef,99, `// de ${WOORD} doet ook mee`);
    const andereTest = T(steekproef, 98, `test('${WOORD} wacht niet', () => {`);
    expect(buitenUitzonderingen([bot, marker, sleutel, afwezig, ander, andereTest])).toEqual([ander, andereTest]);
  });

  test('uitzondering 4: dit bestand sluit zichzelf uit', () => {
    expect(buitenUitzonderingen([T(ZICHZELF, 1, WOORD)])).toEqual([]);
  });
});

describe('agent-merge-niet-kritiek/AC-10 de vervangende zinnen', () => {
  test('stap 3 van "Mergen" in de skill opleveren', () => {
    expect(lees(SKILL)).toContain('Threads zijn opgelost; een externe review is geen voorwaarde.');
  });

  test('review-checklists: de PR-review, zonder de vraag van de externe dienst', () => {
    const tekst = lees('docs/operations/review-checklists.md');
    expect(tekst).toContain('de PR-review');
    expectAbsent(tekst, /de PR- of \S+-review/, {
      recognizes: ['de PR- of Codex-review', 'de PR- of codex-review', 'de PR- of externe-review'],
      allows: ['de PR-review', 'de PR- en CI-uitslag'],
    });
    expect(tekst).not.toContain('vraagt hier steeds naar.');
  });
});

describe('agent-merge-niet-kritiek/AC-10 geen externe reviewdienst in de actieve werkstraat', () => {
  test('de git grep uit de spec geeft alleen de vijf uitzonderingen', () => {
    const over = buitenUitzonderingen(treffers()).map((t) => `${t.bestand}:${String(t.regel)}`);
    expect(over).toEqual([]);
  });
});
