---
status: gebouwd # #715
namespace: rollenregister
---

# Rollen als register van de app (ST-16)

## Doel

Een app voegt rollen toe zonder `src/core` te wijzigen; MFA-eis en laatste beheerder hangen aan `beheer`, niet aan de naam `admin`.

## Rollen en wie wat ziet

Vaste `user` en `admin` (beheer) (OV-1), plus rollen van de app. Beheerrol: `mfa` op elke toegestane permissie (`can()`, `app.is_mfa_admin()`, login-policy). Accountbeheer (`app.assign_role`, `app.set_account_blocked`, `app.set_account_deactivated`, `app.accounts`, `app.audit_log`) blijft achter `app.is_mfa_admin()`; geeft de permissietabel het een rol zonder `beheer`, dan weigert alleen de database (`42501` → `FORBIDDEN`), dicht. Eén rol per account.

## Ontwerp

- **Register.** `defineRoles` (`src/core/shared/roles.ts`) voegt `user`/`admin` toe; de app levert `src/shared/roles.ts` (`roles = defineRoles({ planner: { beheer: false } })`, `type Role`). Gooit bij `user`/`admin` als extra, naam buiten `^[a-z][a-z0-9_]*$` of boven `ROLE_NAME_MAX_LENGTH` (32). `roles.isBeheer(onbekend)` = false, `roles.parse(onbekend)` = null.
- **Core krijgt het register als argument** (R-LAAG-02): `definePermissions(roles, table)` (de routekit leest `permissions.roles`), `createApp({ roles, devLogin })`, `createDevLogin(steps, { roles, seedAccounts })`, gezet in `src/api/kit.ts`, `src/api/app.ts`, `src/api/server.ts`. `ROLES`/`Role` weg uit core; `withUser` geeft `role: string | null`; `asUser` neemt elke rol uit `app.roles`, `mfa` bij `beheer`.
- **App leest het register:** `src/api/login-policy.ts` (`roles.isBeheer`), `actorFromMe` (beheer → `mfa`); `homeFor(actor)` = `/admin` als `can(actor, 'accounts:read')`, anders `/`.
- **Uiteenlopen** (bewaakt door AC-13). Rol alleen in register → toekennen faalt (FK); alleen in database → `FORBIDDEN`; `beheer` alleen in register → database weigert accountbeheer. `beheer` alleen in database → die rol telt als beheerder, dus de laatste volgens het register kan weg (beschikbaarheid, geen lek; nooduitgang `pnpm admin:create`).
- **Laatste beheerder.** `app.has_counted_beheer()`: beheerrol, credential-account, geen `blocked_at`/`deactivated_at`; altijd ná de lock `public.user_roles:last_admin`. Trigger `public.user_roles`: `old` beheer en (delete of `new` niet beheer) en niet `has_counted_beheer()` → `LAST_ADMIN` (`admin`→`admin` en `eigenaar`→`admin` slagen). Trigger `roles_keep_one_beheer` (`after update or delete for each row` op `app.roles`, geen `WHEN`-clause): als `old.beheer` en (delete of niet `new.beheer`), neemt de triggerfunctie eerst de lock en evalueert daarna beide condities: `old.name` heeft telbare dragers én niet `has_counted_beheer()` → `LAST_ADMIN`. Blokkeren en deactiveren gebruiken dezelfde functie, ook na de lock.
- **Dev.** Seed naar `src/api/dev/seed-accounts.ts` (`Record<Role, SeedAccount>`, zelfde adressen); één TOTP-sleutel (`SEED_ADMIN_TOTP_SLEUTEL`) voor elke beheerrol; rolwisselaar en `roleLabels` lezen `roles.names`.
- **Rol toevoegen of weghalen:** gouden pad in `docs/gouden-pad.md`.

## Datawijzigingen (met grants)

Eén migratie (expand en contract samen: oude code schrijft alleen `user`/`admin`):

