import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import * as check from '../../scripts/kit/leerpunt-check.mjs';
import * as kit from '../../scripts/kit/leerpunt.mjs';
import { exported } from '../rails/template-repo-kit';
import { type NegativeCase, expectNegativeTable } from '../support/negative-table';

// Spec leerlus-bewijs AC-22 (ADR 0101, Herzien 2026-11-24): een comment `achterhaald:` (AC-6), `duplicaat van #<nr>` (AC-13) of
// `opgelost:` (AC-20) telt alleen als `user.id` van de comment in `leerpunt.accounts` van .claude/gates.json staat.
// `author_association` beslist niet meer. Fail closed bij een ontbrekende, lege of ongeldige lijst en bij een ontbrekend id.
//
// De tester neemt deze vormen aan (de developer bouwt ze; zie het rapport):
//   - de bron van de pure functies krijgt een veld `accounts` (de lijst uit gates.json, ongevalideerd: `unknown`):
//       sluitOordeel(nummer, { prs, comments, accounts })
//       beoordeelSluiting(nummer, { prs, comments, reden, accounts }, haalDoel)
//       beoordeelOpgelost(nummer, { reden, comments, standaardBranch, accounts }, haalPr)
//   - `duplicaatDoelen(nummer, comments, accounts)` krijgt de lijst als derde parameter.
//   - elke comment is `{ body, association, id }`: `id` is `user.id` van de auteur (getal), `association` blijft meegaan maar
//     beslist niet meer. Een extra veld `login` op de comment (uit `user.login`) heeft geen invloed.
//   - een lijst telt alleen als hij een niet-lege array is waarvan ELK element een object is met een positief geheel getal als
//     `id`; één slecht element maakt de hele lijst ongeldig.
//   - `check-docs` meldt een ongeldige `leerpunt.accounts` met een melding waarvan sleutel of tekst `leerpunt` of `accounts` noemt.
const sluitOordeel = (...args: unknown[]) => exported(kit, 'sluitOordeel')(...args);
const duplicaatDoelen = (...args: unknown[]) => exported(check, 'duplicaatDoelen')(...args);
const beoordeelSluiting = (...args: unknown[]) => Promise.resolve(exported(check, 'beoordeelSluiting')(...args));
const beoordeelOpgelost = (...args: unknown[]) => Promise.resolve(exported(check, 'beoordeelOpgelost')(...args));

const NR = 9;
const ID_BRAM = 282014853;
const ID_JAN = 194213038;
const ID_ANDER = 555;
const LIJST = [
  { id: ID_BRAM, login: 'BramLambertJansen' },
  { id: ID_JAN, login: 'Jan-Bramsen' },
];
const PR_OK = { merged: true, base: { ref: 'main' } };
const DOEL = { number: 7, labels: [{ name: 'leerpunt' }] };

type Comment = Record<string, unknown>;
interface Basis {
  readonly accounts: unknown;
  readonly comment: Comment;
}

const nietsOpvragen = () => Promise.resolve(null);
const comment = (body: string, id: unknown, extra: Comment = { association: 'NONE' }): Comment => ({
  body,
  association: 'NONE',
  id,
  login: 'wie-dan-ook',
  ...extra,
});

// Rijen die voor elke soort comment gelden: elke rij maakt precies één voorwaarde onwaar op een basis waarin de comment van
// ID_BRAM telt. De basis heeft association OWNER, zodat een rij die alleen het id wijzigt ook bewijst dat OWNER niet volstaat.
const wijzig = (basis: Basis, patch: Comment): Basis => ({ ...basis, comment: { ...basis.comment, ...patch } });
const metLijst = (basis: Basis, accounts: unknown): Basis => ({ ...basis, accounts });

const ELEMENT_FOUTEN: [string, unknown][] = [
  ['een element dat null is', null],
  ['een element dat een tekst is', 'BramLambertJansen'],
  ['een element zonder id', { login: 'x' }],
  ['een element met id als tekst', { id: '1', login: 'x' }],
  ['een element met id 0', { id: 0, login: 'x' }],
  ['een element met een negatief id', { id: -5, login: 'x' }],
  ['een element met een niet-geheel id', { id: 1.5, login: 'x' }],
  ['een element met id NaN', { id: Number.NaN, login: 'x' }],
];

