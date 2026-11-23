import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { defineRoute } from '../../src/api/kit.ts';
import type { Tx } from '../../src/core/api/db/types.ts';
import { decodeCursor, encodeCursor, pageSchema } from '../../src/core/shared/cursor.ts';
import {
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
} from '../../src/core/shared/limits.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import {
  classificatieProblemen,
  eigenaarApiProblemen,
  eigenaarTabellen,
  spoofApiProblemen,
  spoofDbProblemen,
  type Classificatie,
  type EigenaarOpzet,
  type Resources,
  type Spelers,
  type Zender,
} from './controles.ts';
import { pgCode, rijenVan } from './hulp.ts';
import { EIGENAAR_ROUTES, labelsVan, openEigenaarProbe, type EigenaarProbe } from './probe-eigenaar.ts';
import { resources, type ResourceRegel } from './resources.ts';

// De suite volgt het contract van de resource (spec suite-volgt-contract, AC-5 t/m AC-8 en AC-10): de lijstcontrole leest het
// contract van de lijstroute, de updatecontrole op de database kijkt eerst of er UPDATE-recht is, en een probe in generatorvorm
// (tabel uit de sjabloon met alleen `grant insert (label)`, lijst met pageSize, geen PATCH en geen GET /:id) haalt alle controles.
// Echte database en RLS; elke variant draait in een eigen, terugdraaiende transactie. `pnpm test:db`.
//
// Nieuwe namen (`tabelEigenaarVerslag`, `openGeneratorProbe`, `EigenaarOpzet.routes`, `sample.updateRij`) worden zo gelezen dat dit
// bestand compileert voordat ze bestaan en dan op een assertie faalt (dynamische import met een schema, een spread zonder
// vers object).
const LANG = 120_000;
const TABEL = 'public.security_probes';
const SELECT_POLICY = 'security_probes_select_own';
const DELETE_POLICY = 'security_probes_delete_own';
const LIJST = 'GET /probes';
const LIJST_PAD = '/probes';
const GEEN_LIMIT = `security_probes: het lijstcontract '${LIJST}' kent geen limit; geef defineListSearch een pageSize (spec suite-volgt-contract)`;
const AFGEBROKEN = 'controle afgebroken';
const GEEN_UPDATERECHT = 'revoke update (label) on public.security_probes from app_authenticated';
const ALLES_ZICHTBAAR = [
  `drop policy ${SELECT_POLICY} on public.security_probes`,
  `create policy ${SELECT_POLICY} on public.security_probes for select to app_authenticated using (true)`,
];
const ALLES_WISBAAR = [
  `drop policy ${DELETE_POLICY} on public.security_probes`,
  `create policy ${DELETE_POLICY} on public.security_probes for delete to app_authenticated using (true)`,
];

// ---------------------------------------------------------------------------------------------------------------------
// De eerste probe, met een voorbereiding als eigenaar van het schema (zoals een migratie).
// ---------------------------------------------------------------------------------------------------------------------
async function metProbe<T>(voorbereiding: readonly string[], werk: (ep: EigenaarProbe) => Promise<T>): Promise<T> {
  const ep = await openEigenaarProbe();
  try {
    await ep.alsEigenaar(voorbereiding);
    return await werk(ep);
  } finally {
    await ep.sluit();
  }
}

function basisRegel(): ResourceRegel {
  const regel = resources.security_probes;
  if (regel === undefined) throw new Error('resources.security_probes ontbreekt');
  return regel;
}

function metSample(sample: ResourceRegel['sample']): Resources {
  return { security_probes: { ...basisRegel(), sample } };
}

// De sample zonder update en zonder updateRij.
function sampleZonderUpdate(): ResourceRegel['sample'] {
  const { create, createTweede, spoof } = basisRegel().sample;
  return { create, createTweede, ...(spoof === undefined ? {} : { spoof }) };
}

// Een API-veldnaam die geen kolom is, met de kolom in updateRij (zelfde patroon als sample.rij naast sample.create).
function sampleMetUpdateRij(): ResourceRegel['sample'] {
  const extra = { updateRij: { label: 'beveiligingstest-gewijzigd' } };
  return { ...sampleZonderUpdate(), update: { titel: 'beveiligingstest-api' }, ...extra };
}

const isFunctie = (waarde: unknown): boolean => typeof waarde === 'function';