1. `app.roles (name text primary key check (name ~ '^[a-z][a-z0-9_]*$' and length(name) <= 32), beheer boolean not null, check ((name <> 'admin' or beheer) and (name <> 'user' or not beheer)))`; rijen `user`, `admin` en `app.retention` (`keep` null) vóór `enable`/`force row level security` (R-DB-17).
2. Grants: `select` aan `app_authenticated` (`roles_select_authenticated`, alleen met een ingelogde actor: `using ((select app.current_user_id()) is not null)`, eigenaar 2026-11-15); `select, insert, update, delete` aan `app_definer`: `roles_definer_select` `using (true)`, `roles_definer_insert` `with check (true)`, `roles_definer_update` `using (true) with check (true)`, `roles_definer_delete` `using (name not in ('user', 'admin'))`. Alleen de delete-policy sluit de basisrollen uit; bij update bewaakt de CHECK ze. `app_migrator` erft deze rechten via `app_definer`.
3. `select app.assert_roles_registered()`: faalt (`P0001`) met "registreer eerst rol <naam>" als `public.user_roles` een rol bevat die niet in `app.roles` staat (een app met een eigen CHECK).
4. `user_roles_role_fkey` naar `app.roles(name)` (restrict); `drop constraint if exists user_roles_role_check`.
5. Security definer, `search_path = ''`, eigenaar `app_definer`, `revoke all from public`, geen grants, `intern`: `app.register_role(text, boolean)` (upsert; `22023` voor `user`/`admin`; geen audit, OV-4), `app.unregister_role(text)` (`22023` voor basisrol, `23503` met dragers), `app.assert_roles_registered()`, `app.has_counted_beheer()`, `app.roles_keep_one_beheer()`. `create or replace` met `beheer`: `app.is_mfa_admin()` (OV-3), `app.user_roles_keep_one_admin()`, `app.set_account_blocked`, `app.set_account_deactivated`.

## Routes en foutcodes

Geen nieuwe. `POST /api/dev/login-as`, `GET /api/me`, accountcontracten: `z.enum(roles.names)`.

## Kopieer de vorm van

- `src/shared/permissions.ts`: registreren in `src/shared` met een `define…`-functie uit core.
- `db/tests/user_roles.sql`: pgTAP per policy en de LAST_ADMIN-gevallen.
- `db/tests/integration_switches.sql`: tabel die alleen definer-functies vullen.

## Hergebruik en UX

- Bestaande componenten: `DevRoleSwitcher`, een knop per rol. Geen nieuwe schermen of teksten.

## Acceptatiecriteria

Testregister: `planner` (geen beheer), `eigenaar` (beheer) en `toezicht` (beheer). Testtabel: `eigenaar` heeft `accounts:read` en `accounts:manage`, `toezicht` `me:read`, `planner` `me:read`. Racetests committen hun rollen en ruimen ze idempotent op in `beforeAll` en in `finally` (dragers van testrollen naar `user`, dan `app.unregister_role`). De vier bestaande racetests (`test/auth/roles.int.test.ts`, `test/api/account-blocking.int.test.ts`, `account-lifecycle.int.test.ts`, `accounts-audit.int.test.ts`) blijven ongewijzigd.

