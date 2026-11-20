import { routeLabel, sampleFor, type AppRoute, type RouteSample } from './fixtures.ts';
import type { Role } from '../../src/shared/roles.ts';

// Wat alleen de spec weet (spec security-suite, "Wat niet generiek kan"): welke route bij welke tabel hoort en wie de eigenaar is.
// Alleen gegevens, geen asserties; een testpad, dus een developer kan hier geen uitzondering in zetten (rolhek;
// op GitHub de review van een code-eigenaar, R-REPO-02).
// Eén regel per route in het register (`routes` in src/api/app.ts) en één regel per owner-tabel; ontbreekt er een, dan is de
// suite rood met de naam ervan (AC-11), nooit stil overgeslagen.

export type Actie = 'create' | 'read' | 'list' | 'update' | 'delete';

export type RouteKlasse =
  // Altijd het account uit de sessie (ctx.actor); geen rijen per eigenaar.
  | { readonly scope: 'eigen-account' }
  // Alleen admin met MFA; geen rijen per eigenaar. De reden van de classificatie is een reviewpunt.
  | { readonly scope: 'admin' }
  // Rijen met owner_id: krijgt automatisch de A-tegen-B-tests (AC-9, AC-10).
  | { readonly scope: 'eigenaar'; readonly resource: string; readonly actie: Actie };

export interface ResourceRegel {
  // Twee acteurs met deze toegestane rol; admin-acteurs hebben echte MFA-sessies. Standaard user.
  readonly rol?: Role;
  // 'schema.tabel', zoals de catalogus hem geeft (public.invoices).
  readonly tabel: string;
  readonly sample: {
    // Geldige velden voor de create-route (en, tenzij `rij` er is, de kolommen van een directe insert). Heeft de lijst `q`, dan
    // is de eerste niet-lege tekstwaarde de zoekterm en moet A daarmee deze rij vinden: zet het doorzochte veld vooraan (#813).
    readonly create: Readonly<Record<string, unknown>>;
    // Een tweede, andere geldige rij: B en A krijgen er twee, zodat paginering via cursor echt meer dan één pagina geeft.
    readonly createTweede: Readonly<Record<string, unknown>>;
    // Een geldige, van create en createTweede verschillende (unieke) create-input voor de spoof-controle (AC-10): die voegt er een
    // onbekend veld aan toe en eist 400 VALIDATION. Verplicht zodra er een create-route is; ontbreekt hij, dan is de suite rood.
    readonly spoof?: Readonly<Record<string, unknown>>;
    // Geldige velden voor de update-route. Alleen nodig bij een update-route (API-controle) of als de app-rol UPDATE-recht op
    // de tabel heeft (databasecontrole, tenzij `updateRij` er is); zonder update-route en zonder update-grant mag hij weg.
    readonly update?: Readonly<Record<string, unknown>>;
    // De kolom (met waarde) voor de directe update-proef op de database, als de veldnamen van de API afwijken van de
    // kolomnamen (zelfde patroon als `rij` naast `create`). Gaat voor op `update`.
    readonly updateRij?: Readonly<Record<string, unknown>>;
    // De kolommen voor een directe insert, als de veldnamen van de API afwijken van de kolomnamen.
    readonly rij?: Readonly<Record<string, unknown>>;
  };
  // 'GET /pad' van de lijstroute (eigenaar-route met actie list).
  readonly lijst: string;
}

// De routes van het huidige register zijn eigen-account of admin; er is nog geen owner-resource in de template.
export const routeClassificatie: Readonly<Record<string, RouteKlasse>> = {
  'GET /me': { scope: 'eigen-account' },
  'PATCH /me': { scope: 'eigen-account' },
  'GET /me/sessions': { scope: 'eigen-account' },
  'DELETE /me/sessions/:id': { scope: 'eigen-account' },
  'POST /me/sessions/revoke-others': { scope: 'eigen-account' },
  'POST /me/email/bevestigen': { scope: 'eigen-account' },
  'GET /accounts': { scope: 'admin' },
  'POST /accounts/invite': { scope: 'admin' },
  'POST /accounts/:id/reinvite': { scope: 'admin' },
  'POST /accounts/:id/block': { scope: 'admin' },
  'POST /accounts/:id/unblock': { scope: 'admin' },
  'POST /accounts/:id/deactivate': { scope: 'admin' },
  'POST /accounts/:id/activate': { scope: 'admin' },
};

