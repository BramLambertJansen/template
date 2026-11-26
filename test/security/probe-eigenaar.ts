import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineRoute } from '../../src/api/kit.ts';
import type { AppServices } from '../../src/api/services.ts';
import type { TestDb, TestUser } from '../../src/core/api/db/testing.ts';
import type { Tx } from '../../src/core/api/db/types.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp, type App, type AppConfig } from '../../src/core/api/http/create-app.ts';
import { containsPattern, decodeListCursor } from '../../src/core/api/route/list-query.ts';
import { decodeCursor, encodeCursor, pageSchema } from '../../src/core/shared/cursor.ts';
import {
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_ID_LENGTH,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  MAX_TIMESTAMP_LENGTH,
} from '../../src/core/shared/limits.ts';
import { defineListSearch } from '../../src/core/shared/list-search.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import { errors } from '../../src/shared/errors.ts';
import { APP_ORIGIN } from '../auth/harness.ts';
import {
  classificatieProblemen,
  type Aanroep,
  type EigenaarOpzet,
  type Spelers,
  type Wie,
  type Zender,
} from './controles.ts';
import { heeftBody, leesAntwoord, openProbe, openProbeDb, sjabloonStatements, type Probe } from './fixtures.ts';
import { rijenVan } from './hulp.ts';
import {
  generatorProbeResources,
  generatorProbeRouteClassificatie,
  probeRouteClassificatie,
  resources,
} from './resources.ts';

// De eigenaar-routes van de probe-resource (public.security_probes, fixtures.ts) in de vorm die een app voor een resource
// zou schrijven: create, lijst met cursor en q, lezen, wijzigen en verwijderen, allemaal onder RLS. Testfixtures, geen app-code.
// De sessie komt uit de test-gateway van asUser (de tabel bestaat alleen binnen de testtransactie, zie fixtures.ts).

const rijSchema = z.object({ id: z.string(), label: z.string() }).strict();
const labelVeld = { label: z.string().min(1).max(MAX_SEARCH_LENGTH) };
const idVeld = { id: z.uuid() };
const cursorSleutel = z.object({ id: z.uuid() }).strict();

const SELECTEER = sql`select p.id::text as id, p.label from public.security_probes p`;

async function leesRij(tx: Tx, id: string): Promise<z.infer<typeof rijSchema>> {
  const rijen = await rijenVan(tx, sql`${SELECTEER} where p.id = ${id}::uuid`);
  if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
  return rijSchema.parse(rijen[0]);
}

async function maak({ tx, input }: { tx: Tx; input: { label: string } }) {
  const rijen = await rijenVan(
    tx,
    sql`insert into public.security_probes (label) values (${input.label}) returning id::text as id, label`,
  );
  return rijSchema.parse(rijen[0]);
}

