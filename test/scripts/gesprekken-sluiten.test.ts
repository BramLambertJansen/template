import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import * as prMerge from '../../scripts/kit/pr-merge.mjs';
import { expectNegativeTable } from '../support/negative-table.ts';

// `expectNegativeTable` gooit een gewone Error met de rijen die niet bewaakt worden; hier wordt dat een assertie op die melding.
function verwachtTabel<B>(tabel: Parameters<typeof expectNegativeTable<B>>[0]): void {
  let melding = '';
  try {
    expectNegativeTable(tabel);
  } catch (error) {
    melding = error instanceof Error ? error.message : String(error);
  }
  expect(melding, 'elke rij van de negatieve tabel wordt bewaakt').toBe('');
}

// spec botgesprekken-sluiten (docs/template/specs/botgesprekken-sluiten.md, ADR 0098), tests vóór de bouw: het script
// scripts/kit/pr-resolve.mjs (nog niet aanwezig) sluit beantwoorde en verouderde botgesprekken. AC-1 en AC-2 toetsen de pure
// functie `gesprekRedenen(gesprek)`, AC-3 tot en met AC-5 `sluitGesprekken({ rest, graphql }, { repo, nummer, head })` met een
// nep-`rest` en een nep-`graphql`, AC-6 de uitvoer en `nummerUit(args, 'pr:resolve')`. AC-7 tot en met AC-11 staan in
// test/hooks/rolhek-gesprekken-sluiten.test.ts; AC-12 is bewijs, geen test.
//
// Afspraken die de bouw volgt (ze volgen uit de spec, maar de spec noemt geen exacte vorm):
// - het script wordt dynamisch geladen (zoals test/rails/codeowners-templateregime.test.ts), zodat dit bestand compileert en
//   elke test op een assertie faalt zolang het script ontbreekt;
// - `gesprekRedenen` geeft een lijst met hoogstens één reden (leeg = sluitbaar), `sluitGesprekken` geeft `{ uit, fout, code }`
//   met `uit` en `fout` als lijst van regels (zonder regeleinde) en `code` als getal; de uitkomst mag ook een belofte zijn;
// - in de nep-`graphql` is een aanroep een mutatie als de query met `mutation` begint of de variabelen `threadId` hebben, en
//   anders een leesaanroep; een lezing van pagina n+1 krijgt `after` gelijk aan `CURSOR_<n>`;
// - een 404 van GitHub is in de nep-`rest` een Error met "HTTP 404" in de melding (zo meldt `gh api` het).
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/kit/pr-resolve.mjs');
const REPO = 'BramLambertJansen/template';
const APP = 'eigenaar/app';
const NR = 12;
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ANDERE_HEAD = 'c'.repeat(40);
const NIET_GEVONDEN = new Error('gh: Not Found (HTTP 404)');

type Obj = Record<string, unknown>;
type Wereld = Record<string, unknown>;
type Variabelen = Record<string, unknown>;

function alsObject(ruw: unknown): Obj {
  if (typeof ruw !== 'object' || ruw === null || Array.isArray(ruw)) throw new Error('verwacht een object');
  return Object.fromEntries(Object.entries(ruw));
}

const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

// De padtabel van de template: de echte gates.json met `onderhoud.repository` gelijk aan REPO en modus niet-kritiek.
// Dezelfde tabel zonder `onderhoud` is die van een app (zoals in test/scripts/pr-merge-samenvoegen.test.ts).
const ECHT: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'));
const TEMPLATE_TABEL = { ...alsObject(ECHT), merge: 'niet-kritiek', onderhoud: { repository: REPO } };
const APP_TABEL = Object.fromEntries(Object.entries(TEMPLATE_TABEL).filter(([sleutel]) => sleutel !== 'onderhoud'));

// ---------------------------------------------------------------------------------------------------------------------------
// Het script laden, zonder statische import.

async function laadModule(): Promise<object | null> {
  try {
    const module: unknown = await import(pathToFileURL(SCRIPT).href);
    return typeof module === 'object' ? module : null;
  } catch {
    return null;
  }
}

async function laadExport(naam: string): Promise<(...args: unknown[]) => unknown> {
  const module = await laadModule();
  expect(module, 'scripts/kit/pr-resolve.mjs bestaat en laadt').not.toBeNull();
  const functie: unknown = module === null ? undefined : Reflect.get(module, naam);
  expect(typeof functie, `${naam} is een export van scripts/kit/pr-resolve.mjs`).toBe('function');
  if (typeof functie !== 'function') throw new Error(`${naam} ontbreekt`);
  return (...args) => {
    const uitkomst: unknown = Reflect.apply(functie, undefined, args);
    return uitkomst;
  };
}

function tekstLijst(waarde: unknown, naam: string): string[] {
  expect(Array.isArray(waarde), `${naam} is een lijst met regels`).toBe(true);
  return Array.isArray(waarde) ? waarde.filter((regel): regel is string => typeof regel === 'string') : [];
}

async function redenenFunctie(): Promise<(gesprek: unknown) => string[]> {
  const functie = await laadExport('gesprekRedenen');
  return (gesprek) => tekstLijst(functie(gesprek), 'gesprekRedenen geeft een lijst; die');
}

interface Uitkomst {
  uit: string[];
  fout: string[];
  code: number;
}

