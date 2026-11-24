---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: idempotentie
---

# Idempotente mutaties: één bouwsteen voor geld en voorraad

Uitwerking van R-CODE-11 en [ADR 0045](../adr/0045-railwerk.md) punt 28, die het patroon noemen (request-UUID, bonnetabel met
payload-hash, advisory lock, tombstone) zonder dat core er een bouwsteen voor heeft. Aanleiding: verzoek van de eigenaar
(2026-11-23), app-behoefte: een app met saldo's en verkoop kan nu alleen per route een eigen oplossing bedenken.

Bouwen in twee delen, elk een eigen PR:

| Deel | Inhoud | Wacht op | AC's |
|---|---|---|---|
| **A — bonnetabel, route kit en client** | migratie `app.request_receipts` met twee functies, contractoptie `idempotent`, verloop in de route kit, foutcode, sleutel in de API-client, hook `useRequestKey`, dekkingstest, gouden pad | spec `goedgekeurd` | AC-1 t/m AC-14 |
| **B — tombstone** | taak die het bewaarde antwoord na de termijn leegt, foutcode `REQUEST_ALREADY_PROCESSED` | A, en de runner van de spec [achtergrondtaken](achtergrondtaken.md) gebouwd (ST-03) | AC-15 t/m AC-17 |

Tot deel B gebouwd is, blijft het bewaarde antwoord staan; de garantie "hooguit één keer" geldt vanaf deel A.

## Doel

Een route die geld of voorraad muteert, verwerkt dezelfde bewuste actie hooguit één keer, ook als het antwoord verloren ging of
twee verzoeken tegelijk binnenkomen, via één bouwsteen in de route kit die elke app hergebruikt.

## Rollen en wie wat ziet

| Rol | Bon van een eigen verzoek | Bon van een ander |
|---|---|---|
| anoniem | niets (`UNAUTHENTICATED`) | niets |
| elke ingelogde rol | het bewaarde antwoord, alleen via een herhaling van hetzelfde verzoek op dezelfde route, na dezelfde rol-, permissie- en MFA-controle als de eerste keer | niets: een sleutel geldt per actor, dezelfde sleutel van een ander is een los verzoek |
| `app_definer` | lezen en schrijven via de twee functies | |
| `app_jobs` | alleen de functie van klasse `job` uit deel B | |

Geen scherm en geen route toont bonnen; ook een beheerrol ziet ze niet.

## Datawijzigingen (met grants)

**Deel A**, één nieuwe migratie:

- **`app.request_receipts`**:
  - `actor_id text not null references better_auth."user"(id) on delete cascade`;
  - `request_key uuid not null`; primaire sleutel `(actor_id, request_key)`;
  - `operation text not null`, CHECK lengte 1 t/m 200: methode en padsjabloon van het contract (`POST /orders/:id/refund`), nooit het ingevulde pad;
  - `payload_hash text not null`, CHECK 64 hextekens: SHA-256 over de gevalideerde input in vaste sleutelvolgorde;
  - `response jsonb`: het door het outputschema gevalideerde antwoord; null na de tombstone (deel B);
  - `created_at timestamptz not null default now()`.
- RLS aan en geforceerd. Geen grant aan `app_authenticated`. `select, insert` aan `app_definer` met policy
  `request_receipts_definer_all` (`to app_definer`); in deel B komt `update (response)` erbij. Nooit `delete`: een bon verdwijnt
  alleen via de cascade van een accountverwijdering.
- **`app.claim_request(p_key uuid, p_operation text, p_payload_hash text)`** → `table (state text, response jsonb)`, klasse `client`,
  `security definer`, eigenaar `app_definer`, `set search_path = ''`. Leest de actor uit `app.current_user_id()` (zonder actor
  42501), neemt `pg_advisory_xact_lock(<namespace>, hashtext(actor || p_key))` in de twee-sleutelvorm met een eigen
  namespace-constante, en geeft `new` (geen bon), `replay` (bon met gelijke `operation` en `payload_hash`, met `response`),
  `conflict` (bon met een andere `operation` of `payload_hash`) of, na deel B, `processed` (bon met `response` null).