const create = defineRoute(
  defineContract({
    method: 'POST',
    path: '/probes',
    input: z.object(labelVeld).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  maak,
);

// Bewust gebroken: dezelfde route zonder .strict() (defineContract weigert dat, defineRoute zelf niet). Alleen voor de zelftest (AC-13).
const createLos = defineRoute(
  { method: 'POST', path: '/probes', input: z.object(labelVeld), output: rijSchema, permission: 'app.use' },
  maak,
);

function cursorId(cursor: string): string {
  try {
    return decodeCursor(cursor, cursorSleutel).id;
  } catch {
    throw new AppError('VALIDATION');
  }
}

const lijstContract = defineContract({
  method: 'GET',
  path: '/probes',
  input: z
    .object({
      q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
      cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
      limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    })
    .strict(),
  output: pageSchema(rijSchema),
  permission: 'app.use',
});

const lijst = defineRoute(lijstContract, async ({ tx, input }) => {
  const na = input.cursor === undefined ? sql`` : sql`and p.id > ${cursorId(input.cursor)}::uuid`;
  const zoek = input.q === undefined ? sql`` : sql`and position(lower(${input.q}) in lower(p.label)) > 0`;
  const rijen = await rijenVan(tx, sql`${SELECTEER} where true ${na} ${zoek} order by p.id limit ${input.limit + 1}`);
  const items = rijen.slice(0, input.limit).map((rij) => rijSchema.parse(rij));
  const laatste = items.at(-1);
  const nextCursor = rijen.length > input.limit && laatste !== undefined ? encodeCursor({ id: laatste.id }) : null;
  return { items, nextCursor };
});

// Bewust gebroken: de lijst geeft elke pagina dezelfde cursor, zodat de paginering nooit eindigt (alleen voor de zelftest, AC-13).
const lijstOneindig = defineRoute(lijstContract, () => ({
  items: [],
  nextCursor: encodeCursor({ id: '00000000-0000-4000-8000-000000000000' }),
}));

const lees = defineRoute(
  defineContract({
    method: 'GET',
    path: '/probes/:id',
    input: z.object(idVeld).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  ({ tx, input }) => leesRij(tx, input.id),
);

// RLS filtert de rijen van een ander weg: 0 rijen is "bestaat niet", dezelfde NOT_FOUND als bij een onbekend id.
const wijzig = defineRoute(
  defineContract({
    method: 'PATCH',
    path: '/probes/:id',
    input: z.object({ ...idVeld, ...labelVeld }).strict(),
    output: rijSchema,
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(
      tx,
      sql`update public.security_probes set label = ${input.label} where id = ${input.id}::uuid returning id::text as id, label`,
    );
    if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
    return rijSchema.parse(rijen[0]);
  },
);

const verwijder = defineRoute(
  defineContract({
    method: 'DELETE',
    path: '/probes/:id',
    input: z.object(idVeld).strict(),
    output: z.null(),
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(tx, sql`delete from public.security_probes where id = ${input.id}::uuid returning id`);
    if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
    return null;
  },
);

export const EIGENAAR_ROUTES = [create, lijst, lees, wijzig, verwijder] as const;
export const EIGENAAR_ROUTES_ONEINDIG = [create, lijstOneindig, lees, wijzig, verwijder] as const;
export const EIGENAAR_ROUTES_LOS = [createLos, lijst, lees, wijzig, verwijder] as const;

// ---------------------------------------------------------------------------------------------------------------------
// De probe in generatorvorm (spec suite-volgt-contract, ontwerp 6): wat `pnpm new:resource` maakt, minus bewerken. De lijst
// heeft het contract uit defineListSearch met pageSize en een handler zoals scripts/kit/templates/route.ts.tmpl voorschrijft
// (decodeListCursor, containsPattern, input.limit); geen PATCH en geen GET /:id. Zo gaat generatorvorm door dezelfde controles.
// ---------------------------------------------------------------------------------------------------------------------
const GEN_PAD = '/probes-gen';

const genSearch = defineListSearch({
  sorts: ['nieuwste', 'oudste'],
  filters: {},
  cursorKeys: { nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH], oudste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH] },
  pageSize: DEFAULT_PAGE_SIZE,
});

const genRij = z.object({ id: z.string(), label: z.string(), aangemaakt: z.string() }).strict();
const genId = z.object({ id: z.string() }).strict();
// ISO 8601 met microseconden: dezelfde waarde gaat ongewijzigd terug in de cursor (zoals src/api/routes/accounts.ts).
const GEN_SELECTEER = sql`select p.id::text as id, p.label, to_json(p.created_at) #>> '{}' as aangemaakt
  from public.security_probes_gen p`;

const genCreate = defineRoute(
  defineContract({
    method: 'POST',
    path: GEN_PAD,
    input: z.object(labelVeld).strict(),
    output: genId,
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(
      tx,
      sql`insert into public.security_probes_gen (label) values (${input.label}) returning id::text as id`,
    );
    return genId.parse(rijen[0]);
  },
);

const genLijst = defineRoute(
  defineContract({
    method: 'GET',
    path: GEN_PAD,
    input: genSearch.api,
    output: pageSchema(genRij),
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const { sort, q, limit } = input;
    const van = decodeListCursor(genSearch, input, [z.iso.datetime({ offset: true }), z.uuid()]);
    const aflopend = sort === 'nieuwste';
    const operator = aflopend ? sql`<` : sql`>`;
    const na =
      van === null ? sql`` : sql`and (p.created_at, p.id) ${operator} (${van[0]}::timestamptz, ${van[1]}::uuid)`;
    const zoek = q === undefined ? sql`` : sql`and p.label ilike ${containsPattern(q)}`;
    const volgorde = aflopend ? sql`p.created_at desc, p.id desc` : sql`p.created_at asc, p.id asc`;
    const rijen = await rijenVan(
      tx,
      sql`${GEN_SELECTEER} where true ${na} ${zoek} order by ${volgorde} limit ${limit + 1}`,
    );
    const items = rijen.slice(0, limit).map((rij) => genRij.parse(rij));
    const laatste = items.at(-1);
    const meer = rijen.length > limit && laatste !== undefined;
    return { items, nextCursor: meer ? genSearch.encodeCursor(sort, [laatste.aangemaakt, laatste.id]) : null };
  },
);

const genVerwijder = defineRoute(
  defineContract({
    method: 'DELETE',
    path: `${GEN_PAD}/:id`,
    input: z.object(idVeld).strict(),
    output: z.null(),
    permission: 'app.use',
  }),
  async ({ tx, input }) => {
    const rijen = await rijenVan(
      tx,
      sql`delete from public.security_probes_gen where id = ${input.id}::uuid returning id`,
    );
    if (rijen[0] === undefined) throw new AppError('NOT_FOUND');
    return null;
  },
);

export const GENERATOR_ROUTES = [genCreate, genLijst, genVerwijder] as const;

export const labelsVan = (
  lijstMetRoutes: readonly { readonly contract: { method: string; path: string } }[],
): string[] => lijstMetRoutes.map(({ contract }) => `${contract.method} ${contract.path}`);

const notUsed = () => Promise.reject(new Error('niet gebruikt in de probe-app'));
const unusedServices: AppServices = {
  invitations: { invite: notUsed, reinvite: notUsed, revoke: notUsed, sendResetLink: notUsed },
  profile: { rename: notUsed, confirmEmail: notUsed },
  sessions: { list: notUsed, revoke: notUsed, revokeOthers: notUsed, revokeAll: notUsed },
};

function verzoek(aanroep: Aanroep): Request {
  const pad = aanroep.pad.replace(/:([A-Za-z0-9_]+)/g, (_, naam: string) =>
    encodeURIComponent(aanroep.params[naam] ?? ''),
  );
  const body = heeftBody(aanroep.method);
  const query = body
    ? ''
    : `?${new URLSearchParams(Object.entries(aanroep.invoer).map(([naam, waarde]) => [naam, String(waarde)])).toString()}`;
  return new Request(`${APP_ORIGIN}/api${pad}${query}`, {
    method: aanroep.method,
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: APP_ORIGIN },
    ...(body ? { body: JSON.stringify(aanroep.invoer) } : {}),
  });
}

type Routes = NonNullable<AppConfig<AppServices>['routes']>;

export interface EigenaarProbe {
  readonly probe: Probe;
  readonly spelers: Spelers;
  // De opzet voor AC-9/AC-10 via de API: A en B bellen dezelfde app (elk met de eigen vaste sessie).
  readonly opzet: (routes?: Routes) => EigenaarOpzet;
  // De ruwe app van één gebruiker, voor een probe-specifiek verzoek.
  readonly appVoor: (wie: Wie, routes?: Routes) => App;
  // Voert DDL uit als eigenaar van het schema (app_migrator, zoals een migratie); alles draait terug.
  readonly alsEigenaar: (statements: readonly string[]) => Promise<void>;
  readonly sluit: () => Promise<void>;
}

interface Bron {
  readonly db: TestDb;
  readonly gebruikers: Readonly<Record<Wie, TestUser>>;
}

type Declaratie = Pick<EigenaarOpzet, 'classificatie' | 'resources'>;

function appVan(bron: Bron, wie: Wie, routes: Routes): App {
  return createApp<AppServices>({
    appOrigin: APP_ORIGIN,
    auth: bron.gebruikers[wie].auth,
    withUser: bron.db.withUser,
    services: unusedServices,
    routes,
    errors,
  });
}

// A en B bellen dezelfde routes, elk met de eigen vaste sessie; `routes` gaat mee, zodat de suite het lijstcontract kan lezen.
function opzetVan(bron: Bron, routes: Routes, declaratie: Declaratie): EigenaarOpzet & { readonly routes: Routes } {
  const apps = { A: appVan(bron, 'A', routes), B: appVan(bron, 'B', routes) };
  const zend: Zender = async (wie, aanroep) => leesAntwoord(await apps[wie].fetch(verzoek(aanroep)));
  const { A, B } = bron.gebruikers;
  return { zend, ...declaratie, routes, gebruikers: { A: A.actor.userId, B: B.actor.userId } };
}

// Opent de probe-resource (fixtures.openProbe) met twee gewone gebruikers A en B.
export async function openEigenaarProbe(): Promise<EigenaarProbe> {
  const probe = await openProbe();
  const gebruikers = { A: await probe.db.asUser('user'), B: await probe.db.asUser('user') };
  const bron: Bron = { db: probe.db, gebruikers };
  const declaratie = { classificatie: probeRouteClassificatie, resources };
  return {
    probe,
    spelers: { db: probe.db, A: gebruikers.A, B: gebruikers.B },
    opzet: (routes = EIGENAAR_ROUTES) => opzetVan(bron, routes, declaratie),
    appVoor: (wie, routes = EIGENAAR_ROUTES) => appVan(bron, wie, routes),
    alsEigenaar: (statements) => alsEigenaar(probe.db, statements),
    sluit: () => probe.sluit(),
  };
}

export interface GeneratorProbe {
  readonly spelers: Spelers;
  readonly opzet: () => EigenaarOpzet & { readonly routes: Routes };
  readonly sluit: () => Promise<void>;
}

const GEN_TABEL = 'security_probes_gen';

// Opent in een eigen terugdraaiende transactie de probe in generatorvorm: de sjabloontabel met het veld label en alleen
// `grant insert (label)` (de sjabloon geeft select en delete; er is geen update-grant), met twee gewone gebruikers A en B.
export async function openGeneratorProbe(): Promise<GeneratorProbe> {
  const { db, sluit } = await openProbeDb([
    ...sjabloonStatements(GEN_TABEL),
    `alter table public.${GEN_TABEL} add column label text not null`,
    `grant insert (label) on public.${GEN_TABEL} to app_authenticated`,
  ]);
  const gebruikers = { A: await db.asUser('user'), B: await db.asUser('user') };
  const declaratie = { classificatie: generatorProbeRouteClassificatie, resources: generatorProbeResources };
  return {
    spelers: { db, A: gebruikers.A, B: gebruikers.B },
    opzet: () => opzetVan({ db, gebruikers }, GENERATOR_ROUTES, declaratie),
    sluit,
  };
}

async function alsEigenaar(db: TestDb, statements: readonly string[]): Promise<void> {
  const beheerder = await db.asUser('admin');
  await db.withUser(beheerder.actor, async (tx) => {
    // Terug naar de sessiegebruiker (app_migrator): DDL kan niet als app_authenticated. Alles draait terug (zie fixtures.openProbe).
    await tx.execute(sql.raw('reset role'));
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
}

// AC-11 voor de probe-app: elke route van de probe-app is geclassificeerd en wijst naar een gedeclareerde resource.
export function probeClassificatieProblemen(owner: readonly string[]): string[] {
  return classificatieProblemen({
    routes: labelsVan(EIGENAAR_ROUTES),
    classificatie: probeRouteClassificatie,
    resources,
    eigenaarTabellen: owner,
  });
}
