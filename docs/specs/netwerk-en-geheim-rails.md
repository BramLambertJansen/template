---
status: voorstel
namespace: netwerk-en-geheim-rails
---

# Netwerk- en geheimrails

## Doel

Twee lintregels (ST-15, ADR 0077) laten netwerk buiten de uitgaande client (R-CODE-12) en een geheim van een koppeling
buiten `secret()` (R-SEC-05) falen.

## Rollen en wie wat ziet

n.v.t. — lintregels voor ontwikkelaars, geen gedrag in de app.

## Datawijzigingen (met grants)

n.v.t. — geen migratie of tabel.

## Routes en foutcodes

n.v.t. — geen route of foutcode.

## Kopieer de vorm van

- `eslint.config.js` — rail `fetch` en `kooi`: `restrict(rule, files, ignores, message, selectors)`, naam in
  `ruleNames`, `fromModule` voor imports, `TESTS` als uitsluiting.
- `test/rails/eslint-web.test.ts` — fixtures als `{ name, file, code, rule }` via `railsIn`; precies één melding of geen.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI.
- Staten per scherm: n.v.t.
- Alle zichtbare tekst letterlijk (meldingen):
  - `rails/netwerk-api`: "Netwerk vanuit src/api en src/core/api alleen via de uitgaande client: gebruik
    createOutboundClient uit '#core/api/outbound' (R-CODE-12, ADR 0077). Geen node:http(s), net, tls, undici,
    node:module, globale fetch/WebSocket of globalThis."
  - `rails/geheim`: "Een geheim van een koppeling alleen via secret(ctx, …) uit '#core/api/env.ts' in readEnv((ctx) => …)
    (R-SEC-05, ADR 0077); ook niet met .optional() of een andere naam."
- Focusvolgorde en toetsenbord: n.v.t.

## Acceptatiecriteria

Fixtures in `test/rails/eslint-netwerk.test.ts`; elke fixture geeft precies `['rails/netwerk-api']`, `['rails/geheim']` of
`[]`. Bestand `src/api/x.ts`, tenzij anders genoemd.

- **netwerk-en-geheim-rails/AC-1** — Gegeven een import van een netwerkmodule, dan meldt `rails/netwerk-api`:
  `import http from 'node:http'`, `import { request } from 'https'` (in `src/core/api/x.ts`), `import { connect } from
'node:http2'`, `'net'`, `'node:tls'`, `'dgram'`, `import { Agent } from 'undici'` en `'undici/agent'`.
- **netwerk-en-geheim-rails/AC-2** — Gegeven een omzeiling via een andere importvorm, dan meldt de rail: `await
import('node:https')`, `export * from 'node:net'`, `export { connect } from 'tls'`, `require('node:http')` (met
  `declare const require: (m: string) => unknown;`) en `import { createRequire } from 'node:module'`.
- **netwerk-en-geheim-rails/AC-3** — Gegeven een globale netwerk-API, dan meldt de rail: `await fetch('https://x')`,
  `const f = fetch;`, `use({ fetch })` (afkorting), `new WebSocket('wss://x')`, `new EventSource('x')` en
  `new XMLHttpRequest()`.
- **netwerk-en-geheim-rails/AC-4** — Gegeven een omzeiling via het globale object, dan meldt de rail:
  `globalThis.fetch('x')`, `globalThis['fetch']('x')`, `const g = globalThis;`, `self.fetch('x')`, `global.fetch('x')` en
  `obj['fetch'](1)`.
- **netwerk-en-geheim-rails/AC-5** — Gegeven een toegestane vorm, dan meldt de rail niets: `app.fetch(r); api.fetch(r);`,
  `const o = { fetch: async (r: Request) => app.fetch(r) };`, `interface F { readonly fetch: (r: Request) => Response }`,
  `class C { fetch() {} }`, `import type { AddressInfo } from 'node:net'` en `export type { AddressInfo } from 'node:net'`.
- **netwerk-en-geheim-rails/AC-6** — Gegeven `import { type AddressInfo } from 'node:net'` (inline type), dan meldt de rail
  `rails/netwerk-api`: onder `verbatimModuleSyntax` blijft de import als laadopdracht staan.
- **netwerk-en-geheim-rails/AC-7** — Gegeven `import http from 'node:http'; await fetch('x');` in
  `src/core/api/outbound/x.ts`, `src/core/api/mail/smtp.ts`, `src/core/api/http/serve.ts`, `src/api/x.test.ts`
  en `src/core/api/x.int.test.ts`, dan meldt `rails/netwerk-api` niets.
- **netwerk-en-geheim-rails/AC-8** — Gegeven in `src/api/env.ts` een sleutel die eindigt op `SECRET`, `TOKEN`,
  `PASSWORD`, `PASSPHRASE`, `API_KEY`, `PRIVATE_KEY` of `SIGNING_KEY` (na `_` of als hele naam, hoofdletterongevoelig)
  met een waarde die geen aanroep `secret(…)` is, dan meldt `rails/geheim`: `z.object({ PARTNER_TOKEN: z.string() })`,
  `{ HOOK_SECRET: … }`, `{ DB_PASSWORD: … }`, `{ X_PASSPHRASE: … }`, `{ X_PRIVATE_KEY: … }`, `{ X_SIGNING_KEY: … }` en
  `{ api_token: z.string() }`.