- **`app.store_receipt(p_key uuid, p_operation text, p_payload_hash text, p_response jsonb)`** → `void`, zelfde klasse en vorm.
  Weigert met 42501 buiten een transactie waarin `app.claim_request` voor dezelfde sleutel `new` gaf (de functie controleert dat
  de advisory lock van deze transactie is) en weigert een `p_response` boven `MAX_RECEIPT_RESPONSE_BYTES`.
- Regels in `db/tests/functies.sql`; rij in **`app.retention`**: tijdkolom `created_at`, termijn null, opruimer `app`, reden
  "sleutel en hash blijven zolang het account bestaat, anders boekt een late herhaling opnieuw; het antwoord wordt na de
  termijn van deel B geleegd".
- De namespace-constante staat naast die van andere advisory locks; een test bewijst dat ze onderling verschillen.

**Deel B**, eigen migratie: `app.tombstone_receipts(p_limit integer)` van klasse `job` (`execute` alleen aan `app_jobs`) zet
`response = null` voor bonnen ouder dan `app.retention_cutoff`-stijl termijn `RECEIPT_RESPONSE_DAYS`, in batches met een vaste
bovengrens in de functie.

## Routes en foutcodes

Geen nieuwe route. Een bestaand of nieuw contract krijgt de optie `idempotent: true` (`src/core/shared/contract.ts`, naast
`rateLimit`); `defineContract` weigert de optie op `GET`.

| Verzoek op een contract met `idempotent: true` | Uitkomst |
|---|---|
| zonder header `Idempotency-Key`, of geen uuid | `VALIDATION`, geen aanroep van de handler |
| eerste keer | handler loopt; bij succes bon en mutatie in dezelfde transactie |
| herhaling met dezelfde sleutel, route en input | het bewaarde antwoord met dezelfde HTTP-status en header `Idempotency-Replayed: true`; de handler loopt niet |
| dezelfde sleutel met een andere route of input | `REQUEST_ID_CONFLICT`, geen mutatie |
| herhaling na de tombstone (deel B) | `REQUEST_ALREADY_PROCESSED`, geen mutatie |

**Nieuwe foutcodes**, beide in core (`src/core/shared/errors.ts`, tekst in `src/core/web/copy/errors.ts`):

| Code | HTTP | Deel |
|---|---|---|
| `REQUEST_ID_CONFLICT` | 409 | A |
| `REQUEST_ALREADY_PROCESSED` | 409 | B |

**Verloop in de route kit** (`src/core/api/route/kit.ts` en de uitvoering in `createApp`), binnen de ene `withUser()` van de route:

1. sessie (`UNAUTHENTICATED`), rate limit (`RATE_LIMITED`), inputvalidatie met de sleutel uit de header (`VALIDATION`);
2. rol, permissie en MFA (`FORBIDDEN`, `MFA_REQUIRED`): altijd vóór de bon, zodat een geblokkeerde of gedegradeerde gebruiker
   ook bij een herhaling niets terugkrijgt;
3. `app.claim_request`: `replay` → het bewaarde antwoord; `conflict` → `REQUEST_ID_CONFLICT`; `processed` →
   `REQUEST_ALREADY_PROCESSED`; `new` → verder;
4. de handler; zijn antwoord gaat door het outputschema;
5. `app.store_receipt` met het gevalideerde antwoord, daarna commit.

Een fout uit de handler (ook een domeinafwijzing zoals onvoldoende saldo) rolt de transactie terug: er komt geen bon, en een
herhaling met dezelfde sleutel wordt opnieuw beoordeeld. Bij `replay` lopen `ctx.audit`, `afterCommit` en `afterRollback` niet:
ze horen bij het oorspronkelijke verzoek. De handler ziet de sleutel niet; een route hoeft niets te doen behalve de optie zetten.

**Grenzen** in `src/core/shared/limits.ts`: `MAX_RECEIPT_RESPONSE_BYTES = 16_384` (hard; een groter antwoord op een idempotente
route is `INTERNAL_ERROR` met rollback) en `RECEIPT_RESPONSE_DAYS` (deel B, OV-2).

**Dekking** (R-CODE-11 als check): een test loopt over alle contracten van de app en faalt als een niet-`GET`-contract waarvan
het inputschema ergens `Cents` bevat, `idempotent: true` mist. Voorraad heeft geen eigen type; daar blijft het review (OV-5).

**Partnerroutes**: `definePartnerRoute` met `idempotent: true` valt buiten deze spec (zie Buiten scope); `defineContract` weigert
de combinatie tot die er is.