// ---------------------------------------------------------------------------------------------------------------------
// tabelEigenaarVerslag(spelers, resources) -> { problemen, meldingen } (spec ontwerp 4).
// ---------------------------------------------------------------------------------------------------------------------
interface Verslag {
  readonly problemen: string[];
  readonly meldingen: string[];
}
const verslagSchema = z.object({ problemen: z.array(z.string()), meldingen: z.array(z.string()) });
const controlesModule = z.object({
  tabelEigenaarVerslag: z.custom<(spelers: Spelers, lijst: Resources) => Promise<unknown>>(isFunctie),
});

async function verslagVan(spelers: Spelers, lijst: Resources): Promise<Verslag> {
  const gelezen = controlesModule.safeParse(await import('./controles.ts'));
  expect(gelezen.success, 'test/security/controles.ts exporteert tabelEigenaarVerslag(spelers, resources)').toBe(true);
  if (!gelezen.success) throw new Error('test/security/controles.ts exporteert tabelEigenaarVerslag niet');
  const ruw = await gelezen.data.tabelEigenaarVerslag(spelers, lijst);
  const verslag = verslagSchema.safeParse(ruw);
  expect(verslag.success, `tabelEigenaarVerslag gaf een onverwachte vorm: ${JSON.stringify(ruw)}`).toBe(true);
  if (!verslag.success) throw new Error('tabelEigenaarVerslag gaf een onverwachte vorm');
  return verslag.data;
}

// De melding dat de update-proef voor deze tabel is overgeslagen (de spec geeft de zin niet letterlijk: tabelnaam en "overgeslagen").
const isOvergeslagen = (tabel: string) => (melding: string) =>
  melding.includes(tabel) && melding.toLowerCase().includes('overgeslagen');

// ---------------------------------------------------------------------------------------------------------------------
// Lijstvarianten van de probe-app: dezelfde create, lezen, wijzigen en verwijderen als de eerste probe, met een eigen lijst.
// ---------------------------------------------------------------------------------------------------------------------
type Routes = NonNullable<Parameters<EigenaarProbe['opzet']>[0]>;

const [create, , lees, wijzig, verwijder] = EIGENAAR_ROUTES;
const rijSchema = z.object({ id: z.string(), label: z.string() }).strict();
const cursorSleutel = z.object({ id: z.uuid() }).strict();
const uitvoer = pageSchema(rijSchema);
const SELECTEER = sql`select p.id::text as id, p.label from public.security_probes p`;

const zoekterm = z.string().trim().max(MAX_SEARCH_LENGTH).optional();
const cursorVeld = z.string().max(MAX_CURSOR_LENGTH).optional();
const limietVeld = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);