- **netwerk-en-geheim-rails/AC-9** — Gegeven een omzeiling in `src/api/env.ts`, dan meldt `rails/geheim`: sleutel als
  string `{ 'X_SECRET': z.string() }`, berekend `{ ['X_SECRET']: z.string() }`, template-sleutel `` { [`X_SECRET`]: … } ``,
  gespreid `{ ...{ X_SECRET: z.string() } }`, gekoppeld `{ X_TOKEN: secret(ctx).optional() }` en hernoemd
  `{ X_TOKEN: s(ctx) }`.
- **netwerk-en-geheim-rails/AC-10** — Gegeven `readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, { minBytes: 48 })
}))` of `{ PARTNER_URL: z.url(), TOKEN_TTL: z.number() }` in `src/api/env.ts`, of `{ X_TOKEN: z.string() }` in
  `src/core/api/env.ts` en `src/api/x.ts`, dan meldt `rails/geheim` niets.
- **netwerk-en-geheim-rails/AC-11** — Gegeven de huidige repo, dan is `pnpm lint` groen zonder nieuwe regels in
  `eslint-suppressions.json`. Bij het schrijven gebruikte de zone netwerk alleen in de drie toegestane paden (o.a.
  `outbound/config.ts` met `isIP`, `outbound/testing.ts` met `node:http`); `src/core/api/env.ts` blijft buiten
  `rails/geheim` (`AUTH_SECRET` blijft `z.string().min(1)`).
- **netwerk-en-geheim-rails/AC-12** — De meldingen bevatten letterlijk `createOutboundClient` en `R-CODE-12`, resp.
  `secret(ctx, …)` en `R-SEC-05`; `pnpm test:unit` is groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `import()` met berekend pad | al geweigerd door `rails/import` | n.v.t. |
| `process.getBuiltinModule('node:http')` | al geweigerd door `rails/process-env` | n.v.t. |
| geheim onder een naam buiten de lijst (`PARTNER_KEY`) | niet gezien; review en R-SEC-05 | n.v.t. |
| optioneel geheim (koppeling uit) | geweigerd; register en schakelaar beslissen later | n.v.t. |
| lokale binding `fetch` (`const { fetch } = client`) | geweigerd; kies een andere naam | n.v.t. |

## Raakt ook

- `eslint.config.js`: twee namen in `ruleNames`, twee `restrict()`-blokken; voorReview-pad, de hoofdsessie schrijft het.
- `docs/framework.md` R-CODE-12: na "…en `deploy/<host>/`)" komt "; de lintregel `rails/netwerk-api` weigert daarbuiten
  netwerkmodules, `node:module` en globale `fetch`/`WebSocket`/`globalThis` (eigen server: `src/core/api/http/serve.ts`)".
- `docs/framework.md` R-SEC-05: na "met `secret(ctx, opties)`" komt "(`rails/geheim` weigert daar een sleutel op `SECRET`,
  `TOKEN`, `PASSWORD`, `PASSPHRASE`, `API_KEY`, `PRIVATE_KEY` of `SIGNING_KEY` zonder `secret(…)`)".
- `docs/roadmap.md` ST-15: niet afvinken; uit "Eisen uit het regelboek" gaat "een lintregel weigert netwerk buiten de
  uitgaande client (R-CODE-12) en een geheim van een koppeling buiten `secret()` (R-SEC-05); " (R-DOC-10); de eis voor
  `withJob` blijft.
- `pnpm lint`, `pnpm test:unit`, `pnpm ratchet`, `pnpm check:docs-drift`.
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests.

## Buiten scope

Andere HTTP-bibliotheken (eerst dependency-akkoord, R-SEC-06, dan in de lijst); `node:dns`; `eval` en
`new Function`; `deploy/<host>/` en opslagadapters (een adapter met ADR krijgt zijn pad bij die ADR); de `withJob`-eis en
de overige werkstappen van ST-15.

## Testplan

- **Unit** (`test/rails/eslint-netwerk.test.ts`, vorm van `eslint-web.test.ts`): AC-1 tot en met AC-10 als `test.each`;
  AC-12 met een fixture die de meldingstekst controleert.
- **Regressie**: AC-11 met `pnpm lint` op de hele repo.
- Geen integratietest.

## Open vragen

- **OV-1** — Type-imports van netwerkmodules toestaan? Aanbeveling: alleen `import type`/`export type` (verdwijnen bij
  compileren); inline `type` niet, die laadt de module.
- **OV-2** — Welke sleutels? Aanbeveling: de zeven uit AC-8, hoofdletterongevoelig; `_KEY` niet, omdat publieke sleutels
  dan `secret()` zouden moeten.
- **OV-3** — `globalThis`, `global` en `self` helemaal weigeren? Aanbeveling: ja; een alias is anders niet te volgen.
- **OV-4** — Meer toegestane plekken? Aanbeveling: nee; readiness en auth gaan via `pg`.