## Kopieer de vorm van

- `db/migrations/20261103160000_one_time_use.sql` — functie van `app_definer` met `set search_path = ''` die een eenmalig gebruik claimt.
- `db/migrations/20261011120000_rate_limits.sql` — interne tabel zonder grant aan `app_authenticated`, alleen bereikbaar via een `client`-functie.
- `db/tests/one_time_use.sql` — pgTAP voor de functie en de policy op naam; `db/tests/functies.sql` voor de catalogusregels.
- `test/auth/eenmalig.int.test.ts` — racetest met twee gelijktijdige verzoeken tegen de echte stack.
- `src/core/shared/contract.ts` — contractoptie naast `rateLimit`, met weigering in `defineContract`.
- `src/core/api/outbound/request.ts` — vormcontrole van een idempotentiesleutel.
- `src/core/web/lib/api-client.ts` — enige plek met `fetch(`; hier komt de header bij.

## Hergebruik en UX

- **API-client**: voor een contract met `idempotent: true` eist het type van de aanroep een `requestKey`; de client stuurt hem
  als `Idempotency-Key`. Zonder sleutel compileert de aanroep niet.
- **Sleutel**: nieuwe hook `useRequestKey()` in `src/core/web/lib/request-key.ts` geeft `{ key, renew }`. De sleutel ontstaat met
  `crypto.randomUUID()` vóór het eerste verzoek van een bewuste actie en blijft gelijk bij elke herhaling. `renew()` volgt alleen
  op een bevestigde uitkomst: succes, of een antwoord met een foutcode (ook `VALIDATION` en een domeinafwijzing). Een
  netwerkfout, time-out of `INTERNAL_ERROR` is een onbekende uitkomst en vernieuwt de sleutel niet. De sleutel leeft in het
  geheugen van het scherm (OV-3).
- **Bestaande componenten**: `Form`, `FormErrorSummary`, `Button` (`busy`), `Notice` (`tone=warning`), toasts via `useToast()`.
  Geen nieuw component.
- **Staten** van een scherm met een idempotente mutatie: bezig (`busy` op de verzendknop); gelukt (toast van de feature, sleutel
  vernieuwd); afgewezen (foutmelding van de code, sleutel vernieuwd, invoer bewerkbaar); **onbekend** (de `Notice` hieronder, de
  velden van het formulier `disabled`, alleen "Opnieuw proberen" en "Annuleren" actief). "Opnieuw proberen" stuurt hetzelfde
  verzoek met dezelfde sleutel. "Annuleren" vraagt bevestiging, omdat de actie mogelijk al verwerkt is.
- **Alle zichtbare tekst letterlijk** (`src/core/web/copy/ui.ts` en `src/core/web/copy/errors.ts`):

  | Plek | Tekst |
  |---|---|
  | Notice bij onbekende uitkomst | "We weten niet zeker of dit is gelukt. Probeer het opnieuw: er wordt niets dubbel verwerkt." |
  | Knoppen in die staat | "Opnieuw proberen" / "Annuleren" |
  | Bevestiging bij annuleren, titel | "Toch stoppen?" |
  | Bevestiging bij annuleren, tekst | "Het kan zijn dat deze actie al is verwerkt. Controleer het overzicht voordat je het opnieuw doet." |
  | `REQUEST_ID_CONFLICT` | "Deze actie is al met andere gegevens verstuurd. Begin opnieuw." |
  | `REQUEST_ALREADY_PROCESSED` | "Deze actie is al verwerkt." |

- **Focusvolgorde en toetsenbord**: bij de onbekende uitkomst gaat de focus naar de `Notice` (`role="alert"`), daarna
  "Opnieuw proberen", dan "Annuleren". Na een gelukte herhaling gaat de focus waar hij na een gewoon succes heen gaat.

## Acceptatiecriteria

**Deel A**

- **idempotentie/AC-1** — Gegeven een contract met `idempotent: true`, wanneer een verzoek zonder `Idempotency-Key` of met een
  waarde die geen uuid is binnenkomt, dan `VALIDATION` en loopt de handler niet. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-2** — Gegeven twee gelijke verzoeken na elkaar met dezelfde sleutel, dan loopt de handler één keer, zijn
  beide antwoorden gelijk in status en body, en heeft alleen het tweede `Idempotency-Replayed: true`. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-3** — Gegeven twee gelijke verzoeken tegelijk op twee echte verbindingen, dan loopt de handler precies één
  keer en krijgen beide hetzelfde antwoord. Toets: `test/api/idempotentie-race.int.test.ts` (nieuw)