interface LijstInvoer {
  readonly q?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

async function leesPagina(tx: Tx, invoer: LijstInvoer): Promise<z.input<typeof uitvoer>> {
  const limit = invoer.limit ?? DEFAULT_PAGE_SIZE;
  const na =
    invoer.cursor === undefined ? sql`` : sql`and p.id > ${decodeCursor(invoer.cursor, cursorSleutel).id}::uuid`;
  const zoek = invoer.q === undefined ? sql`` : sql`and position(lower(${invoer.q}) in lower(p.label)) > 0`;
  const rijen = await rijenVan(tx, sql`${SELECTEER} where true ${na} ${zoek} order by p.id limit ${limit + 1}`);
  const items = rijen.slice(0, limit).map((rij) => rijSchema.parse(rij));
  const laatste = items.at(-1);
  const nextCursor = rijen.length > limit && laatste !== undefined ? encodeCursor({ id: laatste.id }) : null;
  return { items, nextCursor };
}

const lijstContract = <const I extends z.ZodObject>(input: I) =>
  defineContract({ method: 'GET', path: LIJST_PAD, input, output: uitvoer, permission: 'app.use' });

// Een lijst zonder limit: alleen q en cursor (strict), zoals een defineListSearch zonder pageSize.
const lijstZonderLimit = defineRoute(
  lijstContract(z.object({ q: zoekterm, cursor: cursorVeld }).strict()),
  ({ tx, input }) => leesPagina(tx, input),
);
// Idem met een ander verplicht veld: de suite kent dat veld niet, en mag er toch niet door verward raken.
const lijstZonderLimitMetVerplichtVeld = defineRoute(
  lijstContract(z.object({ q: zoekterm, cursor: cursorVeld, status: z.enum(['open', 'dicht']) }).strict()),
  ({ tx, input }) => leesPagina(tx, input),
);
// Een lijst met limit, én een ander verplicht veld: alleen het veld limit telt voor de beslissing.
const lijstMetLimitEnVerplichtVeld = defineRoute(
  lijstContract(
    z.object({ q: zoekterm, cursor: cursorVeld, limit: limietVeld, status: z.enum(['open', 'dicht']) }).strict(),
  ),
  ({ tx, input }) => leesPagina(tx, input),
);
// Een limit-veld dat de waarde 1 weigert: telt als "accepteert geen limit".
const lijstLimitWeigertEen = defineRoute(
  lijstContract(
    z
      .object({
        q: zoekterm,
        cursor: cursorVeld,
        limit: z.coerce.number().int().min(5).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      })
      .strict(),
  ),
  ({ tx, input }) => leesPagina(tx, input),
);
// Een lijst zonder q: er is geen zoekpad om te lekken, dus de q-variant vervalt.
const lijstZonderQ = defineRoute(
  lijstContract(z.object({ cursor: cursorVeld, limit: limietVeld }).strict()),
  ({ tx, input }) => leesPagina(tx, input),
);
// Een lijst met q die de zoekterm uit de sample weigert (langer dan 3 tekens).
const lijstQWeigertSample = defineRoute(
  lijstContract(z.object({ q: z.string().trim().max(3).optional(), cursor: cursorVeld, limit: limietVeld }).strict()),
  ({ tx, input }) => leesPagina(tx, input),
);
// Bewust gebroken: accepteert limit, maar geeft altijd alles op één pagina.
const lijstNegeertLimit = defineRoute(
  lijstContract(z.object({ q: zoekterm, cursor: cursorVeld, limit: limietVeld }).strict()),
  ({ tx, input }) => leesPagina(tx, { q: input.q, limit: MAX_PAGE_SIZE }),
);

const metLijst = (lijst: Routes[number]): Routes => [create, lijst, lees, wijzig, verwijder];

// De opzet voor deze routes, met `routes` expliciet gezet (de ontwerpkeuze van de spec: de routes waarop de zender werkt).
const metRoutes = (opzet: EigenaarOpzet, routes: Routes) => ({ ...opzet, routes });

// Neemt de invoer van elk lijstverzoek op, zodat een test kan zien wat de suite echt stuurt (limit, q).
function opnemend<O extends EigenaarOpzet>(
  opzet: O,
): { readonly opzet: O; readonly verzoeken: Record<string, unknown>[] } {
  const verzoeken: Record<string, unknown>[] = [];
  const zend: Zender = (wie, aanroep) => {
    if (aanroep.method === 'GET' && aanroep.pad === LIJST_PAD) verzoeken.push({ ...aanroep.invoer });
    return opzet.zend(wie, aanroep);
  };
  return { opzet: { ...opzet, zend }, verzoeken };
}

interface LijstUitkomst {
  readonly problemen: string[];
  readonly verzoeken: Record<string, unknown>[];
}

async function lijstUitkomst(routes: Routes): Promise<LijstUitkomst> {
  return metProbe([], async (ep) => {
    const opgenomen = opnemend(metRoutes(ep.opzet(routes), routes));
    return { problemen: await eigenaarApiProblemen(opgenomen.opzet), verzoeken: opgenomen.verzoeken };
  });
}

const stuurtGeen = (verzoeken: readonly Record<string, unknown>[], veld: string): boolean =>
  verzoeken.every((invoer) => !Object.hasOwn(invoer, veld));

// ---------------------------------------------------------------------------------------------------------------------
// AC-5: het lijstcontract bepaalt of de suite limit stuurt.
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-5: de lijstcontrole leest het contract van de lijstroute', { timeout: LANG }, () => {
  test('suitecontract/AC-5: een lijst die limit accepteert krijgt limit 1 en een cursor, zonder problemen', async () => {
    const uitkomst = await lijstUitkomst(metLijst(EIGENAAR_ROUTES[1]));

    expect(uitkomst.problemen).toStrictEqual([]);
    expect(uitkomst.verzoeken.length).toBeGreaterThan(0);
    expect(uitkomst.verzoeken.every((invoer) => invoer.limit === 1)).toBe(true);
    expect(uitkomst.verzoeken.some((invoer) => typeof invoer.cursor === 'string')).toBe(true);
  });

