import { describe, expect, test } from 'vitest';
import * as check from '../../scripts/kit/leerpunt-check.mjs';
import { LABEL_ZONDER_BEWIJS, stappen } from '../../scripts/kit/leerpunt-check.mjs';
import { exported } from '../rails/template-repo-kit';

// Spec leerlus-bewijs AC-20, ADR 0109 (Gevolgen, OV-5): een sluiting met reden `completed` en een geldige `opgelost:`-comment
// telt als bewijs. De tester legt de volgende uitbreiding van scripts/kit/leerpunt-check.mjs vast (de developer bouwt hem):
//
//   leesOpgelost(body: string): { soort: 'pr' | 'commit' | 'adr', waarde: string }[] | null
//     Puur. `null` als de comment niet past op `^\s*opgelost:\s*<lijst>\s*$` (hoofdletterongevoelig voor `opgelost:`); anders
//     de verwijzingen in volgorde: `#834` → { pr, '834' }, 7 tot 40 kleine hex → { commit, <sha> }, `ADR 0100` → { adr, '0100' }.
//     Elke andere vorm, een lege lijst of een leeg element (`#1,,#2`, `#1,`) maakt de hele comment ongeldig (`null`).
//   beoordeelOpgelost(nummer, bron, haalPr): Promise<'opgelost' | 'zonder-bewijs'>
//     bron   = { reden, comments, standaardBranch } (comments als bij `beoordeelSluiting`: { body, association })
//     haalPr(prnummer) = Promise van de REST-body van `repos/<repo>/pulls/<prnummer>` (`merged`, `base.ref`), of `null` bij
//              404/410 (het nummer is een issue of bestaat niet). Geen netwerk in de test.
//     'opgelost' alleen bij reden `completed` en minstens één comment van OWNER/MEMBER/COLLABORATOR waarvan ALLE verwijzingen
//     geldig zijn: elke `#<nr>` is gemerged (`merged === true`) met `base.ref === standaardBranch`; commit en ADR alleen op vorm.
//     Bij een andere reden roept hij `haalPr` niet aan. Gooit nooit bij `null`. De aanroeper (main) roept hem alleen aan als
//     `beoordeelSluiting` 'zonder-bewijs' gaf (bewijs en achterhaald gaan voor); `stappen` zet het label uit bij 'opgelost'.
const leesOpgelost = (...args: unknown[]) => exported(check, 'leesOpgelost')(...args);
const beoordeelOpgelost = (...args: unknown[]) => Promise.resolve(exported(check, 'beoordeelOpgelost')(...args));
const beoordeelSluiting = (...args: unknown[]) => Promise.resolve(exported(check, 'beoordeelSluiting')(...args));

const NR = 9;
const OWNER = 'OWNER';
const PR_OK = { merged: true, base: { ref: 'main' } };

const pr = (nr: string) => ({ soort: 'pr', waarde: nr });
const commit = (sha: string) => ({ soort: 'commit', waarde: sha });
const adr = (nnnn: string) => ({ soort: 'adr', waarde: nnnn });

/** Een PR-opvraag zonder netwerk: nummer → REST-body of null (404). */
function prs(tabel: Record<number, unknown>) {
  const aangevraagd: number[] = [];
  const haalPr = (nummer: number): Promise<unknown> => {
    aangevraagd.push(nummer);
    return Promise.resolve(tabel[nummer] ?? null);
  };
  return { haalPr, aangevraagd };
}

type Bron = { reden?: string; standaardBranch?: string; comments: { body: string; association: string }[] };
const oordeel = (bron: Bron, tabel: Record<number, unknown> = {}) =>
  beoordeelOpgelost(NR, { reden: 'completed', standaardBranch: 'main', ...bron }, prs(tabel).haalPr);
const comment = (body: string, association = OWNER) => ({ body, association });