// De probe-resource van de suite zelf (public.security_probes, opgebouwd uit scripts/kit/templates/migratie.sql.tmpl plus het
// veld label, zie fixtures.ts). Een app voegt hier één regel per resource toe.
export const resources: Readonly<Record<string, ResourceRegel>> = {
  security_probes: {
    tabel: 'public.security_probes',
    sample: {
      create: { label: 'beveiligingstest-a' },
      createTweede: { label: 'beveiligingstest-b' },
      spoof: { label: 'beveiligingstest-spoof' },
      update: { label: 'beveiligingstest-gewijzigd' },
    },
    lijst: 'GET /probes',
  },
};

// De routes van de probe-app (test/security/probe-eigenaar.ts): dezelfde vorm als routeClassificatie, voor AC-9 en AC-10.
export const probeRouteClassificatie: Readonly<Record<string, RouteKlasse>> = {
  'POST /probes': { scope: 'eigenaar', resource: 'security_probes', actie: 'create' },
  'GET /probes': { scope: 'eigenaar', resource: 'security_probes', actie: 'list' },
  'GET /probes/:id': { scope: 'eigenaar', resource: 'security_probes', actie: 'read' },
  'PATCH /probes/:id': { scope: 'eigenaar', resource: 'security_probes', actie: 'update' },
  'DELETE /probes/:id': { scope: 'eigenaar', resource: 'security_probes', actie: 'delete' },
};

// De probe in generatorvorm (test/security/probe-eigenaar.ts, openGeneratorProbe; spec suite-volgt-contract, ontwerp 6): de
// tabel uit de sjabloon met alleen `grant insert (label)`, en de routes die de generator maakt minus bewerken. Geen
// sample.update: er is geen update-route en geen update-grant.
export const generatorProbeResources: Readonly<Record<string, ResourceRegel>> = {
  security_probes_gen: {
    tabel: 'public.security_probes_gen',
    sample: {
      create: { label: 'beveiligingstest-gen-a' },
      createTweede: { label: 'beveiligingstest-gen-b' },
      spoof: { label: 'beveiligingstest-gen-spoof' },
    },
    lijst: 'GET /probes-gen',
  },
};

export const generatorProbeRouteClassificatie: Readonly<Record<string, RouteKlasse>> = {
  'POST /probes-gen': { scope: 'eigenaar', resource: 'security_probes_gen', actie: 'create' },
  'GET /probes-gen': { scope: 'eigenaar', resource: 'security_probes_gen', actie: 'list' },
  'DELETE /probes-gen/:id': { scope: 'eigenaar', resource: 'security_probes_gen', actie: 'delete' },
};

// Een voorbeeldinput die niet uit het zod-schema af te leiden is, per route ('METHODE /pad'). Leeg zolang elke route afleidbaar
// is. fixtures.sampleFor wijst hierheen ("voeg sample toe aan test/security/resources.ts"). Elke test haalt zijn sample via
// sampleVoor (ook routes.int.test.ts, AC-2 t/m AC-7), dus een regel hier geldt voor de hele suite.
export const routeSamples: Readonly<Record<string, RouteSample>> = {};

// De gedeclareerde sample voor de route, anders de afgeleide (sampleFor). De samples-map is alleen voor tests van deze functie.
export function sampleVoor(
  route: AppRoute,
  samples: Readonly<Record<string, RouteSample>> = routeSamples,
): RouteSample {
  const gedeclareerd = new Map(Object.entries(samples)).get(routeLabel(route));
  return gedeclareerd ?? sampleFor(route);
}