- **rollenregister/AC-1**: Standaardregister: alle bestaande tests groen; alleen die onder "Raakt ook" wijzigen.
- **rollenregister/AC-2**: Routes via de testkit (`asUser('planner')`), zonder core-wijziging: `app.use` en `me:read` slagen, de rest `FORBIDDEN`.
- **rollenregister/AC-3**: `eigenaar` met `password`: toegestane routes `MFA_REQUIRED`, `app.is_mfa_admin()` false.
- **rollenregister/AC-4**: `eigenaar` met `mfa`: `app.assign_role` en `app.set_account_blocked` slagen, `app.audit_log` leesbaar.
- **rollenregister/AC-5**: `planner` met `mfa`: `42501` op de drie accountfuncties, niets in `app.accounts` en `app.audit_log`.
- **rollenregister/AC-6**: Inloggen als `eigenaar` eist MFA; `actorFromMe` geeft `mfa`, `homeFor` `/admin`, de guard van `/admin` laat door. `toezicht` (beheer, zonder `accounts:read`) en `planner`: `homeFor` `/`. `isBeheer('baas')` false, `parse('baas')` null.
- **rollenregister/AC-7**: Laatste telbare beheerder (`eigenaar`) blokkeren, deactiveren, naar `user` degraderen of verwijderen: `LAST_ADMIN`, teruggedraaid, geen auditregel; geblokkeerde, gedeactiveerde, uitgenodigde tellen niet. `eigenaar` → `admin` slaagt.
- **rollenregister/AC-8**: `app.register_role('eigenaar', false)` als alleen `eigenaar` telbare dragers heeft: `LAST_ADMIN`, `beheer` blijft true; met een telbare `admin` erbij: slaagt.
- **rollenregister/AC-9**: Zonder accounts slagen `register_role('planner', false)`, `register_role('eigenaar', true)`, daarna `register_role('eigenaar', false)` en `unregister_role('eigenaar')`; `planner` registreren slaagt ook naast telbare beheerders.
- **rollenregister/AC-10**: Gelijktijdig (a) twee beheerders met verschillende beheerrollen degraderen of blokkeren elkaar; (b) `register_role('eigenaar', false)` tegen blokkeren van de laatste `admin`; (c) T1 `register_role('eigenaar', false)` zonder dragers, open; T2 `assign_role(X, 'eigenaar')` voor een telbaar account; T3 degradeert de laatste `admin`. Bij (a) en (b) slaagt precies één, de ander geeft `LAST_ADMIN`; bij (c) geeft `has_counted_beheer()` na afloop true, en elke geweigerde transactie geeft `LAST_ADMIN` (met T1 eerst: T3 geweigerd).
- **rollenregister/AC-11**: `register_role`/`unregister_role` als `app_authenticated` (ook `admin` met MFA): `42501`; met `'user'`/`'admin'`: `22023`; `Baas` of 33 tekens: CHECK. Als `app_migrator` direct `update app.roles set beheer = false where name = 'admin'`: CHECK; `delete` van `admin` raakt 0 rijen.
- **rollenregister/AC-12**: `assign_role(id, 'baas')` zonder `baas` in `app.roles`: `23503`; `unregister_role` met dragers: `23503`. Rol in `app.roles` maar niet in het register: `FORBIDDEN` op elke route, ook `app.use`.
- **rollenregister/AC-13**: `compareRoles` meldt rol alleen in register, alleen in rijen, ander `beheer` (unit per richting); `test/auth/roles-register.int.test.ts` faalt bij verschil.
- **rollenregister/AC-14**: `defineRoles` gooit bij `user`/`admin` als extra, ongeldige naam, 33 tekens; een test houdt `ROLE_NAME_MAX_LENGTH` gelijk aan het CHECK (R-CODE-07).
- **rollenregister/AC-15**: Rolwisselaar toont elke rol; dev-login als beheerrol `mfa`, anders `password`; onbekende rol `400 VALIDATION`; rol in register zonder rij in `app.roles` faalt in de seed (`23503`), de dev-login geeft `INTERNAL_ERROR`.
- **rollenregister/AC-16**: Krijgt een rol `beheer`, dan geven toegestane routes voor een `password`-sessie `MFA_REQUIRED`; verliest hij het, dan houdt een `mfa`-sessie alleen de permissies van de rol en weigert de database accountbeheer.
- **rollenregister/AC-17**: In een transactie die terugdraait (pgTAP): `user_roles_role_fkey` weghalen, een rij met rol `baas` toevoegen, `app.assert_roles_registered()` aanroepen → `P0001` "registreer eerst rol baas". Zonder zo'n rij slaagt de aanroep. Dat bestaande rijen bewaard blijven, toetst alleen de review: de migratie wijzigt en verwijdert geen rijen in `public.user_roles`.

## Raakt ook