- **idempotentie/AC-4** — Gegeven een bon, wanneer dezelfde actor dezelfde sleutel stuurt met een andere input of op een andere
  idempotente route, dan `REQUEST_ID_CONFLICT` en verandert er niets. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-5** — Gegeven een bon van actor A, wanneer actor B dezelfde sleutel stuurt, dan loopt de handler voor B als
  een eerste verzoek en bevat het antwoord niets uit de bon van A. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-6** — Gegeven een handler die een fout gooit, dan bestaat er geen bon en loopt de handler bij een herhaling
  met dezelfde sleutel opnieuw. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-7** — Gegeven een bon, wanneer de actor daarna zijn rol of permissie kwijt is, geblokkeerd is of (bij een
  beheerrol) geen MFA-sessie heeft, dan geeft de herhaling `FORBIDDEN`, `UNAUTHENTICATED` of `MFA_REQUIRED` en nooit het
  bewaarde antwoord. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-8** — Gegeven een herhaling, dan komt er geen tweede auditregel en lopen `afterCommit` en `afterRollback`
  niet. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-9** — Gegeven een antwoord boven `MAX_RECEIPT_RESPONSE_BYTES`, dan `INTERNAL_ERROR`, is de mutatie
  teruggedraaid en bestaat er geen bon. Toets: `test/api/idempotentie.int.test.ts` (nieuw)
- **idempotentie/AC-10** — Gegeven `app_authenticated`, dan faalt elke directe `select`, `insert`, `update` en `delete` op
  `app.request_receipts`; `app.store_receipt` zonder voorafgaande `new` van `app.claim_request` in dezelfde transactie geeft
  42501; beide functies zonder actor geven 42501. Toets: `db/tests/request_receipts.sql` (nieuw)
- **idempotentie/AC-11** — Gegeven `defineContract` met `idempotent: true` op een `GET` of op een partnerroute, dan gooit het
  bij het laden. Toets: `src/core/shared/contract-idempotent.test.ts` (nieuw)
- **idempotentie/AC-12** — Gegeven een niet-`GET`-contract met `Cents` in de input en zonder `idempotent: true`, dan faalt de
  dekkingstest en noemt hij methode en pad; een fixture bewijst dat. Toets: `test/security/idempotentie-dekking.test.ts` (nieuw)
- **idempotentie/AC-13** — Gegeven `useRequestKey`, dan blijft `key` gelijk over renders en herhalingen en verandert hij alleen
  na `renew()`; een aanroep van een idempotent contract zonder `requestKey` is een typefout. Toets: `src/core/web/lib/request-key.test.ts` (nieuw)
- **idempotentie/AC-14** — Gegeven een scherm met een idempotente mutatie, wanneer het antwoord op het eerste verzoek wegvalt,
  dan staat de `Notice` er met de letterlijke tekst, zijn de velden `disabled`, en leidt "Opnieuw proberen" tot één verwerkte
  mutatie en de gewone succesmelding. Toets: `e2e/idempotentie.spec.ts` (nieuw)

**Deel B**

- **idempotentie/AC-15** — Gegeven een bon ouder dan `RECEIPT_RESPONSE_DAYS`, wanneer de taak loopt, dan is `response` null en
  blijven sleutel, operatie en hash staan; een jongere bon blijft ongewijzigd. Toets: `test/jobs/idempotentie-tombstone.int.test.ts` (nieuw)
- **idempotentie/AC-16** — Gegeven een bon met `response` null, wanneer hetzelfde verzoek opnieuw komt, dan
  `REQUEST_ALREADY_PROCESSED` en loopt de handler niet; met een andere input `REQUEST_ID_CONFLICT`. Toets: `test/jobs/idempotentie-tombstone.int.test.ts` (nieuw)
- **idempotentie/AC-17** — Gegeven `app_authenticated` of `app_definer` zonder de jobrol, dan is `app.tombstone_receipts` niet
  uitvoerbaar. Toets: `db/tests/request_receipts.sql` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Herhaling terwijl het eerste verzoek nog loopt | wacht op de advisory lock, daarna `replay` of (na een rollback) een eerste verwerking | |