function alsUitkomst(waarde: unknown): Uitkomst {
  expect(typeof waarde === 'object' && waarde !== null, 'sluitGesprekken geeft { uit, fout, code }').toBe(true);
  const uitkomst = typeof waarde === 'object' && waarde !== null ? waarde : {};
  const code: unknown = Reflect.get(uitkomst, 'code');
  expect(typeof code, 'code is een getal').toBe('number');
  return {
    uit: tekstLijst(Reflect.get(uitkomst, 'uit'), 'uit'),
    fout: tekstLijst(Reflect.get(uitkomst, 'fout'), 'fout'),
    code: typeof code === 'number' ? code : -1,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// De gesprekken: de vorm van de gemeten leesquery op #803 (bot `NONE`, antwoord `OWNER`, `state` `SUBMITTED`).

const urlVan = (n: number) => `https://github.com/${REPO}/pull/${String(NR)}#discussion_r${String(4000 + n)}`;
const idVan = (n: number) => `PRRT_${String(n)}`;
const padVan = (n: number) => `docs/bestand${String(n)}.md`;

function opmerking(n: number, volgnr: number, auteur: Obj): Obj {
  return {
    url: volgnr === 0 ? urlVan(n) : `${urlVan(n)}-${String(volgnr)}`,
    state: 'SUBMITTED',
    createdAt: `2026-11-18T16:${String(10 + volgnr)}:00Z`,
    authorAssociation: 'NONE',
    author: { __typename: 'Bot', login: 'review-bot' },
    ...auteur,
  };
}

const bot = (n: number, volgnr: number, extra: Obj = {}) => opmerking(n, volgnr, extra);
const gebruiker = (n: number, volgnr: number, extra: Obj = {}) =>
  opmerking(n, volgnr, {
    author: { __typename: 'User', login: 'BramLambertJansen' },
    authorAssociation: 'OWNER',
    ...extra,
  });

function gesprek(n: number, nodes: unknown[], extra: Obj = {}): Obj {
  return {
    id: idVan(n),
    isResolved: false,
    isOutdated: true,
    viewerCanResolve: true,
    path: padVan(n),
    comments: { totalCount: nodes.length, pageInfo: { hasNextPage: false }, nodes },
    ...extra,
  };
}

// Een sluitbaar gesprek: een bot opent, de eigenaar antwoordt, de regel is verouderd, GitHub staat sluiten toe.
const sluitbaar = (n = 1, extra: Obj = {}) => gesprek(n, [bot(n, 0), gebruiker(n, 1)], extra);

function nodesVan(g: Obj): Obj[] {
  const nodes = alsObject(g['comments'])['nodes'];
  if (!Array.isArray(nodes)) throw new Error('comments.nodes is geen lijst');
  return nodes.map((node: unknown) => alsObject(node));
}

const metNodes = (g: Obj, nodes: unknown[]): Obj => ({
  ...g,
  comments: { ...alsObject(g['comments']), nodes, totalCount: nodes.length },
});
const metComments = (g: Obj, aanpassing: Obj): Obj => ({
  ...g,
  comments: { ...alsObject(g['comments']), ...aanpassing },
});
const metOpmerking = (g: Obj, index: number, patch: Obj): Obj =>
  metNodes(
    g,
    nodesVan(g).map((node, i) => (i === index ? { ...node, ...patch } : node)),
  );

// ---------------------------------------------------------------------------------------------------------------------------
// AC-1 en AC-2: gesprekRedenen.

const NIET_TE_LEZEN = 'niet te lezen';
const NIET_BOT = 'niet geopend door een bot; de eigenaar sluit het';
const GEEN_ANTWOORD = 'geen antwoord na de laatste opmerking van een bot';
const NIET_VEROUDERD = 'niet verouderd: de regel is niet gewijzigd';
const KAN_NIET = 'GitHub staat sluiten niet toe';
const MISLUKT = 'sluiten mislukt';

interface Rij {
  naam: string;
  verander: (basis: Obj) => Obj;
  reden: string;
}

const alsMens = { author: { __typename: 'User', login: 'mens' }, authorAssociation: 'OWNER' };
const andereBot = { author: { __typename: 'Bot', login: 'andere-bot' }, authorAssociation: 'OWNER' };

const AC1_RIJEN: Rij[] = [
  { naam: 'de eerste opmerking is van een gebruiker', verander: (b) => metOpmerking(b, 0, alsMens), reden: NIET_BOT },
  {
    naam: 'de eerste opmerking heeft geen author',
    verander: (b) => metOpmerking(b, 0, { author: null }),
    reden: NIET_BOT,
  },
  {
    naam: 'de eerste opmerking heeft een ander typename (Organization)',
    verander: (b) => metOpmerking(b, 0, { author: { __typename: 'Organization' } }),
    reden: NIET_BOT,
  },
  { naam: 'er is geen antwoord', verander: (b) => metNodes(b, [bot(1, 0)]), reden: GEEN_ANTWOORD },
  {
    naam: 'de bot reageert opnieuw na het antwoord',
    verander: (b) => metNodes(b, [bot(1, 0), gebruiker(1, 1), bot(1, 2)]),
    reden: GEEN_ANTWOORD,
  },
  {
    naam: 'het antwoord is van een andere bot (ook met associatie OWNER)',
    verander: (b) => metOpmerking(b, 1, andereBot),
    reden: GEEN_ANTWOORD,
  },
  ...['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR'].map((associatie) => ({
    naam: `het antwoord is van een gebruiker met associatie ${associatie}`,
    verander: (b: Obj) => metOpmerking(b, 1, { authorAssociation: associatie }),
    reden: GEEN_ANTWOORD,
  })),
  {
    naam: 'het antwoord heeft geen author',
    verander: (b) => metOpmerking(b, 1, { author: null }),
    reden: GEEN_ANTWOORD,
  },
  {
    naam: 'het antwoord heeft een ander typename (Organization)',
    verander: (b) => metOpmerking(b, 1, { author: { __typename: 'Organization' } }),
    reden: GEEN_ANTWOORD,
  },
  { naam: 'de regel is niet verouderd', verander: (b) => ({ ...b, isOutdated: false }), reden: NIET_VEROUDERD },
  { naam: 'GitHub staat sluiten niet toe', verander: (b) => ({ ...b, viewerCanResolve: false }), reden: KAN_NIET },
];

const AC2_RIJEN: Rij[] = [
  { naam: 'id is leeg', verander: (b) => ({ ...b, id: '' }), reden: NIET_TE_LEZEN },
  { naam: 'id is geen tekst', verander: (b) => ({ ...b, id: 7 }), reden: NIET_TE_LEZEN },
  { naam: 'id ontbreekt', verander: (b) => ({ ...b, id: undefined }), reden: NIET_TE_LEZEN },
  { naam: 'isResolved is true', verander: (b) => ({ ...b, isResolved: true }), reden: NIET_TE_LEZEN },
  { naam: 'isResolved is tekst', verander: (b) => ({ ...b, isResolved: 'false' }), reden: NIET_TE_LEZEN },
  { naam: 'isResolved ontbreekt', verander: (b) => ({ ...b, isResolved: undefined }), reden: NIET_TE_LEZEN },
  { naam: 'isOutdated is tekst', verander: (b) => ({ ...b, isOutdated: 'true' }), reden: NIET_TE_LEZEN },
  { naam: 'isOutdated ontbreekt', verander: (b) => ({ ...b, isOutdated: undefined }), reden: NIET_TE_LEZEN },
  { naam: 'viewerCanResolve is null', verander: (b) => ({ ...b, viewerCanResolve: null }), reden: NIET_TE_LEZEN },
  { naam: 'viewerCanResolve is tekst', verander: (b) => ({ ...b, viewerCanResolve: 'true' }), reden: NIET_TE_LEZEN },
  { naam: 'path is geen tekst', verander: (b) => ({ ...b, path: 7 }), reden: NIET_TE_LEZEN },
  { naam: 'path ontbreekt', verander: (b) => ({ ...b, path: undefined }), reden: NIET_TE_LEZEN },
  { naam: 'comments ontbreekt', verander: (b) => ({ ...b, comments: undefined }), reden: NIET_TE_LEZEN },
  {
    naam: 'comments.nodes is geen lijst',
    verander: (b) => metComments(b, { nodes: 'geen lijst' }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'comments.nodes is leeg', verander: (b) => metNodes(b, []), reden: NIET_TE_LEZEN },
  {
    naam: 'totalCount is groter dan het aantal nodes',
    verander: (b) => metComments(b, { totalCount: 3 }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'totalCount ontbreekt', verander: (b) => metComments(b, { totalCount: undefined }), reden: NIET_TE_LEZEN },
  {
    naam: 'er zijn meer dan 100 opmerkingen (hasNextPage true)',
    verander: (b) => metComments(b, { pageInfo: { hasNextPage: true } }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'hasNextPage ontbreekt', verander: (b) => metComments(b, { pageInfo: {} }), reden: NIET_TE_LEZEN },
  { naam: 'url is geen tekst', verander: (b) => metOpmerking(b, 1, { url: 7 }), reden: NIET_TE_LEZEN },
  { naam: 'url ontbreekt', verander: (b) => metOpmerking(b, 1, { url: undefined }), reden: NIET_TE_LEZEN },
  {
    naam: 'authorAssociation is geen tekst',
    verander: (b) => metOpmerking(b, 1, { authorAssociation: 7 }),
    reden: NIET_TE_LEZEN,
  },
  {
    naam: 'authorAssociation ontbreekt',
    verander: (b) => metOpmerking(b, 0, { authorAssociation: undefined }),
    reden: NIET_TE_LEZEN,
  },
  {
    naam: 'createdAt is geen ISO-tijd',
    verander: (b) => metOpmerking(b, 1, { createdAt: 'gisteren' }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'createdAt is leeg', verander: (b) => metOpmerking(b, 1, { createdAt: '' }), reden: NIET_TE_LEZEN },
  { naam: 'createdAt is een getal', verander: (b) => metOpmerking(b, 1, { createdAt: 12345 }), reden: NIET_TE_LEZEN },
  { naam: 'createdAt ontbreekt', verander: (b) => metOpmerking(b, 1, { createdAt: undefined }), reden: NIET_TE_LEZEN },
  {
    naam: 'createdAt heeft een maand 13',
    verander: (b) => metOpmerking(b, 1, { createdAt: '2026-13-45T00:00:00Z' }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'author is een leeg object', verander: (b) => metOpmerking(b, 1, { author: {} }), reden: NIET_TE_LEZEN },
  {
    naam: 'author.__typename is geen tekst',
    verander: (b) => metOpmerking(b, 0, { author: { __typename: 5 } }),
    reden: NIET_TE_LEZEN,
  },
  {
    naam: 'author is tekst',
    verander: (b) => metOpmerking(b, 1, { author: 'BramLambertJansen' }),
    reden: NIET_TE_LEZEN,
  },
  {
    naam: 'state is PENDING (conceptopmerking)',
    verander: (b) => metOpmerking(b, 1, { state: 'PENDING' }),
    reden: NIET_TE_LEZEN,
  },
  { naam: 'state ontbreekt', verander: (b) => metOpmerking(b, 1, { state: undefined }), reden: NIET_TE_LEZEN },
  {
    naam: 'createdAt daalt in de volgorde van nodes',
    verander: (b) => metOpmerking(b, 1, { createdAt: '2026-11-18T15:00:00Z' }),
    reden: NIET_TE_LEZEN,
  },
];

describe('botgesprekken-sluiten/AC-1 gesprekRedenen: de eerste reden die faalt', () => {
  test('botgesprekken-sluiten/AC-1: een sluitbaar gesprek geeft geen reden', async () => {
    const redenen = await redenenFunctie();
    expect(redenen(sluitbaar())).toStrictEqual([]);
  });

  test.each(['OWNER', 'MEMBER', 'COLLABORATOR'])(
    'botgesprekken-sluiten/AC-1: een antwoord van een gebruiker met associatie %s sluit het gesprek',
    async (associatie) => {
      const redenen = await redenenFunctie();
      expect(redenen(metOpmerking(sluitbaar(), 1, { authorAssociation: associatie }))).toStrictEqual([]);
    },
  );

  test.each([
    ['een tweede botopmerking vóór het antwoord', [bot(1, 0), bot(1, 1), gebruiker(1, 2)]],
    ['een antwoord na de tweede botopmerking', [bot(1, 0), gebruiker(1, 1), bot(1, 2), gebruiker(1, 3)]],
    ['twee antwoorden', [bot(1, 0), gebruiker(1, 1), gebruiker(1, 2, { authorAssociation: 'NONE' })]],
  ])('botgesprekken-sluiten/AC-1: %s: geen reden', async (_naam, nodes) => {
    const redenen = await redenenFunctie();
    expect(redenen(metNodes(sluitbaar(), nodes))).toStrictEqual([]);
  });

  test.each(AC1_RIJEN.map((rij) => [rij.naam, rij.verander, rij.reden] as const))(
    'botgesprekken-sluiten/AC-1: %s: precies die ene reden',
    async (_naam, verander, reden) => {
      const redenen = await redenenFunctie();
      expect(redenen(verander(sluitbaar()))).toStrictEqual([reden]);
    },
  );

  test('botgesprekken-sluiten/AC-1: elke voorwaarde maakt het gesprek onsluitbaar (negatieve tabel)', async () => {
    const redenen = await redenenFunctie();
    verwachtTabel({
      base: sluitbaar(),
      check: (gesprek) => redenen(gesprek).length === 0,
      cases: AC1_RIJEN.map((rij) => ({ name: rij.naam, change: rij.verander })),
    });
  });

  test('botgesprekken-sluiten/AC-1: bij meer falende voorwaarden telt alleen de eerste, in de vaste volgorde', async () => {
    const redenen = await redenenFunctie();
    const nietTeLezen = {
      ...metOpmerking(sluitbaar(), 0, alsMens),
      id: '',
      isOutdated: false,
      viewerCanResolve: false,
    };
    const nietBot = { ...metOpmerking(sluitbaar(), 0, alsMens), isOutdated: false, viewerCanResolve: false };
    const zonderAntwoord = { ...metNodes(sluitbaar(), [bot(1, 0)]), isOutdated: false, viewerCanResolve: false };
    const nietVerouderd = { ...sluitbaar(), isOutdated: false, viewerCanResolve: false };
    expect(redenen(nietTeLezen)).toStrictEqual([NIET_TE_LEZEN]);
    expect(redenen(nietBot)).toStrictEqual([NIET_BOT]);
    expect(redenen(zonderAntwoord)).toStrictEqual([GEEN_ANTWOORD]);
    expect(redenen(nietVerouderd)).toStrictEqual([NIET_VEROUDERD]);
  });
});

describe('botgesprekken-sluiten/AC-2 gesprekRedenen: niet te lezen', () => {
  test.each(AC2_RIJEN.map((rij) => [rij.naam, rij.verander] as const))(
    'botgesprekken-sluiten/AC-2: %s: niet te lezen',
    async (_naam, verander) => {
      const redenen = await redenenFunctie();
      expect(redenen(verander(sluitbaar()))).toStrictEqual([NIET_TE_LEZEN]);
    },
  );

  test('botgesprekken-sluiten/AC-2: elke leesvoorwaarde maakt het gesprek onsluitbaar (negatieve tabel)', async () => {
    const redenen = await redenenFunctie();
    verwachtTabel({
      base: sluitbaar(),
      check: (gesprek) => redenen(gesprek).length === 0,
      cases: AC2_RIJEN.map((rij) => ({ name: rij.naam, change: rij.verander })),
    });
  });

  test('botgesprekken-sluiten/AC-2: een opmerking zonder author en een gelijke createdAt zijn wel leesbaar', async () => {
    const redenen = await redenenFunctie();
    const zonderAuthor = metNodes(sluitbaar(), [bot(1, 0), gebruiker(1, 1), gebruiker(1, 2, { author: null })]);
    expect(redenen(zonderAuthor)).toStrictEqual([]);
    expect(redenen(metOpmerking(sluitbaar(), 1, { createdAt: '2026-11-18T16:10:00Z' }))).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// De nep-API's voor sluitGesprekken.

const sleutel = (rest: string, repo = REPO) => `repos/${repo}/${rest}`;
const bestanden = (...paden: string[]) => paden.map((filename) => ({ filename, status: 'modified' }));
const zet = (wereld: Wereld, endpoint: string, waarde: unknown): Wereld => ({ ...wereld, [endpoint]: waarde });

// Wat het script en `padRedenen` lezen: de kop van main, gates.json en gates.app.json op die SHA en de bestanden van de PR.
function restWereld(repo = REPO, tabel: unknown = TEMPLATE_TABEL): Wereld {
  return {
    [sleutel('branches/main', repo)]: { commit: { sha: MAIN } },
    [sleutel(`contents/.claude/gates.json?ref=${MAIN}`, repo)]: { content: b64(tabel) },
    [sleutel(`contents/.claude/gates.app.json?ref=${MAIN}`, repo)]: NIET_GEVONDEN,
    [sleutel(`pulls/${String(NR)}/files`, repo)]: bestanden('src/web/x.tsx'),
  };
}

function nepRest(wereld: Wereld, gelezen: string[]) {
  return (endpoint: string): unknown => {
    const zonderPagina = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    gelezen.push(zonderPagina);
    if (!(zonderPagina in wereld)) throw new Error(`onbekend endpoint ${zonderPagina}`);
    const waarde = wereld[zonderPagina];
    if (waarde instanceof Error) throw waarde;
    return waarde;
  };
}

const lukt = (variabelen: Variabelen): unknown => ({
  data: { resolveReviewThread: { thread: { id: variabelen['threadId'], isResolved: true } } },
});

interface NepGraphql {
  graphql: (query: string, variabelen: unknown) => unknown;
  leest: Variabelen[];
  mutaties: Variabelen[];
  volgorde: string[];
  leesTeksten: string[];
  sluitTeksten: string[];
}

// Pagina n+1 hoort bij `after` gelijk aan `CURSOR_<n>`; `null` is pagina 1. Een Error in `paginas` wordt gegooid.
function paginaIndex(after: unknown): number {
  if (after === null) return 0;
  const cursor = typeof after === 'string' ? /^CURSOR_(\d+)$/.exec(after)?.[1] : undefined;
  if (cursor === undefined) throw new Error('onbekende cursor');
  return Number(cursor) + 1;
}

function nepGraphql(paginas: readonly unknown[], mutatie: (v: Variabelen) => unknown = lukt): NepGraphql {
  const nep: NepGraphql = {
    graphql: () => undefined,
    leest: [],
    mutaties: [],
    volgorde: [],
    leesTeksten: [],
    sluitTeksten: [],
  };
  nep.graphql = (query, variabelen) => {
    const v = alsObject(variabelen);
    if (/^\s*mutation\b/.test(query) || 'threadId' in v) {
      nep.mutaties.push(v);
      nep.volgorde.push('sluit');
      nep.sluitTeksten.push(query);
      return mutatie(v);
    }
    nep.leest.push(v);
    nep.volgorde.push('lees');
    nep.leesTeksten.push(query);
    const pagina = paginas[paginaIndex(v['after'])];
    if (pagina instanceof Error) throw pagina;
    return pagina;
  };
  return nep;
}

interface Aanpas {
  pr?: Obj;
  threads?: Obj;
  pageInfo?: Obj;
}

// Eén pagina van het antwoord op de leesquery, in de gemeten vorm.
function pagina(nodes: unknown[], aanpas: Aanpas = {}): Obj {
  const { pr = {}, threads = {}, pageInfo = {} } = aanpas;
  return {
    data: {
      repository: {
        pullRequest: {
          state: 'OPEN',
          isCrossRepository: false,
          baseRefName: 'main',
          headRefOid: HEAD,
          reviewThreads: {
            totalCount: nodes.length,
            pageInfo: { hasNextPage: false, endCursor: 'EINDE', ...pageInfo },
            nodes,
            ...threads,
          },
          ...pr,
        },
      },
    },
  };
}

// Meer pagina's: `groepen[i]` zijn de gesprekken van pagina i+1; `aanpas(i)` past pagina i+1 aan.
function metPaginas(groepen: unknown[][], aanpas: (index: number) => Aanpas = () => ({})): unknown[] {
  const totaal = groepen.flat().length;
  return groepen.map((nodes, index) => {
    const extra = aanpas(index);
    return pagina(nodes, {
      pr: extra.pr ?? {},
      threads: { totalCount: totaal, ...extra.threads },
      pageInfo: { hasNextPage: index < groepen.length - 1, endCursor: `CURSOR_${String(index)}`, ...extra.pageInfo },
    });
  });
}

interface Opties {
  paginas?: readonly unknown[];
  wereld?: Wereld;
  head?: string;
  repo?: string;
  mutatie?: (v: Variabelen) => unknown;
}

interface Run extends NepGraphql {
  uitkomst: Uitkomst;
  gelezen: string[];
}

async function draai(opties: Opties = {}): Promise<Run> {
  const sluit = await laadExport('sluitGesprekken');
  const repo = opties.repo ?? REPO;
  const gelezen: string[] = [];
  const nep = nepGraphql(opties.paginas ?? [pagina([sluitbaar(1), sluitbaar(2)])], opties.mutatie);
  const rest = nepRest(opties.wereld ?? restWereld(repo, repo === APP ? APP_TABEL : TEMPLATE_TABEL), gelezen);
  const uitkomst = alsUitkomst(
    await sluit({ rest, graphql: nep.graphql }, { repo, nummer: NR, head: opties.head ?? HEAD }),
  );
  return { ...nep, uitkomst, gelezen };
}

const KOP = 'Geen gesprek gesloten (ADR 0098):';
const gesloten = (n: number) => `- gesloten: ${padVan(n)} (${urlVan(n)})`;
const open = (n: number, reden: string) => `- open: ${padVan(n)} (${urlVan(n)}): ${reden}`;
const slot = (gesloten: number, open: number, was: number) =>
  `PR #${String(NR)}: ${String(gesloten)} gesloten, ${String(open)} open, ${String(was)} waren al gesloten.`;

// Een stop: de kop en per reden een regel op stderr, niets op stdout, exit 1 en nul mutaties.
function verwachtStop(run: Run, ...redenen: string[]): void {
  expect(run.uitkomst.fout).toStrictEqual([KOP, ...redenen.map((reden) => `- ${reden}`)]);
  expect(run.uitkomst.uit).toStrictEqual([]);
  expect(run.uitkomst.code).toBe(1);
  expect(run.mutaties).toStrictEqual([]);
}

// ---------------------------------------------------------------------------------------------------------------------------
// AC-3: de drie trappen vóór enige mutatie.

const GEEN_HEAD = 'geen geldige lokale HEAD';
const GEEN_MAIN = 'de kop van main is niet leesbaar';
const MODUS = 'de modus op main is niet "niet-kritiek": de eigenaar sluit de gesprekken';
const ONLEESBAAR_PR = 'de PR of de gesprekken zijn niet te lezen';
const TE_VEEL = 'meer dan 1000 gesprekken: de eigenaar sluit ze';
const NIET_OPEN = 'de PR is niet open';
const BASIS = 'de basis is niet main';
const FORK = 'de head staat niet in deze repository (fork)';
const kopVan = (prHead: string) => `de head van de PR (${prHead}) is niet de lokale HEAD (${HEAD.slice(0, 7)})`;
const beschermd = (paden: string) => `raakt een beschermd pad (${paden}): de eigenaar voegt samen`;
const PAD_ONLEESBAAR = 'de bestanden van de PR of de padtabel op main zijn niet te lezen: de eigenaar voegt samen';

describe('botgesprekken-sluiten/AC-3 trap 1: lokale HEAD, kop van main en modus', () => {
  test.each([
    ['leeg', ''],
    ['te kort', 'abc'],
    ['geen hex-tekens', 'g'.repeat(40)],
    ['41 tekens', 'a'.repeat(41)],
  ])(
    'botgesprekken-sluiten/AC-3: een lokale HEAD die %s is geen geldige lokale HEAD, zonder iets te lezen',
    async (_naam, head) => {
      const run = await draai({ head });
      verwachtStop(run, GEEN_HEAD);
      expect(run.gelezen).toStrictEqual([]);
      expect(run.leest).toStrictEqual([]);
    },
  );

  test.each([
    ['rest gooit', new Error('gh: HTTP 502')],
    ['het antwoord is leeg', {}],
    ['geen object', null],
    ['de sha is te kort', { commit: { sha: 'abc' } }],
    ['de sha heeft geen hex-tekens', { commit: { sha: 'z'.repeat(40) } }],
  ])('botgesprekken-sluiten/AC-3: de kop van main is niet leesbaar als %s', async (_naam, antwoord) => {
    const run = await draai({ wereld: zet(restWereld(), sleutel('branches/main'), antwoord) });
    verwachtStop(run, GEEN_MAIN);
    expect(run.leest).toStrictEqual([]);
  });

  const gatesOp = (waarde: unknown) => zet(restWereld(), sleutel(`contents/.claude/gates.json?ref=${MAIN}`), waarde);
  const zonderModus = Object.fromEntries(Object.entries(TEMPLATE_TABEL).filter(([naam]) => naam !== 'merge'));

  test.each([
    ['merge is "eigenaar"', { content: b64({ ...TEMPLATE_TABEL, merge: 'eigenaar' }) }],
    ['merge ontbreekt', { content: b64(zonderModus) }],
    ['gates.json is geen JSON', { content: Buffer.from('{ kapot').toString('base64') }],
    ['gates.json is niet te lezen', new Error('gh: HTTP 500')],
  ])('botgesprekken-sluiten/AC-3: de modus op main is niet niet-kritiek als %s', async (_naam, antwoord) => {
    const run = await draai({ wereld: gatesOp(antwoord) });
    verwachtStop(run, MODUS);
    expect(run.leest).toStrictEqual([]);
  });

  test('botgesprekken-sluiten/AC-3: trap 1 stopt bij de eerste reden die faalt', async () => {
    const kapot = zet(restWereld(), sleutel('branches/main'), {});
    verwachtStop(await draai({ head: 'abc', wereld: kapot }), GEEN_HEAD);
    verwachtStop(await draai({ wereld: kapot }), GEEN_MAIN);
    const geenModus = zet(restWereld(), sleutel(`contents/.claude/gates.json?ref=${MAIN}`), new Error('HTTP 500'));
    verwachtStop(await draai({ wereld: geenModus }), MODUS);
  });
});

describe('botgesprekken-sluiten/AC-3 trap 3: de PR, de padtoets en de modus samen', () => {
  const metPr = (pr: Obj, bestandenLijst: unknown = bestanden('src/web/x.tsx')) => ({
    paginas: [pagina([sluitbaar(1), sluitbaar(2)], { pr })],
    wereld: zet(restWereld(), sleutel(`pulls/${String(NR)}/files`), bestandenLijst),
  });

  test('botgesprekken-sluiten/AC-3: een open PR met vrije bestanden geeft geen stop', async () => {
    const run = await draai(metPr({}));
    expect(run.uitkomst.code).toBe(0);
    expect(run.uitkomst.fout).toStrictEqual([]);
  });

  test.each([
    ['de PR is gesloten', { state: 'CLOSED' }, NIET_OPEN],
    ['de PR is samengevoegd', { state: 'MERGED' }, NIET_OPEN],
    ['de basis is develop', { baseRefName: 'develop' }, BASIS],
    ['de head staat in een fork', { isCrossRepository: true }, FORK],
    ['de head van de PR wijkt af van de lokale HEAD', { headRefOid: ANDERE_HEAD }, kopVan('ccccccc')],
    ['headRefOid is niet te lezen (een getal)', { headRefOid: 7 }, kopVan('?')],
    ['headRefOid ontbreekt', { headRefOid: undefined }, kopVan('?')],
  ])('botgesprekken-sluiten/AC-3: %s: precies die reden, nul mutaties', async (_naam, pr, reden) => {
    verwachtStop(await draai(metPr(pr)), reden);
  });

  test('botgesprekken-sluiten/AC-3: alle redenen samen, in de volgorde open, basis, fork, head, pad', async () => {
    const pr = { state: 'CLOSED', baseRefName: 'develop', isCrossRepository: true, headRefOid: ANDERE_HEAD };
    const run = await draai(metPr(pr, bestanden('docs/roadmap.md', 'src/web/x.tsx')));
    verwachtStop(run, NIET_OPEN, BASIS, FORK, kopVan('ccccccc'), beschermd('docs/roadmap.md'));
  });

  test('botgesprekken-sluiten/AC-3: een beschermd pad geeft de reden van padRedenen, met hoogstens vijf paden en "en <n> meer"', async () => {
    verwachtStop(await draai(metPr({}, bestanden('src/web/x.tsx', 'package.json'))), beschermd('package.json'));
    const zeven = [
      'docs/roadmap.md',
      'package.json',
      'scripts/a.mjs',
      'scripts/b.mjs',
      'scripts/c.mjs',
      'scripts/d.mjs',
      'scripts/e.mjs',
    ];
    const run = await draai(metPr({}, bestanden(...zeven)));
    verwachtStop(
      run,
      beschermd('docs/roadmap.md, package.json, scripts/a.mjs, scripts/b.mjs, scripts/c.mjs, en 2 meer'),
    );
  });

  test.each([
    ['de lijst is geen lijst', 'kapot'],
    ['de aanroep van de lijst faalt', new Error('gh: HTTP 502')],
    ['een bestand zonder filename', [{ status: 'modified' }]],
  ])('botgesprekken-sluiten/AC-3: %s: de bestanden zijn niet te lezen', async (_naam, lijst) => {
    verwachtStop(await draai(metPr({}, lijst)), PAD_ONLEESBAAR);
  });

  test('botgesprekken-sluiten/AC-3: een gates.app.json dat niet te lezen is (geen 404) is niet te lezen, een 404 telt als leeg', async () => {
    const appBestand = sleutel(`contents/.claude/gates.app.json?ref=${MAIN}`);
    verwachtStop(await draai({ wereld: zet(restWereld(), appBestand, new Error('gh: HTTP 500')) }), PAD_ONLEESBAAR);
    expect((await draai({ wereld: zet(restWereld(), appBestand, NIET_GEVONDEN) })).uitkomst.code).toBe(0);
  });

  test('botgesprekken-sluiten/AC-3: de padtoets leest de kop van main, gates.json en gates.app.json op die SHA en de bestanden van de PR', async () => {
    const run = await draai();
    expect(run.gelezen).toStrictEqual(
      expect.arrayContaining([
        sleutel('branches/main'),
        sleutel(`contents/.claude/gates.json?ref=${MAIN}`),
        sleutel(`contents/.claude/gates.app.json?ref=${MAIN}`),
        sleutel(`pulls/${String(NR)}/files`),
      ]),
    );
  });

  test('botgesprekken-sluiten/AC-3: in een app telt dezelfde padtoets: een core-pad is beschermd, een roadmap-pad vrij', async () => {
    const wereld = (lijst: unknown) =>
      zet(restWereld(APP, APP_TABEL), sleutel(`pulls/${String(NR)}/files`, APP), lijst);
    const geraakt = await draai({ repo: APP, wereld: wereld(bestanden('src/web/x.tsx', 'src/core/api/auth/x.ts')) });
    verwachtStop(geraakt, beschermd('src/core/api/auth/x.ts'));
    const vrij = await draai({ repo: APP, wereld: wereld(bestanden('docs/roadmap.md', 'src/x.test.ts')) });
    expect(vrij.uitkomst.code).toBe(0);
    expect(vrij.mutaties.map((m) => m['threadId'])).toStrictEqual([idVan(1), idVan(2)]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// AC-4: paginering en een PR die niet te lezen is (trap 2).

describe('botgesprekken-sluiten/AC-4 paginering', () => {
  test("botgesprekken-sluiten/AC-4: de volgende pagina krijgt after gelijk aan endCursor, pagina 1 after null; alle pagina's worden gesloten", async () => {
    const paginas = metPaginas([[sluitbaar(1), sluitbaar(2)], [sluitbaar(3)], [sluitbaar(4)]]);
    const run = await draai({ paginas });
    const basis = { owner: 'BramLambertJansen', name: 'template', number: NR };
    expect(run.leest).toStrictEqual([
      { ...basis, after: null },
      { ...basis, after: 'CURSOR_0' },
      { ...basis, after: 'CURSOR_1' },
    ]);
    expect(run.mutaties).toStrictEqual([1, 2, 3, 4].map((n) => ({ threadId: idVan(n) })));
    expect(run.uitkomst.uit).toStrictEqual([gesloten(1), gesloten(2), gesloten(3), gesloten(4), slot(4, 0, 0)]);
  });

  test("botgesprekken-sluiten/AC-4: elke pagina wordt gelezen vóór de eerste mutatie (schrijven pas na alle pagina's)", async () => {
    const run = await draai({ paginas: metPaginas([[sluitbaar(1)], [sluitbaar(2)], [sluitbaar(3)]]) });
    expect(run.volgorde).toStrictEqual(['lees', 'lees', 'lees', 'sluit', 'sluit', 'sluit']);
  });

  test('botgesprekken-sluiten/AC-4: precies tien pagina’s van 100 gesprekken zijn te lezen (1000 gesprekken, al gesloten)', async () => {
    const groepen = Array.from({ length: 10 }, (_, p) =>
      Array.from({ length: 100 }, (_, i) => sluitbaar(p * 100 + i + 1, { isResolved: true })),
    );
    const run = await draai({ paginas: metPaginas(groepen) });
    expect(run.leest).toHaveLength(10);
    expect(run.mutaties).toStrictEqual([]);
    expect(run.uitkomst.fout).toStrictEqual([]);
    expect(run.uitkomst.uit).toStrictEqual([slot(0, 0, 1000)]);
    expect(run.uitkomst.code).toBe(0);
  });

  test('botgesprekken-sluiten/AC-4: na tien pagina’s nog hasNextPage true: meer dan 1000 gesprekken, geen elfde pagina, nul mutaties', async () => {
    const groepen = Array.from({ length: 10 }, (_, p) =>
      Array.from({ length: 100 }, (_, i) => sluitbaar(p * 100 + i + 1)),
    );
    const paginas = metPaginas(groepen, (index) => ({
      threads: { totalCount: 1100 },
      pageInfo: { hasNextPage: true, endCursor: `CURSOR_${String(index)}` },
    }));
    const run = await draai({ paginas });
    verwachtStop(run, TE_VEEL);
    expect(run.leest).toHaveLength(10);
  });
});

describe('botgesprekken-sluiten/AC-4 een PR of gesprekken die niet te lezen zijn: nul mutaties', () => {
  const geldig = () => pagina([sluitbaar(1), sluitbaar(2)]);
  const tweePaginas = (tweede: Aanpas) => metPaginas([[sluitbaar(1)], [sluitbaar(2)]], (i) => (i === 1 ? tweede : {}));

  const RIJEN: [string, readonly unknown[]][] = [
    ['graphql gooit op de eerste pagina', [new Error('netwerk')]],
    [
      'graphql gooit op de tweede pagina',
      [...metPaginas([[sluitbaar(1)], [sluitbaar(2)]]).slice(0, 1), new Error('netwerk')],
    ],
    ['de body heeft errors en geen data', [{ errors: [{ message: 'Could not resolve' }] }]],
    ['de body heeft errors naast data', [{ ...geldig(), errors: [{ message: 'gedeeltelijk' }] }]],
    ['data heeft geen repository', [{ data: {} }]],
    ['pullRequest is null', [{ data: { repository: { pullRequest: null } } }]],
    ['pullRequest is tekst', [{ data: { repository: { pullRequest: 'x' } } }]],
    ['de body is geen object', ['kapot']],
    ['reviewThreads.nodes is geen lijst', [pagina([sluitbaar(1)], { threads: { nodes: 'x' } })]],
    ['hasNextPage is tekst', [pagina([sluitbaar(1)], { pageInfo: { hasNextPage: 'ja' } })]],
    ['hasNextPage ontbreekt', [pagina([sluitbaar(1)], { pageInfo: { hasNextPage: undefined } })]],
    [
      'hasNextPage is true zonder endCursor (null)',
      [pagina([sluitbaar(1)], { pageInfo: { hasNextPage: true, endCursor: null } })],
    ],
    [
      'hasNextPage is true met een lege endCursor',
      [pagina([sluitbaar(1)], { pageInfo: { hasNextPage: true, endCursor: '' } })],
    ],
    [
      'hasNextPage is true met een endCursor die ontbreekt',
      [pagina([sluitbaar(1)], { pageInfo: { hasNextPage: true, endCursor: undefined } })],
    ],
    [
      'het aantal gelezen gesprekken is kleiner dan totalCount',
      [pagina([sluitbaar(1)], { threads: { totalCount: 2 } })],
    ],
    [
      'het aantal gelezen gesprekken is groter dan totalCount',
      [pagina([sluitbaar(1), sluitbaar(2)], { threads: { totalCount: 1 } })],
    ],
    ['de tweede pagina heeft een andere state', tweePaginas({ pr: { state: 'CLOSED' } })],
    ['de tweede pagina heeft een andere baseRefName', tweePaginas({ pr: { baseRefName: 'develop' } })],
    ['de tweede pagina heeft een andere isCrossRepository', tweePaginas({ pr: { isCrossRepository: true } })],
    ['de tweede pagina heeft een andere headRefOid', tweePaginas({ pr: { headRefOid: ANDERE_HEAD } })],
    ['de tweede pagina heeft een andere totalCount', tweePaginas({ threads: { totalCount: 3 } })],
    [
      'het totaal over de pagina’s wijkt af van totalCount',
      metPaginas([[sluitbaar(1)], [sluitbaar(2)]], () => ({ threads: { totalCount: 5 } })),
    ],
  ];

  test.each(RIJEN)('botgesprekken-sluiten/AC-4: %s: niet te lezen, nul mutaties', async (_naam, paginas) => {
    verwachtStop(await draai({ paginas }), ONLEESBAAR_PR);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// AC-5: schrijven, en AC-6: uitvoer, kanaal en exitcode.

describe('botgesprekken-sluiten/AC-5 schrijven', () => {
  test('botgesprekken-sluiten/AC-5: per sluitbaar gesprek één aanroep met precies { threadId }, en geen ander; al gesloten telt bij "waren al gesloten"', async () => {
    const paginas = [
      pagina([sluitbaar(1), sluitbaar(2, { isOutdated: false }), sluitbaar(3, { isResolved: true }), sluitbaar(4)]),
    ];
    const run = await draai({ paginas });
    expect(run.mutaties).toStrictEqual([{ threadId: idVan(1) }, { threadId: idVan(4) }]);
    expect(run.uitkomst.uit).toStrictEqual([gesloten(1), open(2, NIET_VEROUDERD), gesloten(4), slot(2, 1, 1)]);
    expect(run.uitkomst.fout).toStrictEqual([]);
    expect(run.uitkomst.code).toBe(1);
  });

  test('botgesprekken-sluiten/AC-5: de query en de mutatie zijn vaste tekst, nooit uit invoer opgebouwd', async () => {
    const run = await draai({ paginas: metPaginas([[sluitbaar(1)], [sluitbaar(2)]]) });
    expect(new Set(run.leesTeksten).size).toBe(1);
    expect(new Set(run.sluitTeksten).size).toBe(1);
    const invoer = [idVan(1), idVan(2), 'CURSOR_0', 'BramLambertJansen', 'template'];
    for (const tekst of [...run.leesTeksten, ...run.sluitTeksten]) {
      expect(invoer.filter((waarde) => tekst.includes(waarde))).toStrictEqual([]);
    }
    expect(run.sluitTeksten[0]).toMatch(/resolveReviewThread/);
  });

  test('botgesprekken-sluiten/AC-5: de leesquery vraagt de velden van het contract', async () => {
    const run = await draai();
    const tekst = run.leesTeksten[0] ?? '';
    const velden = [
      'state',
      'isCrossRepository',
      'baseRefName',
      'headRefOid',
      'totalCount',
      'hasNextPage',
      'endCursor',
    ];
    const gesprekVelden = [
      'isResolved',
      'isOutdated',
      'viewerCanResolve',
      'path',
      'url',
      'createdAt',
      'authorAssociation',
      '__typename',
    ];
    expect([...velden, ...gesprekVelden].filter((veld) => !tekst.includes(veld))).toStrictEqual([]);
    expect(tekst).toMatch(/reviewThreads\(\s*first:\s*100/);
    expect(tekst).toMatch(/comments\(\s*first:\s*100/);
  });

  const mislukkingen: [string, (id: string) => unknown][] = [
    [
      'graphql gooit',
      () => {
        throw new Error('netwerk');
      },
    ],
    ['de body heeft errors', () => ({ errors: [{ message: 'Resource not accessible' }] })],
    [
      'de body heeft errors naast data',
      (id) => ({ ...alsObject(lukt({ threadId: id })), errors: [{ message: 'gedeeltelijk' }] }),
    ],
    ['isResolved is false', (id) => ({ data: { resolveReviewThread: { thread: { id, isResolved: false } } } })],
    [
      'het id is een ander gesprek',
      () => ({ data: { resolveReviewThread: { thread: { id: 'PRRT_ander', isResolved: true } } } }),
    ],
    ['er is geen thread', () => ({ data: { resolveReviewThread: null } })],
    ['data is null', () => ({ data: null })],
  ];

  test.each(mislukkingen)(
    'botgesprekken-sluiten/AC-5: %s: dat gesprek is open met "sluiten mislukt", de andere gaan door, exit 1',
    async (_naam, antwoord) => {
      const mutatie = (v: Variabelen) => (v['threadId'] === idVan(1) ? antwoord(idVan(1)) : lukt(v));
      const run = await draai({ mutatie });
      expect(run.mutaties).toStrictEqual([{ threadId: idVan(1) }, { threadId: idVan(2) }]);
      expect(run.uitkomst.uit).toStrictEqual([open(1, MISLUKT), gesloten(2), slot(1, 1, 0)]);
      expect(run.uitkomst.fout).toStrictEqual([]);
      expect(run.uitkomst.code).toBe(1);
    },
  );
});

describe('botgesprekken-sluiten/AC-6 uitvoer, kanaal en exitcode', () => {
  test('botgesprekken-sluiten/AC-6: alles gesloten: een regel per gesprek, de slotregel, niets op stderr, exit 0', async () => {
    const run = await draai({ paginas: [pagina([sluitbaar(1), sluitbaar(2), sluitbaar(3, { isResolved: true })])] });
    expect(run.uitkomst.uit).toStrictEqual([gesloten(1), gesloten(2), slot(2, 0, 1)]);
    expect(run.uitkomst.fout).toStrictEqual([]);
    expect(run.uitkomst.code).toBe(0);
  });

  test('botgesprekken-sluiten/AC-6: een PR zonder gesprekken geeft alleen de slotregel en exit 0', async () => {
    const run = await draai({ paginas: [pagina([])] });
    expect(run.uitkomst.uit).toStrictEqual([slot(0, 0, 0)]);
    expect(run.uitkomst.fout).toStrictEqual([]);
    expect(run.uitkomst.code).toBe(0);
    expect(run.mutaties).toStrictEqual([]);
  });

  test('botgesprekken-sluiten/AC-6: alleen al gesloten gesprekken: geen regel per gesprek, exit 0', async () => {
    const run = await draai({
      paginas: [pagina([sluitbaar(1, { isResolved: true }), sluitbaar(2, { isResolved: true })])],
    });
    expect(run.uitkomst.uit).toStrictEqual([slot(0, 0, 2)]);
    expect(run.uitkomst.code).toBe(0);
    expect(run.mutaties).toStrictEqual([]);
  });

  test('botgesprekken-sluiten/AC-6: elke open reden staat letterlijk achter "- open: <pad> (<url>)", exit 1 en nul mutaties', async () => {
    const paginas = [
      pagina([
        sluitbaar(1, { id: '' }),
        metOpmerking(sluitbaar(2), 0, alsMens),
        metNodes(sluitbaar(3), [bot(3, 0)]),
        sluitbaar(4, { isOutdated: false }),
        sluitbaar(5, { viewerCanResolve: false }),
      ]),
    ];
    const run = await draai({ paginas });
    expect(run.uitkomst.uit).toStrictEqual([
      open(1, NIET_TE_LEZEN),
      open(2, NIET_BOT),
      open(3, GEEN_ANTWOORD),
      open(4, NIET_VEROUDERD),
      open(5, KAN_NIET),
      slot(0, 5, 0),
    ]);
    expect(run.uitkomst.fout).toStrictEqual([]);
    expect(run.uitkomst.code).toBe(1);
    expect(run.mutaties).toStrictEqual([]);
  });

  test('botgesprekken-sluiten/AC-6: een onleesbaar pad of onleesbare url wordt "?", de andere gesprekken worden gewoon getoetst', async () => {
    const paginas = [
      pagina([
        sluitbaar(1, { path: 7 }),
        metNodes(sluitbaar(2), []),
        metOpmerking(sluitbaar(3), 0, { url: 7 }),
        sluitbaar(4),
      ]),
    ];
    const run = await draai({ paginas });
    expect(run.uitkomst.uit).toStrictEqual([
      `- open: ? (${urlVan(1)}): ${NIET_TE_LEZEN}`,
      `- open: ${padVan(2)} (?): ${NIET_TE_LEZEN}`,
      `- open: ${padVan(3)} (?): ${NIET_TE_LEZEN}`,
      gesloten(4),
      slot(1, 3, 0),
    ]);
    expect(run.mutaties).toStrictEqual([{ threadId: idVan(4) }]);
    expect(run.uitkomst.code).toBe(1);
  });
});

describe('botgesprekken-sluiten/AC-6 nummerUit(args, "pr:resolve")', () => {
  const GEBRUIK = 'Gebruik: pnpm pr:resolve <nummer>';

  function nummerUit(args: string[], script?: string): unknown {
    const functie: unknown = Reflect.get(prMerge, 'nummerUit');
    expect(typeof functie, 'nummerUit is een export van scripts/kit/pr-merge.mjs').toBe('function');
    if (typeof functie !== 'function') return undefined;
    return Reflect.apply(functie, undefined, script === undefined ? [args] : [args, script]);
  }

  test.each([[[]], [['0']], [['012']], [['12a']], [['7', '8']]])(
    'botgesprekken-sluiten/AC-6: ongeldig argument %j geeft de eigen gebruiksregel',
    (args) => {
      expect(() => nummerUit(args, 'pr:resolve')).toThrow(new Error(GEBRUIK));
    },
  );

  test('botgesprekken-sluiten/AC-6: een geldig nummer wordt een getal', () => {
    expect(nummerUit(['12'], 'pr:resolve')).toBe(12);
  });

  test('botgesprekken-sluiten/AC-6: zonder tweede parameter blijft de melding van het mergescript gelijk', () => {
    expect(() => nummerUit(['0'])).toThrow(new Error('Gebruik: pnpm pr:merge <nummer>'));
  });
});

describe('botgesprekken-sluiten/AC-6 het script zelf: gebruik en basis op stderr, exit 1', () => {
  const MAPPEN: string[] = [];

  afterAll(() => {
    for (const map of MAPPEN.splice(0)) rmSync(map, { recursive: true, force: true });
  });

  // Hermetisch: een lege werkmap, geen git en geen gh in PATH, dus geen GitHub-aanroep.
  function draaiScript(args: string[]) {
    const map = mkdtempSync(path.join(tmpdir(), 'gesprekken-sluiten-'));
    MAPPEN.push(map);
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: map,
      encoding: 'utf8',
      env: { PATH: path.dirname(process.execPath) },
      timeout: 20_000,
    });
  }

  test.each([[[]], [['0']], [['12a']], [['7', '8']]])(
    'botgesprekken-sluiten/AC-6: fout gebruik %j: "Gebruik: pnpm pr:resolve <nummer>" op stderr, niets op stdout, exit 1',
    (args) => {
      const uit = draaiScript(args);
      expect(uit.stderr.trim()).toBe('Gebruik: pnpm pr:resolve <nummer>');
      expect(uit.stdout).toBe('');
      expect(uit.status).toBe(1);
    },
  );

  test('botgesprekken-sluiten/AC-6: zonder leesbaar anker: "Geen leesbare vertrouwde basis" op stderr, niets op stdout, exit 1', () => {
    const uit = draaiScript(['12']);
    expect(uit.stderr.trim()).toBe('Geen leesbare vertrouwde basis');
    expect(uit.stdout).toBe('');
    expect(uit.status).toBe(1);
  });
});