describe('leerlus-bewijs/AC-20 de opgelost-comment: vorm van de lijst', () => {
  test.each([
    ['één PR', 'opgelost: #834', [pr('834')]],
    ['één commit (7 hex)', 'opgelost: abc1234', [commit('abc1234')]],
    ['één commit (40 hex)', `opgelost: ${'a1b2c3d4e5'.repeat(4)}`, [commit('a1b2c3d4e5'.repeat(4))]],
    ['commit van alleen cijfers (7)', 'opgelost: 1234567', [commit('1234567')]],
    ['één ADR', 'opgelost: ADR 0100', [adr('0100')]],
    ['lijst met alle vormen', 'opgelost: ADR 0100, #834, abc1234', [adr('0100'), pr('834'), commit('abc1234')]],
    ["twee PR's zonder spatie na de komma", 'opgelost: #1,#2', [pr('1'), pr('2')]],
    ['witruimte rond de komma', 'opgelost: #1 , #2 ,  ADR 0007', [pr('1'), pr('2'), adr('0007')]],
    ['witruimte aan het einde', 'opgelost: #834   ', [pr('834')]],
    ['newline aan het einde', 'opgelost: #834\n', [pr('834')]],
    ['hoofdletterongevoelig: Opgelost:', 'Opgelost: #834', [pr('834')]],
    ['hoofdletterongevoelig: OPGELOST:', 'OPGELOST: ADR 0100', [adr('0100')]],
    ['witruimte vooraan', '  \n  opgelost: #834', [pr('834')]],
  ])('leerlus-bewijs/AC-20: geldig, %s', (_naam, body, verwacht) => {
    expect(leesOpgelost(body)).toStrictEqual(verwacht);
  });

  test.each([
    ['tekst na de lijst', 'opgelost: #834 (fix rolhek)'],
    ['tekst na een ADR', 'opgelost: ADR 0100 en meer'],
    ['hoofdletters in hex', 'opgelost: ABC1234'],
    ['gemengde hoofdletters in hex', 'opgelost: abc123D'],
    ['hex te kort (6)', 'opgelost: abc123'],
    ['hex te lang (41)', `opgelost: ${'a'.repeat(41)}`],
    ['hex met een niet-hex teken', 'opgelost: abc123g'],
    ['ADR met 3 cijfers', 'opgelost: ADR 109'],
    ['ADR met 5 cijfers', 'opgelost: ADR 01000'],
    ['ADR zonder nummer', 'opgelost: ADR'],
    ['#nr met letters', 'opgelost: #12abc'],
    ['# zonder nummer', 'opgelost: #'],
    ['PR als URL', 'opgelost: https://github.com/o/r/pull/834'],
    ['lege lijst', 'opgelost:'],
    ['alleen witruimte', 'opgelost:   '],
    ['leeg element in het midden', 'opgelost: #1,,#2'],
    ['komma aan het einde', 'opgelost: #1,'],
    ['komma vooraan', 'opgelost: ,#1'],
    ['één ongeldige in de lijst', 'opgelost: #834, ADR 109'],
    ['woorden zonder komma', 'opgelost: #1 #2'],
    ['andere voorloper', 'achterhaald: #834'],
    ['voorloper niet aan het begin', 'zie opgelost: #834'],
    ['geen dubbele punt', 'opgelost #834'],
    ['duplicaat-vorm', 'duplicaat van #7'],
    ['lege body', ''],
  ])('leerlus-bewijs/AC-20: ongeldig, %s', (_naam, body) => {
    expect(leesOpgelost(body)).toBeNull();
  });
});

describe('leerlus-bewijs/AC-20 telt als bewijs', () => {
  test.each([
    ['een gemergde PR op de standaardbranch', [comment('opgelost: #834')], { 834: PR_OK }],
    ['alleen een commit: geen opvraag nodig', [comment('opgelost: abc1234')], {}],
    ['alleen een ADR: geen opvraag nodig', [comment('opgelost: ADR 0100')], {}],
    ['PR en ADR, beide geldig', [comment('opgelost: ADR 0100, #834')], { 834: PR_OK }],
    ["twee gemergde PR's en een commit", [comment('opgelost: #1, #2, abc1234')], { 1: PR_OK, 2: PR_OK }],
    ['MEMBER', [comment('opgelost: #834', 'MEMBER')], { 834: PR_OK }],
    ['COLLABORATOR', [comment('opgelost: #834', 'COLLABORATOR')], { 834: PR_OK }],
    ['hoofdletterongevoelig met witruimte vooraan', [comment('  OPGELOST: #834')], { 834: PR_OK }],
    [
      'een ongeldige comment ervoor, een geldige erna',
      [comment('opgelost: #834 (fix)'), comment('opgelost: #834')],
      { 834: PR_OK },
    ],
    [
      'een geldige comment tussen gewone comments',
      [comment('zie mijn vorige'), comment('opgelost: ADR 0100'), comment('klaar')],
      {},
    ],
  ])('leerlus-bewijs/AC-20: %s', async (_naam, comments, tabel) => {
    expect(await oordeel({ comments }, tabel)).toBe('opgelost');
  });

  test('leerlus-bewijs/AC-20: de standaardbranch komt uit de bron, niet hard uit "main"', async () => {
    const trunk = { merged: true, base: { ref: 'trunk' } };
    expect(await oordeel({ comments: [comment('opgelost: #834')], standaardBranch: 'trunk' }, { 834: trunk })).toBe(
      'opgelost',
    );
  });

  test('leerlus-bewijs/AC-20: elke #<nr> wordt opgevraagd met het PR-nummer uit de comment; commit en ADR niet', async () => {
    const { haalPr, aangevraagd } = prs({ 1: PR_OK, 2: PR_OK });
    await beoordeelOpgelost(
      NR,
      { reden: 'completed', standaardBranch: 'main', comments: [comment('opgelost: #1, ADR 0100, abc1234, #2')] },
      haalPr,
    );
    expect([...aangevraagd].sort()).toStrictEqual([1, 2]);
  });
});