const COMMENT_RIJEN: readonly NegativeCase<Basis>[] = [
  {
    name: 'ander id met COLLABORATOR (was: schrijfrecht telde)',
    change: (b) => wijzig(b, { id: ID_ANDER, association: 'COLLABORATOR' }),
  },
  { name: 'ander id met MEMBER', change: (b) => wijzig(b, { id: ID_ANDER, association: 'MEMBER' }) },
  { name: 'ander id met OWNER', change: (b) => wijzig(b, { id: ID_ANDER, association: 'OWNER' }) },
  {
    name: 'login uit de lijst maar een ander id',
    change: (b) => wijzig(b, { id: ID_ANDER, association: 'COLLABORATOR', login: 'Jan-Bramsen' }),
  },
  { name: 'id ontbreekt (undefined)', change: (b) => wijzig(b, { id: undefined }) },
  { name: 'id is null', change: (b) => wijzig(b, { id: null }) },
  { name: 'id is een tekst met het getal uit de lijst', change: (b) => wijzig(b, { id: String(ID_BRAM) }) },
  { name: 'lijst ontbreekt', change: (b) => metLijst(b, undefined) },
  { name: 'lijst is leeg', change: (b) => metLijst(b, []) },
  { name: 'lijst is null', change: (b) => metLijst(b, null) },
  { name: 'lijst is een object in plaats van een array', change: (b) => metLijst(b, { id: ID_BRAM, login: 'x' }) },
  { name: 'lijst is een tekst', change: (b) => metLijst(b, '282014853') },
  ...ELEMENT_FOUTEN.map(([naam, element]) => ({
    name: `lijst met het geldige id en daarnaast ${naam}: de hele lijst is ongeldig`,
    change: (b: Basis) => metLijst(b, [...LIJST, element]),
  })),
];

const basisVoor = (body: string): Basis => ({
  accounts: LIJST,
  comment: comment(body, ID_BRAM, { association: 'OWNER', login: 'BramLambertJansen' }),
});

describe('leerlus-bewijs/AC-22 en AC-6: achterhaald telt alleen van een id uit de lijst', () => {
  const telt = ({ accounts, comment: c }: Basis) =>
    sluitOordeel(NR, { prs: [], comments: [c], accounts }) === 'achterhaald';

  test('leerlus-bewijs/AC-22 en AC-6: achterhaald van een id uit de lijst telt, ook zonder schrijfrecht-association', () => {
    for (const id of [ID_BRAM, ID_JAN]) {
      const basis = basisVoor('achterhaald: opgelost door #520');
      expect(telt(wijzig(basis, { id, association: 'NONE', login: 'hernoemd' }))).toBe(true);
    }
  });

  test('leerlus-bewijs/AC-22 en AC-6: elke rij van de tabel maakt achterhaald ongeldig, de basis telt', () => {
    expectNegativeTable({ base: basisVoor('achterhaald: opgelost door #520'), check: telt, cases: COMMENT_RIJEN });
  });

  test('leerlus-bewijs/AC-22 en AC-6: een gemergde PR met een leerpuntregel blijft bewijs zonder lijst', () => {
    const pr = { merged: true, body: `## Leerpunt\n\n- #${String(NR)}: trede Check; bewijs test/a.test.ts` };
    expect(sluitOordeel(NR, { prs: [pr], comments: [], accounts: undefined })).toBe('bewijs');
  });
});

