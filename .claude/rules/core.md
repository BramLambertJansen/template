---
paths:
  - "src/core/**"
---

# Regels voor `src/core`

Letterlijk uit `docs/framework.md`; bij verschil wint het regelboek.

- **R-LAAG-01** Zones: `src/core/{api,web,shared}` is template (in app alleen via template-merge); app-code in `src/{api,web,shared}` (0040)
- **R-ARCH-07** `check-core` laat wijziging van `src/core/` in app falen behalve vertrouwde template-merge; verplicht in app-ruleset. Bekend gat: merge met oudere template-commit kan core terugzetten of wissen (0040)
- **R-REPO-03** Beschermde paden in de padtabel `paden` (`.claude/gates.json`, in een app aangevuld met het optionele app-bestand gates.app.json ernaast, dat alleen toevoegt of aanscherpt), eigenaarakkoord; developer volgens R-WERK-10; `src/api/app.ts` en `src/shared/permissions.ts` geen gate; geen gegenereerde bestanden of `.env*` bewerken (0046)
- **R-LAAG-02** App importeert core, core nooit app; core krijgt app-input als argument van compositie-root (`src/api/app.ts`, `src/api/kit.ts`, `src/api/server.ts`, `src/web/lib/api.ts`); de app-zone bevat configuratie en registraties, geen koppeling tussen core-onderdelen (die doet `runServer` in `src/core/api/server.ts`); geen globale registratie of singleton (0040)
- **R-ARCH-02** Elk uitbreidingspunt heeft core-test dat app het zonder core-wijziging gebruikt (plaats en gebruik: ADR 0040 punt 10); core/app-tabel via `src/shared/{permissions,roles,errors,limits,ids,audit}.ts` (0040, 0092)
- **R-ARCH-01** App breidt uit door registreren, nooit core wijzigen; past iets niet: stel uitbreidingsplek in template voor; core-fout oplossen in template (0040)
- **R-ARCH-03** Nieuwe rol: registreren in `src/shared/roles.ts` (`defineRoles`, vlag `beheer`; `user` en `admin` zijn vast), migratie met `app.register_role`, seed-account in `src/api/dev/seed-accounts.ts`, naam in `roleLabels`; weghalen via `app.unregister_role`; core noemt geen rolnamen (0092)

Hoe (geen norm):

- Core-updates in een app via de merge van een `template-v`-tag (R-LAAG-01); `check-core` is een job in `guard.yml` (`scripts/kit/check-core.mjs`) en staat in de template zelf uit. In de template wijzigt core met eigenaarakkoord (R-REPO-03).
- `src/shared` is app-code, dus core importeert er niet uit (R-LAAG-02). Uitbreidingsplekken: permissies, foutcodes, limieten, env, componentvarianten.
- `roleLabels` staat in `src/web/copy/ui.ts`; TypeScript dwingt seed-account en naam af, de dev-rolwisselaar toont de rol dan vanzelf.

## Gebouwd: waar alles staat

`src/core/api/{env.ts,db,http,auth,mail}`, en in `src/core/shared`: `errors.ts` (`defineErrorCodes`), `can.ts` (`definePermissions`,
MFA-eis voor elke beheerrol), `limits.ts`, `assert.ts`, `unsafe-cast.ts`, `ids.ts` (`brandedId`), `money.ts` (`Cents`), `cursor.ts`; de API-client;
de dependency-cruiser-regel core → app; `check-core`.

## Besloten, nog niet gebouwd

Nog niet: de mail-outbox (ST-03; de runner `src/core/api/jobs` is gebouwd), het privacymechanisme (ST-05); de eisen
staan bij die roadmap-items (R-DOC-10).
Bouw een core-onderdeel alleen in het stuk van de roadmap waar het hoort.