| Herhaling met dezelfde sleutel na een domeinafwijzing | opnieuw beoordeeld; kan nu wel slagen | |
| Sleutel in hoofdletters of met accolades | geen uuid in de vaste vorm | `VALIDATION` |
| Account verwijderd | bonnen verdwijnen via de cascade | |
| `lock_timeout` of `statement_timeout` tijdens het wachten op de lock | bestaande vertaling van `withUser()`; geen bon, herhalen mag | `INTERNAL_ERROR` |
| Twee tabbladen met elk een eigen sleutel en gelijke invoer | twee bewuste acties: twee mutaties | |
| Pagina herladen bij een onbekende uitkomst | de sleutel is weg; de gebruiker controleert het overzicht (OV-3) | |

## Raakt ook

- `check:migrations`, `check:secdef`, `db/tests/functies.sql`, `db/tests/invarianten.sql` en de bewaarcatalogus (`db/tests/retention.sql`).
- `docs/framework.md`: R-CODE-11 krijgt de naam van de bouwsteen en de dekkingstest; `docs/gouden-pad.md` krijgt een sectie
  "Geld of voorraad muteren" (contractoptie, sleutel in `queries.ts`, de onbekende staat).
- De route kit is core en een gate-pad: risicowerk met een aparte tester (R-WERK-04).
- Na ST-05 hoort de bon bij de verwijderaar van het account (cascade) en niet bij de export: hij bevat geen gegevens die de
  route zelf niet al toont.

## Buiten scope

- Idempotentie voor partnerroutes en het doorgeven van de sleutel aan een externe dienst (ADR 0077; komt met de outbox na ST-03).
- De sleutel bewaren over een herlaad of tussen tabbladen (OV-3).
- Een beheerscherm voor bonnen; bonnen handmatig wissen.
- Idempotentie voor routes zonder geld of voorraad: de optie mag, de dekkingstest eist het niet.

## Testplan

- Deel A: eenheidstests voor contract en hook; integratietests tegen de echte stack via een testroute in de fixture van de
  route kit (`src/core/api/route/fixture.test-helper.ts`), omdat de template zelf geen geldroute heeft; racetest op twee
  verbindingen; pgTAP voor tabel, functies en catalogus; e2e met een onderbroken antwoord op een testscherm onder `/design-system`.
- Deel B: integratietest met de runner; pgTAP voor de jobfunctie.
- `pnpm gate:fast`, `pnpm gate:slow` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Reikwijdte van een sleutel: per actor (dezelfde sleutel van een ander is een los verzoek) of globaal (dezelfde
  sleutel van een ander is `REQUEST_ID_CONFLICT`). Aanbeveling: per actor; het lekt niet of een sleutel bestaat en geeft dezelfde
  bescherming.
- **OV-2** — Termijn `RECEIPT_RESPONSE_DAYS` waarna het antwoord geleegd wordt. Aanbeveling: 30 dagen; een herhaling komt in de
  praktijk binnen minuten, en het bewaarde antwoord kan persoonsgegevens bevatten.
- **OV-3** — De sleutel alleen in het geheugen van het scherm, of ook bewaard in de browser (per actor en operatie, met Web
  Locks tegen gelijktijdige tabbladen) zodat een herlaad bij een onbekende uitkomst dezelfde actie kan afmaken. Aanbeveling:
  eerst alleen geheugen; bewaren in de browser als eigen uitbreiding zodra een app een onbemand of gedeeld apparaat heeft dat
  vaak herlaadt.
- **OV-4** — Of een domeinafwijzing een bon krijgt. Aanbeveling: nee, alleen succes; een afwijzing muteert niets en mag bij een
  herhaling opnieuw beoordeeld worden.
- **OV-5** — Hoe de dekkingstest voorraad herkent. Aanbeveling: nu alleen `Cents`; een eigen merk voor voorraadaantallen
  (`Quantity`) pas als een app voorraad bijhoudt.
- **OV-6** — Naam van de header. Aanbeveling: `Idempotency-Key`, gelijk aan de uitgaande client; `X-Request-Id` blijft het
  servergegenereerde verzoek-id en is hier nooit de sleutel.