describe('leerlus-bewijs/AC-22 en AC-13: duplicaat telt alleen van een id uit de lijst', () => {
  const doelen = ({ accounts, comment: c }: Basis) => duplicaatDoelen(NR, [c], accounts);
  const telt = (basis: Basis) => {
    const uitkomst = doelen(basis);
    return Array.isArray(uitkomst) && uitkomst.includes(7);
  };

  test('leerlus-bewijs/AC-22 en AC-13: duplicaatDoelen geeft het doel van een id uit de lijst, ook met association NONE', () => {
    for (const id of [ID_BRAM, ID_JAN])
      expect(doelen(wijzig(basisVoor('duplicaat van #7'), { id, association: 'NONE' }))).toStrictEqual([7]);
  });

  test('leerlus-bewijs/AC-22 en AC-13: elke rij van de tabel maakt het duplicaat ongeldig, de basis telt', () => {
    expectNegativeTable({ base: basisVoor('duplicaat van #7'), check: telt, cases: COMMENT_RIJEN });
  });

  test('leerlus-bewijs/AC-22 en AC-13: beoordeelSluiting geeft duplicaat voor een id uit de lijst met association NONE', async () => {
    const bron = { prs: [], reden: 'duplicate', accounts: LIJST, comments: [comment('duplicaat van #7', ID_JAN)] };
    await expect(beoordeelSluiting(NR, bron, () => Promise.resolve(DOEL))).resolves.toBe('duplicaat');
  });

  test.each([
    ['ander id met COLLABORATOR', LIJST, comment('duplicaat van #7', ID_ANDER, { association: 'COLLABORATOR' })],
    [
      'login uit de lijst, ander id',
      LIJST,
      comment('duplicaat van #7', ID_ANDER, { association: 'OWNER', login: 'BramLambertJansen' }),
    ],
    ['id ontbreekt', LIJST, comment('duplicaat van #7', undefined, { association: 'OWNER' })],
    ['lijst ontbreekt', undefined, comment('duplicaat van #7', ID_BRAM, { association: 'OWNER' })],
    ['lijst is leeg', [], comment('duplicaat van #7', ID_BRAM, { association: 'OWNER' })],
    ['lijst is ongeldig', [{ id: '282014853' }], comment('duplicaat van #7', ID_BRAM, { association: 'OWNER' })],
  ])('leerlus-bewijs/AC-22 en AC-13: beoordeelSluiting telt niet, zonder crash: %s', async (_naam, accounts, c) => {
    const bron = { prs: [], reden: 'duplicate', accounts, comments: [c] };
    await expect(beoordeelSluiting(NR, bron, () => Promise.resolve(DOEL))).resolves.toBe('zonder-bewijs');
  });

  test('leerlus-bewijs/AC-22 en AC-6: beoordeelSluiting geeft achterhaald voor een id uit de lijst en niet voor een ander id', async () => {
    const achterhaald = (id: unknown, association: string) => ({
      prs: [],
      reden: 'completed',
      accounts: LIJST,
      comments: [comment('achterhaald: opgelost door #520', id, { association })],
    });
    await expect(beoordeelSluiting(NR, achterhaald(ID_BRAM, 'NONE'), nietsOpvragen)).resolves.toBe('achterhaald');
    await expect(beoordeelSluiting(NR, achterhaald(ID_ANDER, 'COLLABORATOR'), nietsOpvragen)).resolves.toBe(
      'zonder-bewijs',
    );
  });
});

describe('leerlus-bewijs/AC-22 en AC-20: opgelost telt alleen van een id uit de lijst', () => {
  type Bron = { accounts: unknown; comments: Comment[] };
  const oordeel = (bron: Bron) =>
    beoordeelOpgelost(NR, { reden: 'completed', standaardBranch: 'main', ...bron }, () => Promise.resolve(PR_OK));
  const opgelost = (accounts: unknown, c: Comment) => oordeel({ accounts, comments: [c] });

  test.each([
    ['Bram, association NONE', ID_BRAM, 'NONE'],
    ['Jan, association NONE', ID_JAN, 'NONE'],
    ['Jan, association OWNER', ID_JAN, 'OWNER'],
  ])('leerlus-bewijs/AC-22 en AC-20: een id uit de lijst telt: %s', async (_naam, id, association) => {
    await expect(opgelost(LIJST, comment('opgelost: #834', id, { association }))).resolves.toBe('opgelost');
  });

  test('leerlus-bewijs/AC-22 en AC-20: een geldige comment van een id uit de lijst na een ongeldige van een ander id telt', async () => {
    const comments = [
      comment('opgelost: #834', ID_ANDER, { association: 'COLLABORATOR' }),
      comment('opgelost: #834', ID_JAN, { association: 'NONE' }),
    ];
    await expect(oordeel({ accounts: LIJST, comments })).resolves.toBe('opgelost');
  });

  test.each([
    ['ander id met COLLABORATOR', LIJST, comment('opgelost: ADR 0100', ID_ANDER, { association: 'COLLABORATOR' })],
    ['ander id met MEMBER', LIJST, comment('opgelost: ADR 0100', ID_ANDER, { association: 'MEMBER' })],
    ['ander id met OWNER', LIJST, comment('opgelost: ADR 0100', ID_ANDER, { association: 'OWNER' })],
    [
      'login uit de lijst, ander id',
      LIJST,
      comment('opgelost: ADR 0100', ID_ANDER, { association: 'OWNER', login: 'Jan-Bramsen' }),
    ],
    ['id ontbreekt', LIJST, comment('opgelost: ADR 0100', undefined, { association: 'OWNER' })],
    ['id is null', LIJST, comment('opgelost: ADR 0100', null, { association: 'OWNER' })],
    ['lijst ontbreekt', undefined, comment('opgelost: ADR 0100', ID_BRAM, { association: 'OWNER' })],
    ['lijst is leeg', [], comment('opgelost: ADR 0100', ID_BRAM, { association: 'OWNER' })],
    ['lijst is null', null, comment('opgelost: ADR 0100', ID_BRAM, { association: 'OWNER' })],
    ['lijst is geen array', { id: ID_BRAM }, comment('opgelost: ADR 0100', ID_BRAM, { association: 'OWNER' })],
    ...ELEMENT_FOUTEN.map(([naam, element]): [string, unknown, Comment] => [
      `lijst met het geldige id en daarnaast ${naam}`,
      [...LIJST, element],
      comment('opgelost: ADR 0100', ID_BRAM, { association: 'OWNER' }),
    ]),
  ])('leerlus-bewijs/AC-22 en AC-20: telt niet, zonder crash: %s', async (_naam, accounts, c) => {
    await expect(opgelost(accounts, c)).resolves.toBe('zonder-bewijs');
  });
});

