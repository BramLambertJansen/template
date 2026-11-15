# 0092 — Rollen als register van de app

Status: geaccepteerd

Wijzigt [0040](0040-template-app-en-grens-core-app.md) punt 10 en 11 (rollen zijn een uitbreidingspunt),
[0043](0043-accounts-uitnodigen-mfa-en-beheer.md) punt 13, 15 en 16 (dev-login, blokkeren en de telbare beheerder hangen aan
`beheer`) en [0052](0052-accountstatus-en-laatste-login.md) punt 6 (één definitie van de laatste beheerder). Drempel: A1
(nieuw contract tussen core en app), A2 (rollenmodel, migratie op bestaande rijen) en A4. Besluiten van de eigenaar,
2026-11-06 en 2026-11-14. Uitwerking: [spec](../specs/rollenregister.md).

## Context

`user` en `admin` stonden vast in core (`ROLES` in `src/core/shared/can.ts`, de seed-accounts, de testkit) en in SQL (de tekst
`'admin'` in functies en een CHECK op `public.user_roles.role`). Het regelboek zei bij een nieuwe rol "pas core aan"
(R-ARCH-03), maar `check-core` verbiedt een app om `src/core` te wijzigen. Een app met een derde rol liep dus vast. De
definitie van de laatste beheerder stond op drie plekken.

## Besluit

1. **De app registreert zijn rollen.** `defineRoles` in core, `src/shared/roles.ts` in de app. Per rol de vlag `beheer`. Core
   krijgt het register als argument (`definePermissions(roles, …)`, `createApp({ roles })`, `createDevLogin`) en kent zelf
   geen rolnamen meer.
2. **`user` en `admin` zijn vaste basisrollen**; een app voegt rollen toe en kan die weer weghalen. Het noodcommando
   `pnpm admin:create` en de seed hangen aan `admin`.
3. **`beheer` bepaalt, niet de naam.** Elke permissie van een beheerrol eist een MFA-sessie, in `can()`, in de login-policy
   en in `app.is_mfa_admin()`. Accountbeheer blijft achter `app.is_mfa_admin()`: geeft de permissietabel het aan een rol
   zonder `beheer`, dan weigert de database.
4. **De database kent dezelfde rollen.** Tabel `app.roles`; `public.user_roles.role` verwijst ernaar in plaats van een CHECK.
   Een rol komt erin en gaat eruit via `app.register_role` en `app.unregister_role`, alleen in een migratie. Een CHECK houdt
   `admin` op `beheer` en `user` zonder.
5. **Eén definitie van de laatste beheerder:** `app.has_counted_beheer()` (beheerrol, credential-account, niet geblokkeerd of
   gedeactiveerd), altijd geëvalueerd ná de advisory lock. Degraderen, blokkeren, deactiveren en de vlag `beheer` van een rol
   afhalen gebruiken haar.
6. **Twee bronnen, bewaakt door een test.** Register en `app.roles` kunnen uiteenlopen; elke laag weigert op haar eigen bron
   en `test:db` faalt bij een verschil. Geen controle bij het opstarten.

## Alternatieven

- **Rollen alleen in de database, core leest ze bij opstart:** de typen van `can()` en de permissietabel zijn dan pas bij het
  draaien bekend, en een tikfout in een rolnaam wordt geen typefout.
- **Vrije rollen, ook zonder `admin`:** vraagt een ander noodcommando en een weg om de laatste beheerrol te bewaken; meer
  ontwerp dan een app nu nodig heeft.
- **Een opstartcontrole op verschil tussen register en database:** vangt ook een fout in de uitrolvolgorde, maar vraagt een
  extra export uit `src/core/api/db` (R-LAAG-06); een verschil sluit dicht, dus de test volstaat.
- **`app.is_mfa_admin()` hernoemen:** raakt elke policy en pgTAP-test die de naam gebruikt, zonder ander gedrag. "Admin" in
  die naam betekent voortaan beheerrol.

## Gevolgen

- Staat `beheer` alleen in de database aan, dan telt die rol als beheerder en kan de laatste beheerder volgens het register
  weg. Dat kost beschikbaarheid, geen toegang; `pnpm admin:create` is de nooduitgang.
- Een bestaande app past bij de template-update de bestanden aan die `ROLES` of `Role` uit core haalden; de lijst staat in
  `CHANGELOG.md`. Een app met een eigen CHECK op de rol krijgt in de migratie de melding welke rol eerst geregistreerd moet
  worden.
- Een rolwijziging krijgt geen eigen auditregel: ze kan alleen via een gereviewde migratie.
- R-ARCH-02, R-ARCH-03, R-AUTH-03, R-AUTH-07 en R-DB-15 volgen dit ADR; het gouden pad staat in `docs/gouden-pad.md`.