- `check:migrations`, `check:secdef`, `check:snapshot`, `test:db`: pgTAP per policy (`db/tests/roles.sql`), `db/tests/functies.sql`, `db/tests/retention.sql`.
- Gewijzigde tests (R-TEST-02); volledigheid na te lopen met `git grep -l "definePermissions("` en `git grep -l "ROLES\|\bRole\b" -- src test scripts`:
  - A, reden `definePermissions(roles, …)`: `src/core/shared/can.test.ts`, `can-unknown-permission.test.ts`, `list-search.test.ts`; `src/core/api/http/partner-route.test.ts`, `request-id.test.ts`; `src/core/api/route/audit.int.test.ts`, `fixture.test-helper.ts`; `src/core/web/lib/guard.test.ts`; `src/core/web/ui/route-error.test.tsx`; `test/audit/ctx-audit.int.test.ts`; `test/datapad/request-id.int.test.ts`; `test/integrations/partner-step.int.test.ts`, `switch.int.test.ts`; `test/outbound/route-guard.int.test.ts`.
  - B, reden register in plaats van `ROLES`/`Role`/`'admin'`: `src/shared/permissions.test.ts`; `src/web/lib/session.test.ts`; `src/web/dev/role-switcher.test.tsx`; `src/core/api/dev/login-as.test.ts`; `src/core/api/http/dev-login.test.ts`; `test/auth/dev-login.int.test.ts`; `test/security/routes.int.test.ts` (security/AC-4), `fixtures.ts`, `controles.ts`, `resources.ts`; `test/rails/new-resource.test.ts`.
  - C, reden CHECK → FK: `db/tests/user_roles.sql` (`'baas'`: `23514` → `23503`).
- Code in core: `src/core/shared/can.ts`, `src/core/shared/roles.ts` (nieuw), `src/core/shared/limits.ts`; `src/core/api/http/create-app.ts` (`ROLES`, `Role`, `DevLogin`); `src/core/api/route/context.ts`; `src/core/api/db/types.ts`, `test-transaction.ts`; `src/core/web/lib/api-client.ts` (`devLoginAs`); `src/core/api/dev/login-as.ts` (TOTP per beheerrol), `totp.ts`; `src/core/api/dev/seed-accounts.ts` (seeds verhuizen, wachtwoord en TOTP-sleutel blijven).
- Code in de app: `src/shared/roles.ts` (nieuw), `permissions.ts`, `contracts/accounts.ts`, `contracts/me.ts`; `src/api/kit.ts`, `app.ts`, `server.ts`, `login-policy.ts`, `routes/accounts.ts`, `dev/seed-accounts.ts` (nieuw); `src/web/copy/ui.ts`, `lib/session.ts`, `dev/role-switcher.tsx`, `dev/switch-role.ts`, `features/accounts/invite-dialog.tsx`.
- Scripts: `scripts/seed.mjs`, `scripts/kit/new-resource.mjs`, `scripts/kit/feiten-secties.mjs`; `scripts/admin-create.mjs` en `scripts/kit/check-new-resource.mjs` houden `'user'`/`'admin'` (basisrollen).
- ADR 0092 herziet ADR 0040 punt 10–11, 0043 punt 13, 15–16, 0052 punt 6; R-ARCH-02 (+`roles.ts`), R-ARCH-03, R-AUTH-03, R-AUTH-07, R-DB-15, `.claude/rules/`, `docs/gouden-pad.md` volgen.
- Release-notitie voor apps: de app-bestanden hierboven en een eigen CHECK (AC-17). Roadmap ST-16 bijstellen: vóór de proef-app (eigenaar 2026-11-11), geen besluit-PR (ADR 0090), uitzondering C.

## Buiten scope

Meer rollen per account; hernoemen; opstartcontrole; ST-17.

## Open vragen

Geen. Besloten door de eigenaar op 2026-11-14:

- **OV-1**: vaste `user`/`admin`, de app voegt rollen toe.
- **OV-2**: geen opstartcontrole; `test:db` is een verplichte check.
- **OV-3**: `app.is_mfa_admin()` houdt zijn naam.
- **OV-4**: geen auditregel bij `register_role`/`unregister_role`.
- **OV-5**: één PR, databasecommit eerst.