  test('suitecontract/AC-5: een lijst die limit accepteert maar negeert (twee rijen van B op één pagina) is een probleem', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstNegeertLimit));

    expect(uitkomst.problemen.some((probleem) => probleem.includes('tweede pagina'))).toBe(true);
    expect(uitkomst.verzoeken.every((invoer) => invoer.limit === 1)).toBe(true);
  });

  test('suitecontract/AC-5: een lijstcontract zonder limit geeft het probleem uit de spec, stuurt geen limit en breekt niet af', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstZonderLimit));

    expect(uitkomst.problemen.filter((probleem) => probleem === GEEN_LIMIT)).toStrictEqual([GEEN_LIMIT]);
    expect(uitkomst.problemen.some((probleem) => probleem.includes(AFGEBROKEN))).toBe(false);
    expect(stuurtGeen(uitkomst.verzoeken, 'limit')).toBe(true);
  });

  test('suitecontract/AC-5: een lijstcontract zonder limit mét een ander verplicht veld geeft hetzelfde probleem en geen "controle afgebroken"', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstZonderLimitMetVerplichtVeld));

    expect(uitkomst.problemen).toContain(GEEN_LIMIT);
    expect(uitkomst.problemen.some((probleem) => probleem.includes(AFGEBROKEN))).toBe(false);
    expect(stuurtGeen(uitkomst.verzoeken, 'limit')).toBe(true);
  });

  test('suitecontract/AC-5: een limit-veld dat de waarde 1 weigert telt als "kent geen limit"', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstLimitWeigertEen));

    expect(uitkomst.problemen).toContain(GEEN_LIMIT);
    expect(uitkomst.problemen.some((probleem) => probleem.includes(AFGEBROKEN))).toBe(false);
    expect(stuurtGeen(uitkomst.verzoeken, 'limit')).toBe(true);
  });

  test('suitecontract/AC-5: een ander verplicht veld bepaalt de uitkomst niet: met een limit-veld is er geen "kent geen limit" en gaat limit 1 mee', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstMetLimitEnVerplichtVeld));

    expect(uitkomst.problemen.some((probleem) => probleem.includes('kent geen limit'))).toBe(false);
    expect(uitkomst.verzoeken.every((invoer) => invoer.limit === 1)).toBe(true);
  });

  test('suitecontract/AC-5: een opzet zonder contract voor de lijstroute is een probleem met het label van de route', async () => {
    const geen: Routes = [];
    const problemen = await metProbe([], (ep) => eigenaarApiProblemen(metRoutes(ep.opzet(), geen)));

    expect(problemen.some((probleem) => probleem.includes(LIJST))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-6: de q-variant volgt het contract.
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-6: de q-variant draait alleen als het lijstcontract q heeft', { timeout: LANG }, () => {
  test('suitecontract/AC-6: een lijst met q krijgt de q-variant met de zoekterm uit de sample, zonder problemen', async () => {
    const zoek = basisRegel().sample.create.label;
    const uitkomst = await lijstUitkomst(metLijst(EIGENAAR_ROUTES[1]));

    expect(typeof zoek).toBe('string');
    expect(uitkomst.problemen).toStrictEqual([]);
    expect(uitkomst.verzoeken.some((invoer) => invoer.q === zoek)).toBe(true);
  });

  test('suitecontract/AC-6: weigert q de zoekterm uit de sample, dan is dat een probleem met de naam van de resource (geen afgebroken controle)', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstQWeigertSample));
    const eigen = uitkomst.problemen.filter(
      (probleem) =>
        probleem.startsWith('security_probes: ') && /\bq\b/.test(probleem) && !probleem.includes(AFGEBROKEN),
    );

    expect(eigen.length).toBeGreaterThan(0);
  });

  test('suitecontract/AC-6: een lijst zonder q krijgt geen q, geen probleem en geen afgebroken controle', async () => {
    const uitkomst = await lijstUitkomst(metLijst(lijstZonderQ));

    expect(uitkomst.problemen).toStrictEqual([]);
    expect(uitkomst.verzoeken.length).toBeGreaterThan(0);
    expect(stuurtGeen(uitkomst.verzoeken, 'q')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-18 (#813): de zoekterm is de eerste tekstwaarde van sample.create en moet de rij van A vinden.
// ---------------------------------------------------------------------------------------------------------------------
const NAAM = 'security_probes';
const ZOEKTERM = 'beveiligingstest-a';

interface WieVerzoek {
  readonly wie: 'A' | 'B';
  readonly invoer: Record<string, unknown>;
}

interface WieUitkomst {
  readonly problemen: string[];
  readonly verzoeken: WieVerzoek[];
}

// Zoals `opnemend`, maar legt ook vast wie het lijstverzoek deed (de bestaande helper blijft ongewijzigd).
function opnemendMetWie<O extends EigenaarOpzet>(opzet: O): { readonly opzet: O; readonly verzoeken: WieVerzoek[] } {
  const verzoeken: WieVerzoek[] = [];
  const zend: Zender = (wie, aanroep) => {
    if (aanroep.method === 'GET' && aanroep.pad === LIJST_PAD) verzoeken.push({ wie, invoer: { ...aanroep.invoer } });
    return opzet.zend(wie, aanroep);
  };
  return { opzet: { ...opzet, zend }, verzoeken };
}

async function lijstUitkomstMetWie(routes: Routes, sample: ResourceRegel['sample']): Promise<WieUitkomst> {
  return metProbe([], async (ep) => {
    const opgenomen = opnemendMetWie({ ...metRoutes(ep.opzet(routes), routes), resources: metSample(sample) });
    return { problemen: await eigenaarApiProblemen(opgenomen.opzet), verzoeken: opgenomen.verzoeken };
  });
}

// De basissample, met een andere create en createTweede (update en spoof blijven zoals ze zijn).
function sampleMetCreate(eerste: Record<string, unknown>, tweede: Record<string, unknown>): ResourceRegel['sample'] {
  return { ...basisRegel().sample, create: eerste, createTweede: tweede };
}

// Een create-route zonder tekstveld: alleen een getal; het label van de rij maakt de route zelf.
const createZonderTekst = defineRoute(
  defineContract({
    method: 'POST',
    path: LIJST_PAD,
    input: z.object({ aantal: z.number().int() }).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const label = `rij-${String(input.aantal)}`;
    const rijen = await rijenVan(
      tx,
      sql`insert into public.security_probes (label) values (${label}) returning id::text as id, label`,
    );
    return rijSchema.parse(rijen[0]);
  },
);

// Een lijst met q die de term accepteert, maar op het id zoekt in plaats van op het label: de rij van A wordt niet gevonden.
const lijstQZoektOpId = defineRoute(
  lijstContract(z.object({ q: zoekterm, cursor: cursorVeld, limit: limietVeld }).strict()),
  async ({ tx, input }) => {
    const na =
      input.cursor === undefined ? sql`` : sql`and p.id > ${decodeCursor(input.cursor, cursorSleutel).id}::uuid`;
    const zoek = input.q === undefined ? sql`` : sql`and position(lower(${input.q}) in p.id::text) > 0`;
    const rijen = await rijenVan(tx, sql`${SELECTEER} where true ${na} ${zoek} order by p.id limit ${input.limit + 1}`);
    const items = rijen.slice(0, input.limit).map((rij) => rijSchema.parse(rij));
    const laatste = items.at(-1);
    const nextCursor = rijen.length > input.limit && laatste !== undefined ? encodeCursor({ id: laatste.id }) : null;
    return { items, nextCursor };
  },
);

const isGeenTekstwaarde = (probleem: string): boolean =>
  probleem.startsWith(`${NAAM}: `) && probleem.includes('sample.create') && probleem.includes('geen tekstwaarde');

describe('suitecontract/AC-18: de zoekterm vindt de rij van A (#813)', { timeout: LANG }, () => {
  test('suitecontract/AC-18: een lijst met q en een sample.create zonder tekstwaarde geeft een probleem over sample.create, geen afgebroken controle', async () => {
    const sample = sampleMetCreate({ aantal: 1 }, { aantal: 2 });
    const routes: Routes = [createZonderTekst, EIGENAAR_ROUTES[1], lees, wijzig, verwijder];
    const uitkomst = await lijstUitkomstMetWie(routes, sample);

    expect(uitkomst.problemen.filter(isGeenTekstwaarde).length).toBeGreaterThan(0);
    expect(uitkomst.problemen.some((probleem) => probleem.includes(AFGEBROKEN))).toBe(false);
    expect(
      stuurtGeen(
        uitkomst.verzoeken.map(({ invoer }) => invoer),
        'q',
      ),
    ).toBe(true);
  });

  test('suitecontract/AC-18: een sample.create waarvan de enige tekst alleen witruimte is geeft hetzelfde probleem', async () => {
    const sample = sampleMetCreate({ label: '   ' }, { label: '  ' });
    const uitkomst = await lijstUitkomstMetWie(metLijst(EIGENAAR_ROUTES[1]), sample);

    expect(uitkomst.problemen.filter(isGeenTekstwaarde).length).toBeGreaterThan(0);
    expect(uitkomst.problemen.some((probleem) => probleem.includes(AFGEBROKEN))).toBe(false);
    expect(
      stuurtGeen(
        uitkomst.verzoeken.map(({ invoer }) => invoer),
        'q',
      ),
    ).toBe(true);
  });

  test('suitecontract/AC-18: een lijst die de term accepteert maar de rij van A niet vindt geeft een probleem met sample.create en de term tussen enkele aanhalingstekens', async () => {
    const uitkomst = await lijstUitkomstMetWie(metLijst(lijstQZoektOpId), basisRegel().sample);
    const eigen = uitkomst.problemen.filter(
      (probleem) =>
        probleem.startsWith(`${NAAM}: `) &&
        probleem.includes('sample.create') &&
        probleem.includes(`'${ZOEKTERM}'`) &&
        !probleem.includes(AFGEBROKEN),
    );

    expect(eigen.length).toBeGreaterThan(0);
    expect(uitkomst.verzoeken.some(({ wie, invoer }) => wie === 'B' && invoer.q === ZOEKTERM)).toBe(true);
  });

  test('suitecontract/AC-18: een lijst die de rij van A met de term vindt: A vraagt de lijst met q op en er is geen probleem', async () => {
    const uitkomst = await lijstUitkomstMetWie(metLijst(EIGENAAR_ROUTES[1]), basisRegel().sample);

    expect(uitkomst.problemen).toStrictEqual([]);
    expect(uitkomst.verzoeken.some(({ wie, invoer }) => wie === 'A' && invoer.q === ZOEKTERM)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-7: de tabel heeft UPDATE-recht (de eerste probe): kolom uit sample.updateRij of sample.update.
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-7: een owner-tabel met UPDATE-recht', { timeout: LANG }, () => {
  test('suitecontract/AC-7: met sample.update is er geen probleem en geen melding over een overgeslagen update-proef', async () => {
    const verslag = await metProbe([], (ep) => verslagVan(ep.spelers, resources));

    expect(verslag.problemen).toStrictEqual([]);
    expect(verslag.meldingen.some(isOvergeslagen(TABEL))).toBe(false);
  });

  test('suitecontract/AC-7: de kolom komt uit sample.updateRij als die er is, ook als sample.update een API-veldnaam is', async () => {
    const verslag = await metProbe([], (ep) => verslagVan(ep.spelers, metSample(sampleMetUpdateRij())));

    expect(verslag.problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-7: sample.updateRij alleen (zonder sample.update) is genoeg', async () => {
    const extra = { updateRij: { label: 'beveiligingstest-gewijzigd' } };
    const verslag = await metProbe([], (ep) =>
      verslagVan(ep.spelers, metSample({ ...sampleZonderUpdate(), ...extra })),
    );

    expect(verslag.problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-7: zonder updateRij blijft sample.update de kolom: een API-veldnaam die geen kolom is geeft een probleem', async () => {
    const zonderRij = { ...sampleZonderUpdate(), update: { titel: 'beveiligingstest-api' } };
    const verslag = await metProbe([], (ep) => verslagVan(ep.spelers, metSample(zonderRij)));

    expect(verslag.problemen.some((probleem) => probleem.includes('titel'))).toBe(true);
  });

  test('suitecontract/AC-7: een updateRij met een kolom zonder update-recht geeft een probleem met de kolomnaam', async () => {
    const extra = { updateRij: { created_at: '2020-01-01T00:00:00Z' } };
    const verslag = await metProbe([], (ep) =>
      verslagVan(ep.spelers, metSample({ ...sampleZonderUpdate(), ...extra })),
    );

    expect(verslag.problemen.some((probleem) => probleem.includes('created_at'))).toBe(true);
  });

  test('suitecontract/AC-7: ontbreken sample.update en sample.updateRij, dan is dat een probleem en lopen select, delete en de vergelijking van de rij van A toch', async () => {
    const voorbereiding = [...ALLES_ZICHTBAAR, ...ALLES_WISBAAR];
    const verslag = await metProbe(voorbereiding, (ep) => verslagVan(ep.spelers, metSample(sampleZonderUpdate())));

    expect(verslag.problemen.some((probleem) => probleem.startsWith(TABEL) && probleem.includes('sample.update'))).toBe(
      true,
    );
    expect(verslag.problemen).toContain(`${TABEL}: B raakt via select 1 rij(en) van A`);
    expect(verslag.problemen).toContain(`${TABEL}: B raakt via delete 1 rij(en) van A`);
    expect(verslag.problemen).toContain(`${TABEL}: de rij van A is veranderd door B`);
  });

  test('suitecontract/AC-7: ontbreken beide samples bij een goede tabel, dan is dat het enige probleem', async () => {
    const verslag = await metProbe([], (ep) => verslagVan(ep.spelers, metSample(sampleZonderUpdate())));

    expect(verslag.problemen).toHaveLength(1);
    expect(verslag.problemen[0]).toContain('sample.update');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-8: de tabel heeft geen UPDATE-recht (de eerste probe zonder update-grant).
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-8: een owner-tabel zonder UPDATE-recht', { timeout: LANG }, () => {
  test('suitecontract/AC-8: geen probleem, en een melding met de tabelnaam dat de update-proef is overgeslagen', async () => {
    const verslag = await metProbe([GEEN_UPDATERECHT], (ep) => verslagVan(ep.spelers, resources));

    expect(verslag.problemen).toStrictEqual([]);
    expect(verslag.meldingen.some(isOvergeslagen(TABEL))).toBe(true);
  });

  test('suitecontract/AC-8: sample.update is niet nodig (geen probleem over updaterecht of over sample.update)', async () => {
    const verslag = await metProbe([GEEN_UPDATERECHT], (ep) => verslagVan(ep.spelers, metSample(sampleZonderUpdate())));

    expect(verslag.problemen).toStrictEqual([]);
    expect(verslag.meldingen.some(isOvergeslagen(TABEL))).toBe(true);
  });

  test('suitecontract/AC-8: een sample.update met een kolom die B niet mag wijzigen is zonder UPDATE-recht ook geen probleem', async () => {
    const regels = metSample({ ...sampleZonderUpdate(), update: { created_at: '2020-01-01T00:00:00Z' } });
    const verslag = await metProbe([GEEN_UPDATERECHT], (ep) => verslagVan(ep.spelers, regels));

    expect(verslag.problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-8: select en delete door B blijven: een te ruime select- en delete-policy is nog steeds rood', async () => {
    const voorbereiding = [GEEN_UPDATERECHT, ...ALLES_ZICHTBAAR, ...ALLES_WISBAAR];
    const verslag = await metProbe(voorbereiding, (ep) => verslagVan(ep.spelers, resources));

    expect(verslag.problemen).toContain(`${TABEL}: B raakt via select 1 rij(en) van A`);
    expect(verslag.problemen).toContain(`${TABEL}: B raakt via delete 1 rij(en) van A`);
    expect(verslag.problemen).toContain(`${TABEL}: de rij van A is veranderd door B`);
  });

  test('suitecontract/AC-8: de aanname van de proef klopt: zonder UPDATE-recht faalt "update <tabel> set id = id" als A en als B met 42501', async () => {
    const fouten = await metProbe([GEEN_UPDATERECHT], async (ep) => {
      const uitkomsten: Record<string, string | undefined> = {};
      for (const wie of ['A', 'B'] as const) {
        const fout = await ep.spelers.db
          .withUser(ep.spelers[wie].actor, (tx) => tx.execute(sql`update public.security_probes set id = id`))
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        uitkomsten[wie] = pgCode(fout);
      }
      return uitkomsten;
    });

    expect(fouten).toStrictEqual({ A: '42501', B: '42501' });
  });

  test('suitecontract/AC-8: tabelEigenaarProblemen geeft dezelfde problemen als het verslag (te ruime select- en delete-policy, sample.update ontbreekt)', async () => {
    const voorbereiding = [...ALLES_ZICHTBAAR, ...ALLES_WISBAAR];
    const lijst = metSample(sampleZonderUpdate());
    // Elke aanroep krijgt een eigen transactie: ze maken allemaal rijen met hetzelfde sample (unieke index owner_id, label).
    const verslag = await metProbe(voorbereiding, (ep) => verslagVan(ep.spelers, lijst));
    const problemen = await metProbe(voorbereiding, async (ep) => {
      const { tabelEigenaarProblemen } = await import('./controles.ts');
      return tabelEigenaarProblemen(ep.spelers, lijst);
    });

    expect(verslag.problemen.length).toBeGreaterThan(0);
    expect(problemen).toStrictEqual(verslag.problemen);
  });

  test('suitecontract/AC-8: tabelEigenaarProblemen geeft dezelfde (lege) problemen als het verslag zonder UPDATE-recht', async () => {
    const verslag = await metProbe([GEEN_UPDATERECHT], (ep) => verslagVan(ep.spelers, resources));
    const problemen = await metProbe([GEEN_UPDATERECHT], async (ep) => {
      const { tabelEigenaarProblemen } = await import('./controles.ts');
      return tabelEigenaarProblemen(ep.spelers, resources);
    });

    expect(verslag.meldingen.some(isOvergeslagen(TABEL))).toBe(true);
    expect(problemen).toStrictEqual(verslag.problemen);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-10: de probe in generatorvorm (openGeneratorProbe, tabel security_probes_gen).
// ---------------------------------------------------------------------------------------------------------------------
type GeneratorOpzet = EigenaarOpzet & { readonly routes: Routes };
interface GeneratorProbe {
  readonly spelers: Spelers;
  readonly opzet: () => GeneratorOpzet;
  readonly sluit: () => Promise<void>;
}
const probeModule = z.object({ openGeneratorProbe: z.custom<() => Promise<GeneratorProbe>>(isFunctie) });
const GEN_TABEL = 'public.security_probes_gen';

async function metGeneratorProbe<T>(werk: (gp: GeneratorProbe) => Promise<T>): Promise<T> {
  const gelezen = probeModule.safeParse(await import('./probe-eigenaar.ts'));
  expect(gelezen.success, 'test/security/probe-eigenaar.ts exporteert openGeneratorProbe()').toBe(true);
  if (!gelezen.success) throw new Error('test/security/probe-eigenaar.ts exporteert openGeneratorProbe niet');
  const gp = await gelezen.data.openGeneratorProbe();
  try {
    return await werk(gp);
  } finally {
    await gp.sluit();
  }
}

function heeftLimit(opzet: GeneratorOpzet): boolean {
  const lijst = Object.values(opzet.resources)[0]?.lijst;
  const route = opzet.routes.find((kandidaat) => `${kandidaat.contract.method} ${kandidaat.contract.path}` === lijst);
  const veld: unknown = Object.entries(route?.contract.input.shape ?? {}).find(([naam]) => naam === 'limit')?.[1];
  return veld instanceof z.ZodType && z.safeParse(veld, 1).success;
}

describe('suitecontract/AC-10: de probe in generatorvorm haalt alle controles', { timeout: LANG }, () => {
  test('suitecontract/AC-10: de probe heeft de sjabloontabel met alleen insert op label (geen update-grant) en een lijst met limit, zonder PATCH en GET /:id', async () => {
    const uitkomst = await metGeneratorProbe(async (gp) => {
      const opzet = gp.opzet();
      const tabellen = await eigenaarTabellen(gp.spelers);
      const rechten = await gp.spelers.db.withUser(gp.spelers.B.actor, (tx) =>
        rijenVan(
          tx,
          sql`select has_any_column_privilege('public.security_probes_gen', 'UPDATE') as update_recht,
            has_column_privilege('public.security_probes_gen', 'label', 'INSERT') as insert_label`,
        ),
      );
      const acties = Object.values(opzet.classificatie).flatMap((klasse) =>
        klasse.scope === 'eigenaar' ? [klasse.actie] : [],
      );
      return { tabellen, rechten, acties: acties.sort(), labels: labelsVan(opzet.routes), limit: heeftLimit(opzet) };
    });

    expect(uitkomst.tabellen).toContain(GEN_TABEL);
    expect(uitkomst.rechten).toStrictEqual([{ update_recht: false, insert_label: true }]);
    expect(uitkomst.acties).toStrictEqual(['create', 'delete', 'list']);
    expect(uitkomst.labels.some((label) => label.startsWith('PATCH '))).toBe(false);
    expect(uitkomst.labels.some((label) => label.startsWith('GET ') && label.includes(':'))).toBe(false);
    expect(uitkomst.limit).toBe(true);
  });

  test('suitecontract/AC-10: tabelEigenaarVerslag geeft geen problemen en meldt de overgeslagen update-proef met de tabelnaam', async () => {
    const verslag = await metGeneratorProbe((gp) => verslagVan(gp.spelers, gp.opzet().resources));

    expect(verslag.problemen).toStrictEqual([]);
    expect(verslag.meldingen.some(isOvergeslagen(GEN_TABEL))).toBe(true);
  });

  test('suitecontract/AC-10: spoofDbProblemen geeft geen problemen', async () => {
    const problemen = await metGeneratorProbe((gp) => spoofDbProblemen(gp.spelers, gp.opzet().resources));

    expect(problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-10: eigenaarApiProblemen geeft geen problemen', async () => {
    const problemen = await metGeneratorProbe((gp) => eigenaarApiProblemen(gp.opzet()));

    expect(problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-10: spoofApiProblemen geeft geen problemen', async () => {
    const problemen = await metGeneratorProbe((gp) => spoofApiProblemen(gp.opzet()));

    expect(problemen).toStrictEqual([]);
  });

  test('suitecontract/AC-10: de classificatiecontrole geeft geen problemen (elke route geclassificeerd, elke owner-tabel een regel)', async () => {
    const problemen = await metGeneratorProbe(async (gp) => {
      const opzet = gp.opzet();
      const classificatie: Classificatie = opzet.classificatie;
      return classificatieProblemen({
        routes: labelsVan(opzet.routes),
        classificatie,
        resources: opzet.resources,
        eigenaarTabellen: await eigenaarTabellen(gp.spelers),
      });
    });

    expect(problemen).toStrictEqual([]);
  });
});