// De vormregel van check-docs voor `leerpunt.accounts` op een fixture-gates.json. De fixture is een minimale repo zoals in
// test/rails/check-docs-onderhoud.test.ts; alleen meldingen die `leerpunt` of `accounts` noemen tellen mee.
function fixtureRepo(leerpunt: unknown, metSleutel = true): string {
  const root = mkdtempSync(path.join(tmpdir(), 'leerpunt-eigenaar-'));
  const gates = {
    gates: [],
    voorReview: [],
    jsonGates: { 'package.json': ['scripts'] },
    onderhoud: { repository: 'o/template' },
    template: { repository: 'o/template' },
    ...(metSleutel ? { leerpunt } : {}),
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': '/package.json @eigenaar\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: [] } }),
    '.claude/gates.json': JSON.stringify(gates),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function accountsMeldingen(root: string) {
  const alle = await docsViolations(root);
  return alle.filter(({ key, message }) => /leerpunt|accounts/i.test(`${key} ${message}`)).map(({ key }) => key);
}

describe('leerlus-bewijs/AC-22: check-docs toetst de vorm van leerpunt.accounts', () => {
  test.each([
    ['geldige lijst met twee accounts', { accounts: LIJST }],
    ['geldige lijst met één account', { accounts: [{ id: 1, login: 'x' }] }],
  ])('leerlus-bewijs/AC-22: groen: %s', async (_naam, leerpunt) => {
    expect(await accountsMeldingen(fixtureRepo(leerpunt))).toStrictEqual([]);
  });

  test('leerlus-bewijs/AC-22: de sleutel leerpunt ontbreekt: check-docs meldt niets (de vorm wordt getoetst als hij bestaat)', async () => {
    expect(await accountsMeldingen(fixtureRepo(undefined, false))).toStrictEqual([]);
  });

  test.each([
    ['leerpunt zonder accounts', {}],
    ['accounts is geen lijst', { accounts: { id: 1, login: 'x' } }],
    ['accounts is een tekst', { accounts: '282014853' }],
    ['id is een tekst', { accounts: [{ id: '282014853', login: 'x' }] }],
    ['id is 0', { accounts: [{ id: 0, login: 'x' }] }],
    ['id is negatief', { accounts: [{ id: -1, login: 'x' }] }],
    ['id is niet geheel', { accounts: [{ id: 1.5, login: 'x' }] }],
    ['id ontbreekt', { accounts: [{ login: 'x' }] }],
    ['element is geen object', { accounts: [282014853] }],
    ['element is null', { accounts: [null] }],
    ['element met een extra sleutel', { accounts: [{ id: 1, login: 'x', rol: 'eigenaar' }] }],
    ['geldig element en een ongeldig element', { accounts: [...LIJST, { id: 'x', login: 'y' }] }],
  ])('leerlus-bewijs/AC-22: rood: %s', async (_naam, leerpunt) => {
    expect(await accountsMeldingen(fixtureRepo(leerpunt))).not.toStrictEqual([]);
  });
});