describe('leerlus-bewijs/AC-20 telt niet: label zoals AC-6, de job crasht niet', () => {
  test.each([
    ['een PR die niet gemergd is', [comment('opgelost: #834')], { 834: { merged: false, base: { ref: 'main' } } }],
    ['een PR zonder veld merged', [comment('opgelost: #834')], { 834: { base: { ref: 'main' } } }],
    [
      'een PR gemergd in een andere basis',
      [comment('opgelost: #834')],
      { 834: { merged: true, base: { ref: 'dev' } } },
    ],
    ['een PR zonder basis', [comment('opgelost: #834')], { 834: { merged: true } }],
    ['een #<nr> dat een issue is of niet bestaat (404)', [comment('opgelost: #834')], {}],
    [
      'één geldige en één ongemergde PR in de lijst',
      [comment('opgelost: #1, #2')],
      { 1: PR_OK, 2: { merged: false, base: { ref: 'main' } } },
    ],
    ['een geldige ADR en een PR die 404 geeft', [comment('opgelost: ADR 0100, #834')], {}],
    ['één ongeldige verwijzing in de lijst', [comment('opgelost: #834, ADR 109')], { 834: PR_OK }],
    ['tekst na de lijst', [comment('opgelost: #834 (fix rolhek)')], { 834: PR_OK }],
    ['hex met hoofdletters', [comment('opgelost: ABC1234')], {}],
    ['een lege lijst', [comment('opgelost:')], {}],
    ['comment van CONTRIBUTOR', [comment('opgelost: ADR 0100', 'CONTRIBUTOR')], {}],
    ['comment van NONE (ook een bot)', [comment('opgelost: ADR 0100', 'NONE')], {}],
    ['comment van FIRST_TIME_CONTRIBUTOR', [comment('opgelost: ADR 0100', 'FIRST_TIME_CONTRIBUTOR')], {}],
    ['comment zonder association', [comment('opgelost: ADR 0100', '')], {}],
    ['geen comments', [], {}],
    ['alleen andere comments', [comment('zie #834'), comment('achterhaald: klaar')], { 834: PR_OK }],
  ])('leerlus-bewijs/AC-20: %s', async (_naam, comments, tabel) => {
    await expect(oordeel({ comments }, tabel)).resolves.toBe('zonder-bewijs');
  });

  test.each(['', 'not_planned', 'duplicate', 'Completed'])(
    'leerlus-bewijs/AC-20: sluitreden "%s": de tak wordt niet gebruikt en haalPr niet aangeroepen',
    async (reden) => {
      const { haalPr, aangevraagd } = prs({ 834: PR_OK });
      const uitkomst = await beoordeelOpgelost(
        NR,
        { reden, standaardBranch: 'main', comments: [comment('opgelost: #834')] },
        haalPr,
      );
      expect(uitkomst).toBe('zonder-bewijs');
      expect(aangevraagd).toStrictEqual([]);
    },
  );
});

describe('leerlus-bewijs/AC-20 label aan of uit; AC-6 en AC-13 ongewijzigd', () => {
  test('leerlus-bewijs/AC-20: oordeel opgelost haalt het label weg, zonder comment', () => {
    expect(stappen({ fouten: null, oordeel: 'opgelost', heropend: false })).toMatchObject([
      { label: LABEL_ZONDER_BEWIJS, aan: false, comment: null },
    ]);
  });

  test('leerlus-bewijs/AC-20: zonder bewijs blijft het label aan, zoals in AC-6', () => {
    expect(stappen({ fouten: null, oordeel: 'zonder-bewijs', heropend: false })).toMatchObject([
      { label: LABEL_ZONDER_BEWIJS, aan: true },
    ]);
  });

  test('leerlus-bewijs/AC-6: beoordeelSluiting kent de opgelost-tak niet: completed met een opgelost-comment blijft zonder-bewijs', async () => {
    const bron = { prs: [], reden: 'completed', comments: [comment('opgelost: ADR 0100')] };
    await expect(beoordeelSluiting(NR, bron, () => Promise.resolve(null))).resolves.toBe('zonder-bewijs');
  });

  test('leerlus-bewijs/AC-6: een gemergde PR met ## Leerpunt-regel en een achterhaald-comment gaan nog steeds voor', async () => {
    const regel = { merged: true, body: `## Leerpunt\n\n- #${String(NR)}: trede Check; bewijs test/a.test.ts` };
    const nietsOpvragen = () => Promise.resolve(null);
    await expect(
      beoordeelSluiting(NR, { prs: [regel], reden: 'completed', comments: [] }, nietsOpvragen),
    ).resolves.toBe('bewijs');
    const achterhaald = comment('achterhaald: opgelost door #520');
    await expect(
      beoordeelSluiting(NR, { prs: [], reden: 'completed', comments: [achterhaald] }, nietsOpvragen),
    ).resolves.toBe('achterhaald');
  });

  test('leerlus-bewijs/AC-13: een duplicaatsluiting blijft duplicaat', async () => {
    const doel = { number: 7, labels: [{ name: 'leerpunt' }] };
    const bron = { prs: [], reden: 'duplicate', comments: [comment('duplicaat van #7')] };
    await expect(beoordeelSluiting(NR, bron, () => Promise.resolve(doel))).resolves.toBe('duplicaat');
  });
});
