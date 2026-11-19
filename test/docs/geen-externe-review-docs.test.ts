import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

// agent-samenvoegen/AC-11: geen externe reviewdienst in de actieve werkstraat. De opdracht uit de spec (zonder de
// fixtures) mag alleen nog de uitzonderingen 4 en 5 geven, letterlijk. Het zoekwoord wordt samengesteld, zodat dit bestand zichzelf
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

// GEWIJZIGD (agent-samenvoegen/AC-11, R-TEST-02): uitzondering 1 (de vijf metingbestanden) en 2 (stap 8 van de skill
// opleveren en de twee metingzinnen in de doorloop) golden "tot de aparte meting-PR". Die PR is gemerged (#772, skill #773):
// elke regel met het woord in die bestanden is een treffer.
// GEWIJZIGD (templateregime AC-13, ADR 0089 punt 5): uitzondering 3 (de kop in test/rails/adr-herzien.test.ts) is vervallen;
// dat testbestand is met adr-herzien.mjs verwijderd.
// Uitzondering 5: per regel, alleen wat de bot nabouwt: in de opvolger van de oude omvang- en steekproeftests de regels met
// de botnaam of de marker. Elke andere regel in dat bestand die het woord noemt, is een treffer.
// GEWIJZIGD (eigenaarakkoord 2026-11-18, R-TEST-02): het woord staat niet meer in `scripts/`, dus de uitzondering voor de
// sleutelregels in scripts/kit/check-docs.mjs en de vormen met de sleutel, `agentMerge.<woord>` en de afwezigheidstoets zijn
// weg, met hun tests; één test bewijst dat een bestand buiten de uitzonderingen altijd een treffer is.
const BOT_REGEL = new RegExp(`chatgpt-${WOORD}-connector|${WOORD}-review-state`, 'i');
const UITZ5_TESTS = new Set(['test/scripts/pr-merge-omvang-steekproef.test.ts']);
const GEEN_UITZONDERING = [
  'scripts/kit/meting.mjs',
  'scripts/kit/check-docs.mjs',
  'test/rails/leesbudget.test.ts',
  '.claude/skills/opleveren/SKILL.md',
  'docs/operations/agent-doorloop.md',
];
type Treffer = { bestand: string; regel: number; tekst: string };

/** Alle treffers buiten de uitzonderingen. */
function buitenUitzonderingen(treffers: Treffer[]): Treffer[] {
  return treffers.filter((t) => {
    if (t.bestand === ZICHZELF) return false;
    if (UITZ5_TESTS.has(t.bestand)) return !BOT_REGEL.test(t.tekst);
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

const T = (bestand: string, regel: number, tekst: string): Treffer => ({ bestand, regel, tekst });

describe('agent-samenvoegen/AC-11 de uitzonderingen per regel', () => {
  test('een bestand buiten de uitzonderingen is altijd een treffer, ook met een regel die elders vrij is of was', () => {
    const vroegerVrij = [`CI-rood of ${WOORD}-bevindingen`, `key: 'docs:agentMerge.${WOORD}',`, `'chatgpt-${WOORD}-connector[bot]'`];
    const treffers = GEEN_UITZONDERING.flatMap((b) => vroegerVrij.map((tekst, i) => T(b, i + 1, tekst)));
    expect(buitenUitzonderingen(treffers)).toEqual(treffers);
  });

  test('uitzondering 5: de botnaam en de marker in het steekproefbestand zijn vrij, een andere regel niet', () => {
    const steekproef = 'test/scripts/pr-merge-omvang-steekproef.test.ts';
    const bot = T(steekproef, 7, `const BOT = 'chatgpt-${WOORD}-connector[bot]';`);
    const marker = T(steekproef, 8, `const MARKER = '<!-- ${WOORD}-review-state:v1';`);
    const sleutel = T(steekproef, 21, `const SLEUTEL = '${WOORD}';`);
    const afwezig = T(steekproef, 263, `expectAbsent(TEKST, /${WOORD}/i, {`);
    const ander = T(steekproef, 99, `// de ${WOORD} doet ook mee`);
    const andereTest = T(steekproef, 98, `test('${WOORD} wacht niet', () => {`);
    expect(buitenUitzonderingen([bot, marker, sleutel, afwezig, ander, andereTest])).toEqual([
      sleutel,
      afwezig,
      ander,
      andereTest,
    ]);
  });

  test('uitzondering 4: dit bestand sluit zichzelf uit', () => {
    expect(buitenUitzonderingen([T(ZICHZELF, 1, WOORD)])).toEqual([]);
  });
});

describe('agent-samenvoegen/AC-11 geen externe reviewdienst in de actieve werkstraat', () => {
  test('de git grep uit de spec geeft alleen de uitzonderingen 4 en 5', () => {
    const over = buitenUitzonderingen(treffers()).map((t) => `${t.bestand}:${String(t.regel)}`);
    expect(over).toEqual([]);
  });
});
