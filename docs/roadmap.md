# Roadmap

Uitwerking van [framework.md](framework.md) §12: wat open staat, in welke volgorde en wat klaar is. De status staat in het
vinkje, de specstatus en het PR-nummer, nooit in een datum of in proza. Vink alleen af met bewijs (PR-nummer, testpad of checknaam;
`pnpm check:roadmap` dwingt het af). Eén plek per item: `ST-nn` is het label van een agenttaak uit de starter-beoordeling
(P0 noodzakelijk voor een veilige basis, P1 voor een herbruikbare en bewezen starter, P2 optioneel op aanleiding).
Indeling en volgorde volgen ADR 0046 en [de inventaris](reviews/2026-10-15-principes-inventaris.md).
Fase 0 en 1 horen in de template; fase 2 levert verbeteringen terug aan de template; fase 3 is per app.
Reviews: [2026-10-09 fundering](reviews/2026-10-09-fundering.md), [2026-10-09 framework](reviews/2026-10-09-framework.md).

**Werkwijze per item:** lees AGENTS.md, de relevante ADR's en specs en begin met de feiten (`node scripts/kit/feiten.mjs`);
volg [de DoD](dod.md) en de werkstraat uit [het framework](framework.md) §8. Zoek eerst bestaande implementaties en open PR's: breid uit,
bouw geen tweede mechanisme. Nieuwe route, permissie of migratie: eerst een spec ([sjabloon](specs/_template.md)) met eigenaargoedkeuring.
Deze roadmap is geen goedgekeurde spec en geeft geen toestemming voor dependencies of providerkeuzes. Verander geen vinkjes of
ADR-statussen op basis van deze lijst; meld onbesliste waarden aan de eigenaar. Houd de core klein: SaaS, PWA, storage en notificaties
zijn optioneel. Een bestaand script of ADR bewijst niet dat de capability compleet of actief is.

## Nu

Hooguit drie open items (`check:roadmap`); nummer 1 is bewijs vóór uitbreiding (P1).

- [ ] **ST-09 (P1) — proef-app met template-update** (fase 1, stuk 6). Doel: bewijzen dat de template als basis voor een app werkt, vóór verdere uitbreiding.
  **Uitvoeringsopdracht:** begin met [de agentstartinstructie](../START-NIEUWE-APP.md) en vervolg met het generieke [ST-09-protocol](operations/st-09-praktijkproef.md). Appkeuze, scope, appdata en resultaten horen in de aparte app-repo, niet in deze template.
  **Werk:** kies met de eigenaar één kleine echte app met een owner-scoped resource en een adminactie. Start via `docs/nieuwe-app.md`, bouw een
  complete verticale flow en registreer elke handmatige stap, onduidelijke instructie, ontbrekende component en core-aanpassing; houd het
  app-domein buiten deze template. Neem daarna één echte template-update over (de merge van een `template-v<x.y.z>`-tag) via een PR (ADR 0040, ADR 0094).
  Wat terugkomt wordt een regel of script in de template; elk leerpunt gaat als `leerpunt`-issue naar de template ([leerlus](template/specs/leerlus.md), ADR 0059).
  **Gedaan:** de release is de eenheid van een update (tag `template-v<x.y.z>`, versieschema semver `0.x` besloten), met de adviserende
  `pnpm template:status` en changelogfragmenten (spec `template-release`, ADR 0094; eerste release `0.2.0`).
  **Afhankelijkheden:** bestaande runtime, auth en generator; de eigenaar levert de lokale stack en de appkeuze.
  **Klaar als:** een nieuwe gebruiker en admin doorlopen de flow tegen de echte stack; verboden toegang is getest; de update behoudt app-code
  en instellingen, met conflicten alleen in vooraf als verwacht vastgelegde bestanden; rapport met exacte checks, handwerk en verbeter-PR's
  terug naar de template. Een demo in deze repo alleen telt niet.
  Voorbereid: de securitysuite die met de proef-app mee gaat lopen (spec `security-suite`, `gebouwd`; bewijs `test/rails/security-suite-echt.test.ts`).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (P1, besluit 1)
  aanleiding: #321 (reproduceerbare nulmeting van leerpunten in het ST-09-protocol)
  aanleiding: #319 (playbooklijst van verplichte checks gelijk aan de rulesetpayload)
  aanleiding: #338 (controle vóór branchwissels die beschermde sandboxpaden kunnen raken)
  aanleiding: #329 (diagnose van pnpm-startproblemen en blokkerende werkmapbestanden; dependencycontrole vóór run/exec)
  aanleiding: #327 (padparameters, voor-stappen en gecombineerde foutgevallen expliciet in specs en spec-review)
  aanleiding: #320 (meetdefinities voor permissievragen, modi en voorlopige weigeringstellingen)
  aanleiding: #534 ("opgepakt" in het eindrapport is gesloten met sluitbewijs of als achterhaald, ADR 0078 punt 6)
- [ ] **ST-14 (P1) — documentatie en bouwresten opruimen** (opdracht stap 5). Doel: een repo waarmee mensen en agents apps bouwen zonder het
  bouwproces van het framework te reconstrueren; helder Nederlands over de huidige werking; bouwen met agents blijft het uitgangspunt.
  **Gedaan:** README, changelog, leeswijzer en de eerste inventaris (docs en roadmap, `docs/reviews/2026-10-15-principes-inventaris.md`).
  **Open:** categorie C van die inventaris (D-3 t/m D-16: framework regel 4, §10 Meten, AGENTS.md-status, DoD, `.claude/rules/web.md`,
  agent-doorloop, CHANGELOG, README), plus codecommentaar, gebruikers- en mailteksten, scripts, agentinstructies en GitHub-templates.
  Elke wijziging op een beschermd pad vraagt een eigen eigenaarakkoord. GitHub: vul een korte beschrijving en topics in en controleer de
  template-instelling; voorstel: "Template om webapps met code-agents te bouwen. React, Hono en Postgres, met agentinstructies,
  UI-componenten en ontwikkelcontroles." (de controle vond geen beschrijving of topics en een uitgeschakelde template-instelling).
  **Behoud:** verwijder niets dat agents helpt (instructies, skills, hooks, voorbeelden, specs, ontwerpcontext, valkuilen, herstelstappen,
  overdracht, bewijs); bij twijfel blijft het staan. Een bouwverslag verdwijnt pas als geen mens of agent hem nodig heeft; verplaats unieke
  informatie eerst naar een vindbare plek en controleer de verwijzingen. Git of een oude PR vervangt geen agentinformatie. Verwijder geen
  tests, fixtures, migraties, gates, veiligheidsregels of goedkeuringshistorie en herschrijf geen Git-geschiedenis; ADR's verlopen
  (`vervallen`, `vervangen door NNNN`) maar verdwijnen niet; een spec mag alleen weg met apart eigenaarakkoord.
  **Redactie:** weg met gesprekstaal, zelfbeoordelingen, opgeblazen formuleringen, lege herhaling en verouderde statusclaims; behoud herhaling
  die afzonderlijk geladen agentcontext nodig heeft. Besliste open vragen worden besluiten (datum, herkomst, alternatieven); open werk is
  een roadmaptaak, keuzes zijn ADR's, appwijzigingen staan in de changelog. Menselijke leesroute: README, leeswijzer, gebruik of ontwikkeling.
  **Klaar als:** elk bestand in de inventaris heeft een onderbouwde bestemming; verwijzingen zijn aangepast en een zoekronde vindt geen
  verwijzing naar verwijderde bestanden; docs kloppen met code en commando's; `pnpm ratchet` en toepasselijke gates groen; `app:init` werkt;
  de agentprocedure voor een nieuwe app en een feature is nog bereikbaar vanuit de startpunten. De eigenaar leest de instappagina's en een
  steekproef; een woordfilter bewijst geen goede redactie. Ook: overbodige bouwresten zijn verwijderd; de inventaris toont waar alle bruikbare
  agentinformatie behouden is; een menselijke lezer kan de app starten en de bouwafspraken vinden zonder reviewlogs te lezen.
  **Vangrails:** leg per verwijdervoorstel vast waarom geen instructie, ontwerpcontext of leerpunt verloren gaat; bewijs voor een open taak blijft
  bereikbaar totdat die taak is afgerond; raakt opruimen tests, fixtures, migraties, gates, veiligheidsregels of goedkeuringshistorie, leg de
  wijziging dan apart aan de eigenaar voor. **Afhankelijkheden:** eigenaarreview van de opruiminventaris; geldende besluiten en bewijscriteria;
  `app:init` dat README en changelog gebruikt.
  **Opruimronde 2026-11-09 (gedaan):** vervallen agent-merge-specs naar `archief/` (#640); README-sectie Cloud ingekort, login-wachtwoorddoc
  in `docs/ui-input-utilities.md` opgenomen en een dode verwijzing in `money.ts` weg (#641); `eigen-account-deel2.test.ts` in
  `eigen-account.test.ts` samengevoegd met gelijke testnamen (#643). Onderzocht en bewust gelaten: het kopje "Besloten, nog niet gebouwd"
  (R-DOC-02 schrijft het voor), de git-testkits (geen kopieën van één helper), de "GEWIJZIGD"-markeringen (sporen van testwijzigingen met reden).
  **Open uit die ronde, voor netheid en vóór de eerste productierelease (eigenaar, 2026-11-09; ook als netheidspunt zonder meetbare winst):** (1) CHANGELOG netjes indelen: nu één `[Unreleased]` van ca. 88 KB; hou
  alles wat een app bij een update moet doen of waar een conflict kan ontstaan, snij eerst een gedateerde release of bouw de
  changelogfragmenten (ontwerp en eigenaarkeuzes 2026-10-23) en lees daarna per sectie na (gedaan in de bouw-PR van spec
  `template-release`: `[Unreleased]` geknipt als release `0.2.0` en de fragmenten gebouwd; het nalezen per sectie blijft open); (2) `docs/operations/agent-doorloop.md` (~60 KB) herindelen:
  negen testbestanden, de skills `opleveren` en `spec` en `meting.mjs` pinnen tekst of kopjes, dus alleen met eigenaarakkoord per test
  (R-TEST-02); idem `docs/nieuwe-app.md` (980 regels) en `START-NIEUWE-APP.md`, met bewijs dat de start van een nieuwe app blijft werken; (3) `docs/reviews/` (12 bestanden) een
  bestemming per ST-14-inventaris; (4) dubbele blokken in `.github/workflows` (mise-versie op 11 plekken, bubblewrap op 2, het SHA-controleblok in `guard.yml` drie keer;
  de mise-blokken verschillen in `install_args`, `if` en `working_directory`, dus de composite action krijgt parameters) via een composite action,
  met verplichte checknamen ongewijzigd; elke wijziging in `.github/workflows` gaat apart aan de eigenaar (gate-pad) en `guard.yml` alleen via
  besluit-PR; (5) lange regels in `docs/framework.md` en `docs/dod.md` inkorten binnen de grens van de R-DOC-07-krimpcheck; (6) leerpunten uit de ronde, zie #642; (7) verouderde verwijzingen, elk met eigenaarakkoord: (a) testcommentaar dat naar
  `docs/specs/taakmandaat-vervolg.md` wijst (nu taakmandaat-vervolg (verwijderd met het archief); R-TEST-02): `test/hooks/follow-up-kit.ts:7`,
  `test/rails/check-roadmap-bewijsvorm.test.ts:6`, `test/rails/check-roadmap.test.ts:443` en
  `test/scripts/runner-host-files.test.ts:7` (de vastgelegde fixture `test/rails/fixtures/padtabel/decisions-30cc352.json` blijft ongewijzigd);
  (b) zes overbodige `.gitkeep`-bestanden in mappen met andere getrackte bestanden, alle in beschermde paden (`.claude/agents`, `.claude/hooks`,
  `.claude/skills`, `.github/workflows`, `scripts`, `src/core/web/ui`); de plaatshouders in `.github/settings`, `deploy`, `designs` en
  `src/api/domain` blijven.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (categorie C, besluit 1)

## Volgende

Open werk dat niet geparkeerd is, grofweg in volgorde. Wat nog een spec of eigenaarbesluit nodig heeft, zegt het item.

- [x] **Focus naar de h1 na een routewissel naar een lazy route** (`/design-system`). De huidige `AppShell` (`routeKey` uit
  `resolvedLocation`, wachten op een zichtbare h1 met een MutationObserver, terugzetten als de focus verloren gaat) zet de focus op de h1;
  de e2e controleert het nu (bewijs `e2e/shell.spec.ts`, stuk 3f). De oorzaak van de eerdere `body`-focus is niet gevonden;
  wordt de controle flaky, dan gaat dit item weer open.
  aanleiding: `src/core/web/ui/app-shell.test.tsx` (bekende fout, geen capability)
- [ ] **ST-02 (P0) — accountbeheer en herstel afmaken** (stuk 3e; bestaande accountbeheer-specs). Open: TOTP-backupcodes (zodat een admin
  zonder telefoon niet alleen via `admin:create` terugkomt), een openstaande uitnodiging intrekken (opnieuw versturen bestaat al:
  `reinviteRoute`) en een admin-resetlink ("wachtwoord vergeten" blijft dicht, ADR 0043). De spec voor alle drie bestaat al:
  `docs/template/specs/accountbeheer-uitbreiding.md` (goedgekeurd, door de eigenaar bevestigd 2026-11-23); nog niets ervan is gebouwd.
  Gedaan: eenmalige TOTP-code en e-maillink, geen sessietoken in JSON (spec `inloggat-dichten`, ADR 0075; bewijs `test/auth/eenmalig.int.test.ts`, `db/tests/one_time_use.sql`).
  **Werk:** specificeer herauthenticatie, sessie-intrekking, tokenverval, oude/nieuwe adresbevestiging en herstel zonder rolpromotie;
  koppel audit en mail aan ST-04 en ST-03 en kopieer geen synchroon mailpad als de outbox de geldende route wordt.
  **Afhankelijkheden:** ADR 0043; audit voor admin-acties; relevante stappen uit ADR 0050.
  **Klaar als:** echte-stack e2e per flow; verboden rol en admin zonder MFA geweigerd; laatste-admin-racetest; herstelcode eenmalig, ook bij
  parallel gebruik; ingetrokken of verlopen links werken niet. Elk deel krijgt afzonderlijk bewijs.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **ST-04 (P0) — audit: vervolg** (ADR 0051, spec audit-log). Gebouwd in #128: migratie, `ctx.audit`, invite/reinvite; de spec
  `audit-log` staat op `gebouwd` sinds de AC-dekking compleet is (ADR 0103, bewijs `db/tests/audit_log.sql`). Open: `/admin/audit`
  (eigen spec) en audit voor de routes revoke en reset-link (met ST-02).
  **Werk:** servergegenereerde request-ID, audit in de transactie, append-only-tabel met vaste grants en policies, getypte strict gevalideerde
  details (geen willekeurige payloads, e-mailadressen of vrije tekst), aparte core-auditwriter voor Better Auth-acties.
  **Klaar als:** audit wordt met de actie teruggedraaid; verboden schrijver en lezer geweigerd; auditdetails falen buiten de allowlist;
  een vervalste client-request-ID wordt niet gebruikt.
  aanleiding: #128
- [ ] **ST-03 (P0) — achtergrondtaken: runner, opruimen en mail-outbox** (stuk 7; [ADR 0050](template/adr/0050-achtergrondtaken-en-mail-outbox.md): runner in het API-proces,
  eigen rol `app_jobs`, outbox zonder token; besluiten van ADR 0020 door de eigenaar bevestigd). Opruimen van verlopen sessies, uitnodigingen en
  rate-limit-rijen, en mail via een outbox, elk met een integratietest.
  **Werk:** volg de sectie Bouwvolgorde van ADR 0020 letterlijk (audit, bewaarcatalogus, jobrol, runner, outbox). Verbindingen blijven in de
  bestaande db/auth-laag en worden aan de runner geïnjecteerd. Batches, locks, leases, begrensde retries, definitieve foutstatus en herstel na een
  procescrash. Geen uitnodigingstoken in de outbox; verzendstatus zichtbaar voor de admin; herstelrunbook. Een naar nul schalende host krijgt later
  een eigen adapter; kies nu geen queue-provider.
  **Afhankelijkheden:** ST-04 en ST-05 volgens de ADR-bouwvolgorde; akkoord voor beschermde rol- of env-wijzigingen.
  **Klaar als:** twee runners claimen dezelfde rij niet tegelijk; crash, lease-verval en SMTP-uitval getest; definitief mislukte mail blijft
  herstelbaar; alleen verlopen rijen verdwijnen; stoppen wacht op de lopende batch vóór het sluiten van pools. Documenteer at-least-once-verzending
  (geen exactly-once-claim).
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `startJobs()` draait taken op interval vanuit `src/api/server.ts`, batch = één transactie met advisory lock; nul-schalende host: adapter roept `runJobsOnce()`; HTTP-cronpad alleen met hostgeheim, als §3-uitzondering (was R-JOB-01). `withJob()` gebruikt een eigen pool als rol `app_jobs` (`JOBS_DATABASE_URL`, execute alleen klasse `job`, niets op `better_auth`) (was in R-JOB-02). `app.mail_outbox`: RLS geforceerd, geen link of token in payload, foutcode zonder adressen; erin alleen via `app.enqueue_mail` (security definer, definer per mailsoort); at-least-once met lease, link pas bij verzenden (was R-JOB-03). `GET /api/ready` pingt niet als `app_jobs` (OV-C4, besloten 2026-11-11); vóór `startServer` één verbinding als `app_jobs`, faalt die dan stopt het proces (was in R-DEPLOY-01).
  aanleiding: `docs/template/adr/0050-achtergrondtaken-en-mail-outbox.md`
- [ ] **ST-05 (P0) — AVG: privacymechanisme, export en verwijderen** ([ADR 0051](template/adr/0051-audit-log-en-avg.md)). Mechanisme in core, inhoud per app.
  **Werk:** bewaarcatalogus, FK-invarianten, eigen export, admin-verwijdering en app-registratie van exporters en erasers, in de volgorde van
  ADR 0020. Accountverwijdering en audit blijven in één transactie (geen tweede verbinding op dezelfde laatste-admin-lock). Exporters filteren
  expliciet op eigenaar, ook als RLS gedeelde data toelaat. Valideer bewaartermijnen en retention-kolommen; catalogusregistratie ook in de
  generator; lever het privacyregister-sjabloon (juridische inhoud en back-uptermijnen blijven per app).
  **Afhankelijkheden:** audit, bewaarcatalogus en outbox (ADR 0050); goedgekeurde export- en verwijderspecs.
  **Klaar als:** gedeelde data van anderen ontbreekt in de export; accountverwijdering ruimt ook tokens en outbox op; laatste-admin en
  eigen-admin-verwijdering geweigerd; terugrollen herstelt actie en audit samen; negatieve pgTAP-fixtures voor cascades, nullable SET NULL en
  catalogusregistratie; een app-exporter en -eraser werkt zonder core-aanpassing. Retention is techniek, geen claim van AVG-conformiteit.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): inzage `GET /api/me/export` (permissie `app.use`, alleen eigen data, andere actor gemaskeerd, geen sessietoken); de app registreert exporters via `createApp({ privacy })` die expliciet op eigenaar filteren (was R-PRIV-01). Verwijderen via `app.delete_account(id)`; de app registreert verwijderaars (was in R-PRIV-02). `app_definer` krijgt voor `app.delete_account` ook delete op `"user"`, `verification`, select `verification."value"` (was in R-DB-14).
  aanleiding: `docs/template/adr/0051-audit-log-en-avg.md`
- [ ] **ST-15 (P1) — externe koppelingen via één vast patroon** ([ADR 0077](template/adr/0077-externe-koppelingen-via-poorten.md)). Elke koppeling
  met een externe dienst volgt hetzelfde patroon: indelen op zes kenmerken (machtiging, richting, ritme, gevoeligheid, kosten en quota, bron van
  waarheid), elke waarde wijst naar een bouwsteen in core. Leverancierneutraal: template-code en -docs noemen geen bestaande dienst.
  **Werk, in deze volgorde (één onderwerp per PR):** uitgaande client op de ingebouwde `fetch` (verplichte time-out, begrensd herhalen, host-allowlist,
  schemacontrole, log zonder geheimen, weigert een aanroep in een transactie) met een lokale nep-partner als testhulp; foutcodes
  `UPSTREAM_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `UPSTREAM_INVALID` met teksten; `secret()`-schema voor geheimen in env; lintregels tegen netwerk
  buiten de client; register en schakelaar per koppeling (migratie: eigen besluit-PR); partnerstap in de route kit; vaste vorm per koppeling met
  contracttestsuite en check; skill `nieuwe-koppeling`, paragraaf "Koppeling" in het spec-template, hoofdstuk in het gouden pad en een sectie in de
  feiten. Na ST-03, elk met eigen besluit-PR: outbox en sync, machineroute en inbox, tokenkluis per gebruiker, beheerschermen.
  Gebouwd: uitgaande client, nep-partner en foutcodes (#515), `secret()` (#519), lintregels `rails/netwerk-api` en `rails/geheim` (#522, #523), register en schakelaar (spec koppelingsregister), partnerstap (spec partnerstap), vaste vorm met contracttest en check (spec koppelingsvorm), agentlaag (spec koppeling-agentlaag).
  **Afhankelijkheden:** ADR 0077; ST-03 voor schrijven, sync, terugbellen en tokens. Elke app-koppeling krijgt daarnaast één handmatige run tegen
  de testomgeving van de partner (ADR 0077 punt 6).
  **Klaar als:** een agent met alleen de skill deelt een fictieve partner in en schrijft een spec waarin elk kenmerk naar een bestaande bouwsteen
  wijst; een gebruiker zonder permissie of een admin zonder MFA bereikt de partner niet (nep-partner telt 0 aanroepen) en krijgt `FORBIDDEN` of
  `MFA_REQUIRED`, nooit een `UPSTREAM_*`-code; time-out, 5xx en een ongeldig antwoord geven een vaste `UPSTREAM_*`-code zonder tekst van de partner
  (de spec legt per status de code vast); een partner-time-out houdt geen databaseverbinding vast; `fetch`, `node:http(s)`, `undici` en `net`
  buiten de client falen in de lint, ook via `globalThis.fetch` en een dynamische import; een uitgezette koppeling doet geen aanroep.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): de client weigert ook in een transactie van `withJob` (aanvulling R-CODE-12); de machineroute
  zonder login onder één vast prefix met verifier, tijdvenster, groottegrens, rate limit per IP en inbox, en een check die elke route buiten
  `defineRoute` en buiten de lijst van §3 laat falen (uitzondering naast R-UIT-02, §3).
  aanleiding: `docs/template/adr/0077-externe-koppelingen-via-poorten.md` (verzoek van de eigenaar, 3 en 4 november 2026)
- [ ] **ST-17 (P1) — accountbeheer als module van de template** (na ST-16). Nu bezit elke app de routes, contracten en schermen van accountbeheer en
  eigen account als startcode, zodat elke template-verbetering daaraan bij een template-update conflicteert.
  **Werk:** één module in core met lagen api, shared en web, door de template onderhouden; de app registreert routes, services, permissies en schermen in
  haar compositie-roots en kiest pad en navigatie. Core krijgt een eigen gegenereerd schema uit de core-migraties en importeert niets uit
  `src/api/db/schema.ts`. Eerst de accountlijst (contract, permissie, query via `tx`, RLS, API-client, scherm), dan de overige flows.
  **Afhankelijkheden:** ST-16; besluit-PR met ADR (A1: contract tussen zones) dat R-LAAG-01, R-DB-12 met ADR 0042 en R-WEB-05 herziet, daarna spec en bouw.
  **Klaar als:** HTTP-paden, contracten, foutcodes en teksten ongewijzigd; bestaande contract- en integratietests groen; core importeert geen app-code;
  de browserbundel bevat geen API-code; een template-update in de proef-app conflicteert niet in accountbestanden.
  aanleiding: `docs/reviews/2026-11-06-herbouw.md` (§4.3, besluit eigenaar 2026-11-06)
- [ ] **ST-01 (P0) — GitHub-bescherming daadwerkelijk activeren** (stuk 6). GitHub laat op `main` alleen werk toe via een PR
  met groene verplichte checks. Gebouwd: `scripts/github-ruleset.sh` met `test/scripts/github-ruleset.test.ts` (#104), `guard.yml` met alleen de job
  `check-core` (R-CI-07; de diff-guard is weg, ADR 0089 punt 5) en CODEOWNERS (gegenereerd uit de padtabel) en PR-template.
  De spec `templateregime` staat op `gebouwd`; haar proeven met de App zijn vervallen door ADR 0103 (bewijs `test/rails/codeowners-templateregime.test.ts`).
  Stand volgens ADR 0093: de agent werkt onder het account van de eigenaar; er komt geen GitHub App, token of machineaccount en geen
  `denyRead` op `~/.config/gh`; de ruleset eist geen review van een code-eigenaar en heeft geen bypass; wie een PR met een beschermd pad
  samenvoegt, beslist `pnpm pr:merge` op de padtabel (vangnet, geen grens; spec `docs/template/specs/agent-samenvoegen.md`).
  Open: organisatie, org-ruleset via custom property en Actions-instellingen (private repo's vragen Pro/Team); `.github/settings/` met `scripts/check-github.mjs` (alleen-lezend, een onleesbare instelling is een fout;
  ook `app_id` van verplichte checks, `enforce_admins`, conversation resolution) en `check-spec-approval`; `docs/operations/rails-checklist.md` met
  per stuk bewijs. Een machineaccount met review van een code-eigenaar blijft de weg voor een app met echte gebruikers (eigen app-ADR). De eigenaar
  activeert organisatie en instellingen.
  **Afhankelijkheden:** ADR 0039, 0040, 0045 en 0093; beschikbaarheid van de vereiste CI-checks.
  **Klaar als:** negatieve fixtures voor ontbrekende of bypassbare instellingen; bewijs dat een directe push naar main wordt geweigerd en een
  PR met een rode verplichte check niet mergebaar is. Geen actieve bescherming claimen op basis van alleen JSON-bestanden. Voorwaarde voor ADR 0030 PR 2.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `.github/settings/main-protection.json` en `scripts/check-github.mjs` volgen de ruleset van R-REPO-02 (was in R-REPO-02).
  aanleiding: `scripts/github-ruleset.sh`
- [ ] **Versie en build-SHA onderaan in de app** (stuk 3f; publieke buildmetadata, geen secrets). In `GET /api/health` staan ze al
  (spec release-versie, #724, #729). De versiestrategie zelf hoort bij ST-12 (Geparkeerd).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **`/.well-known/security.txt` en `LICENSE`** (eigendom, geen open-source-licentie): beide wachten op een waarde van de eigenaar
  (contactadres per app; licentietekst).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **`gate:fast` definitief** (stuk 4): vastleggen welke checks de definitieve `gate:fast` bevat (nu een groeiende lijst in `scripts/kit/gates.mjs`); `gate:slow` is gebouwd (#38), squawk staat onder Geparkeerd.
  aanleiding: `scripts/kit/gates.mjs`
- [ ] **Fout die in een app doorglipt wordt eerst een check of regel in de template** (met fixture), daarna gerepareerd in de app (fase 2; doorlopend, P5).
  aanleiding: `docs/template/adr/0046-werkstraat-en-beslisroute.md` (P5)
- [ ] **ST-10 (P1) — staging, release en aantoonbaar herstel** (fase 3, per app). Na een provider-ADR (app-ADR: hosting en beheerde Postgres met eigen
  rollen) een adapter in `deploy/<host>/`, gescheiden omgevingen, lektest via de pooler, rollen per omgeving via runbook, `check-deployment-schema` (faalt dicht, weigert preview
  tegen productie), `check-release-ci` vóór én na de build, beschermde production-approval, release-workflows en smoketest na deploy; headers/CSP op
  de host, CAPTCHA, PWA-manifest. Runbooks in `docs/operations/` (platform; back-up en herstel volgen uit ST-10a en wachten niet op het providerbesluit); beschrijf code-rollback,
  vooruitmigratie en verwijderde gegevens in back-ups. De eigenaar kiest beschikbaarheidsdoelen, RPO/RTO, regio en bewaartermijnen. **Afhankelijkheden:**
  providerbesluit, ST-01, ST-08, privacyregister. **Klaar als:** preview tegen productie faalt; vereiste CI en staging horen bij exact het
  releasecommit; de smoketest bewijst login, lezen en gesloten browser-datatoegang; een back-up is in een aparte omgeving teruggezet met gemeten
  dataverlies en hersteltijd. Productiegoedkeuring blijft bij de eigenaar.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `check-release-ci` vóór én na de build: commit is kop van `main` met groene CI, productie ook staging; `check-deployment-schema`: productieschema dekt code; beide falen dicht (was in R-REL-02). Met CAPTCHA krijgen `script-src` en `frame-src` het CAPTCHA-domein (was in R-SEC-04).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-6: niet geparkeerd besloten)
- [ ] **ST-10a (P1) — back-up en herstel als vaste bouwsteen** ([ADR 0108](template/adr/0108-back-up-en-herstel.md),
  spec `back-up-en-herstel`, beide voorgesteld). Het deel "back-up en herstel" van ST-10, los te bouwen vóór een provider-ADR.
  **Werk:** deel A (rol `app_backup`, nazorg-SQL na herstel, `deploy/backup.env`, image en service in `deploy/backup/`
  zonder Node, opruimtaak in een beschermde environment, nachtelijke export, dodemansknop, wekelijkse oefening, herstel naar
  een nieuwe database, runbook en herstelblad),
  daarna deel B (export vóór elke release, poort op een recente oefening en een bevestigd herstelblad).
  **Afhankelijkheden:** merge van ADR 0108; deel B wacht op de release-workflow van ST-10; de schakelaar voor
  achtergrondtaken na herstel komt met ST-03.
  **Klaar als:** de AC's van de spec hebben een test; één volledig herstel volgens het runbook door iemand anders dan de
  bouwer, met de gemeten tijd in de PR.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): R-DB-01 krijgt
  de rol `app_backup` (`LOGIN`, `BYPASSRLS`, lid van `pg_read_all_data`, geen schrijfrecht) en als enige rol met `BYPASSRLS`;
  R-DB-13 een uitzondering voor de nazorg-SQL na herstel (als `app_migrator`); R-ARCH-05 en R-ARCH-10 de mappen
  `db/backup/`, `db/restore-checks/` en `deploy/backup/` en het bestand `deploy/backup.env`; R-PROV-06 de back-up als vaste
  template-stap; R-SEC-06: back-upgeheimen in GitHub alleen in de environment `backup`.
  aanleiding: `docs/template/adr/0108-back-up-en-herstel.md` (verzoek van de eigenaar, 2026-11-23; eerste app met geld)
- [ ] **ST-18 (P1) — idempotente mutaties als bouwsteen** (spec `idempotente-mutaties`, voorgesteld; R-CODE-11, ADR 0045 punt 28).
  **Werk:** deel A (bonnetabel `app.request_receipts`, contractoptie `idempotent` in de route kit, sleutel in de API-client,
  `useRequestKey`, dekkingstest, gouden pad), daarna deel B (tombstone na de termijn). Route kit is core en gate-pad: risicowerk
  met een aparte tester. **Afhankelijkheden:** spec goedgekeurd; deel B wacht op de runner van ST-03.
  **Klaar als:** de AC's van de spec hebben een test; elke geld- of voorraadroute van een app gebruikt de bouwsteen (dekkingstest).
  aanleiding: `docs/template/specs/idempotente-mutaties.md` (verzoek van de eigenaar, 2026-11-23; app met saldo's en verkoop)
- [ ] **ST-19 (P1) — afbeeldingen tonen bij een resource** (spec `afbeeldingen`, voorgesteld; uitbreiding op spec `bestandsopslag`).
  **Werk:** eerst een besluit-PR die ADR 0060 punt 2 en R-OPSL-02 herziet (weergave-URL voor een vaste lijst rastertypen); dan
  deel A (`createViewUrl` op de poort, `img-src` in de CSP, veld `view`) en deel B (koppelpatroon bestand bij een rij, check, gouden pad).
  **Afhankelijkheden:** besluit-PR; het storage-deel van ST-11 eerst uit Geparkeerd en bestandsopslag deel A en B gebouwd;
  productie pas na bestandsopslag deel C (R-OPSL-04).
  **Klaar als:** de AC's van de spec hebben een test.
  aanleiding: `docs/template/specs/afbeeldingen.md` (verzoek van de eigenaar, 2026-11-23; afbeelding bij een artikel)
- [ ] **ST-20 (P1) — wachtwoord vergeten, per app in te schakelen** (spec `wachtwoordherstel`, voorgesteld; standaard uit).
  **Werk:** eerst een besluit-PR die ADR 0043 punt 3, R-AUTH-04 en R-UIT-03 herziet; dan het pad, twee schermen en de mail.
  Auth in core: risicowerk met een aparte tester. **Afhankelijkheden:** besluit-PR; mail-outbox van ST-03 (OV-2); buiten
  `local` en `test` pas met de CAPTCHA van ST-10 (OV-3).
  **Klaar als:** de AC's van de spec hebben een test; de bestaande auth-integratietests blijven ongewijzigd groen.
  aanleiding: `docs/template/specs/wachtwoordherstel.md` (verzoek van de eigenaar, 2026-11-23; app met veel gewone gebruikers)
- [ ] **ST-21 (P1) — appstyling: thema, schillen en stijlladder** (specs `app-thema`, `schillen` en `stijlladder`, voorgesteld;
  besluiten van de eigenaar 2026-11-15). **Werk:** app-thema deel A–C (componenttokens, rail op de kit, thema's per app), schillen
  deel A–B (`ShellFrame`, sidebar- en topbalkschil, eigen schillen met contracttest), stijlladder (treden, register en `check:stijl`).
  Beschermde paden met eigenaarakkoord in alle drie: app-thema B (lintregel in `eslint.config.js`, `.claude/rules/web.md`, skill
  `ontwerp-overnemen`), schillen B (nieuwe check in `scripts/kit/gates.mjs`, skill `nieuw-scherm`) en stijlladder
  (agentinstructies, skill, gate). Delen met een rail of check zijn risicowerk met een aparte tester, niet R-WERK-18.
  Raakt het geparkeerde ST-07 alleen bij het titel- en focusgedrag van `AppShell`, dat voor `ShellFrame` gaat gelden.
  **Afhankelijkheden:** app-thema A vóór schillen A; stijlladder na beide.
  **Klaar als:** de AC's van de drie specs hebben een test; een app krijgt een eigen uitstraling zonder `src/core` te wijzigen.
  aanleiding: `docs/template/specs/app-thema.md` (verzoek van de eigenaar, 2026-11-23; appstyling voor een eerste echte app)
- [ ] **Omhulsels met opties en xargs-optiewaarden in het rolhek.** `splitCommand` (`rails/hooks/lib/shell.mjs`) stopt bij de eerste optie van een
  omhulsel en kent `setsid`, `timeout` en `stdbuf` niet, zodat `env -i gh …`, `nice -n 1 gh …` en `timeout 9 gh …` voor de hoofdsessie de regels voor
  het label, `@file`/`--input` en `gh alias` ontlopen; `xargsCall` (`rails/hooks/lib/rolhek.mjs`) leest bij een long option of een cluster met waarde
  (`--arg-file F`, `-0a F`, `-rn 1`) de optiewaarde als commandowoord. Opties van omhulsels overslaan en die xargs-vormen lezen, met tests per vorm;
  `coreutils --coreutils-prog=env` hoort bij dezelfde klasse, net als een gh-vlag tussen `pr` en `review` (`gh pr -b x review 1 --comment`): `ghForbidden` leest groep en actie positioneel in plaats van via `ghCommandWords`.
  aanleiding: `rails/hooks/lib/rolhek.mjs` (delta-review ronde 2 van fix/rolhek-gh-allowlist)
- [ ] **Bekende gaten in het rolhek (R-ROL-10: vangnet, geen grens).** Het rolhek ziet niet: scripts in de repo, `node -e` en andere
  interpreters; voor de hoofdsessie `curl -K`, een kopie van `gh` onder een andere naam en `node_modules/.bin`; `find -exec`/`-execdir`/`-ok`; `sed -n` met het `w`- of
  `e`-commando voor elke rol behalve de reviewer (spec rolhek-lezen, OV-5);
  `SHELL_TRICKS` leest geen aanhalingstekens en weigert voor elke subagent een aangehaald jq-filter met ` . `
  (`select(. != null)` bij `gh api`, spec rolhek-lezen/AC-21, vals-positief);
  globs in paden (`rm src/api/routes/*.test.ts`, `sed -i … docs/adr/archief/0*.md`); symlinks en hardlinks (`ln -s test t && rm -rf t/`, `cp -l`);
  `git checkout <ref> <pad>` zonder `--`; `git -c core.pager=<cmd>` en andere `-c`-instellingen die een programma starten; `git -C <map>` en `cd x && …` binnen één commando (paden tellen vanaf de cwd van de payload); awk met `-f`, een variabel doel, `system()` of
  `| "cmd"`, afgekorte lange gawk-opties (`--sour=`, `--fi=`, `--incl=`; één helper voor afkortingen van lange opties in `shell.mjs`) en
  awk-uitvoer via opties (`-o`/`--pretty-print=f`, `-d`/`--dump-variables=f`); `git restore <map>` en `git checkout -- <map>` voor een
  lokaal ontbrekende map (de map-regel kijkt naar `isDir`, niet naar getrackte bestanden eronder); omhulsels en interpreters
  die de toets per segment niet kent (`timeout 5 b`, `stdbuf -o0 b`, `setsid b`, `eval 'b'`, `bash -c 'b'`, `bash <<<'b'`;
  de aanvaard-lijst van spec rolhek-aanvalscorpus, AC-5). Het schrijfdeel van deze gaten (interpreters,
  scripts, globs, links, `git checkout <ref> <pad>`, `git -C`, awk-uitvoer) viel voor subagents onder de toets op effect; die is vervallen (ADR 0091:
  aanvaard risico, op een beschermd pad de padtoets van het mergescript, ADR 0093), dus dit item geldt weer voor elke rol. Omhulsels met opties en xargs-optiewaarden staan in het item hierboven. Per gat kiezen tussen weigeren en melden, met tests.
  aanleiding: `rails/hooks/lib/shell.mjs` (review van PR 6a `fix/rolhek-gaten`; eigenaarbesluit 2026-11-01: de lijst bekende gaten uit R-ROL-10 naar de roadmap)
- [ ] **Vervolg compacte kennisbasis (V1–V5 en restpunten).** Het regelboek, de instructies, het rolhek, de afschaffing van taakmandaat en
  gate-label en het ADR-archief zijn gebouwd (#385–#404); wat resteert, elk als eigen kleine PR met eigenaarreview:
  (V1) Vervalt bewust: pnpm `run`/`exec` werken in de sandbox; alleen commando's die de store-index openen (`install`, `list`, `why`) falen, en een schrijfbare globale store is verboden (ADR 0061 punt 4, bewaakt door `test/rails/claude-sandbox-werkstraat.test.ts`: de store hardlinkt naar alle projecten). De eigenaar draait een zeldzame `pnpm install` buiten de sandbox.
  (V2–V4) Gebouwd: kerncijfers per PR met `pnpm meting --pr-tabel` en de bytes van het leespad met `pnpm leespad` (#406, #414), SessionStart zonder specslijst (#413) en de
  checklists per risicoklasse met de werkwijze één volledige review plus verschil in `docs/operations/review-checklists.md`. (V5) Niet uitgevoerd (besluit na onderzoek):
  het specsjabloon is ~2 KB en tests pinnen het (regel 2, de koppen van het skelet van `pnpm new:resource`), dus een herschrijving levert te weinig op. Het doel voor het
  leespad van een nieuwe feature blijft ≤ 25 KB; nu is het 74 KB met het hele `docs/framework.md` (40 KB), effectief ~46 KB als een agent alleen §8 (~11 KB) leest.
  Verder omlaag kan met `docs/gouden-pad.md` (11 KB) en `docs/dod.md` (7 KB) per onderdeel laden.
  Restpunten: een hint "werk de branch bij" bij `trusted`/`working` in `rails/hooks/lib/werkstraat.mjs`; de RegExp buiten de lus in
  `scripts/kit/check-roadmap.mjs` (rond regel 105); `docs/operations/agent-doorloop.md` inkorten (nu ~60 KB, doel ≤ 12 KB, overgangs- en
  correctieprocedures naar `docs/template/`); `check-docs` laten toetsen dat de R-regels in `.claude/rules/*` woordelijk gelijk zijn aan `docs/framework.md`;
  de fasekeuze voor Fase 0/1 uit `docs/dod.md` halen (bouwfasen van de template). Vervallen: de links in `achtergrondtaken` en
  `mail-outbox` naar het archief (er is geen specarchief meer, ADR 0089 punt 7) en de leerpunten #393–#411 (alle gesloten).
  Voor de eigenaar zelf (beschermde bestanden): `.claude/decisions.json` leegmaken (`decisions: []`), in `.claude/settings.json` de labelregel
  (`--add-label*gate-wijziging*`), de bewerkweigering op `decisions.json` en de verouderde allow voor `chore/mandate-adr-statusregel` weghalen,
  `gateMarker` uit `.claude/gates.json`, en de release-reset bij v1.0 (#384).
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): alleen-templatedocs komen in `docs/template/` (was in R-CI-06).
  aanleiding: #404 (laatste PR van het traject; plan en eigenaarbesluiten staan in #385, #394 en #400)
- [ ] **Geclaimde checks die niet bestaan** (R-DOC-02). Het regelboek eiste ze, maar geen check dwingt ze af: het verschil in aantal
  `unsafeCast` op de PR ("CI zet het verschil in aantal op de PR", was in R-CODE-04, tot de bouw alleen hier; nu alleen een vinkje in `.github/pull_request_template.md`), en de lintregels op `.isLoading`/`.isError` in `features/` (R-WEB-04; het oude framework noemde ze als
  afgedwongen, `eslint.config.js` heeft ze niet). Per check bouwen met falende fixtures, of de regel met eigenaarakkoord als proza laten staan.
  aanleiding: verliescontrole van het regelboek na #385–#404 (eigenaarvraag 2026-11-02; herstel-PR van de normen)
- [ ] **Bewaartermijn van gemeten data** (ADR 0064 punt 7). De meetbestanden in `<git common dir>/agent-meting/` groeien zonder grens en
  `pnpm meting` leest ze allemaal (ook `--trend`, voor de reviewrondes); een bewaartermijn en een lees-actie die alleen de gevraagde
  sessies of branches leest, met een volumetest zoals `test/rails/meting-volume.test.ts`.
  aanleiding: `docs/template/adr/0064-leesbudget-per-laag.md` punt 7 en `docs/template/specs/leesbudget.md` AC-8 ("zonder de bewaartermijn van metingen: een roadmap-item")
- [ ] **Krimp van bindende documenten in stappen onder 20 %** (R-DOC-02). `check-docs` vangt krimp boven 20 % en 1 KB per PR tegen
  `git merge-base origin/main HEAD` (`scripts/kit/leesbudget.mjs`); een reeks PR's die elk minder krimpt, valt erdoorheen. Bijvoorbeeld een
  cumulatieve meting over de laatste twintig gemergde PR's naast `pnpm meting --trend`, of een norm-telling (R-id's) in plaats van bytes.
  aanleiding: `docs/template/specs/leesbudget.md`, randgeval "Krimp in stappen onder 20 %" (bekend gat, ADR 0067 punt 3)
- [ ] **Regelboek zonder niet-gebouwde onderdelen als check** (R-DOC-10). `check-docs` regel 9 laat achter een niet-bestaand pad
  `(nog niet gebouwd)` toe; daarmee kan een clausule over een niet-gebouwd onderdeel terugkomen. Aanscherping: de markering alleen voor een
  doelmap die een gebouwde check al kent (nu alleen `docs/template/specs/` in R-CI-06), elders rood; plus een melding voor een functie of
  tabel in backticks die in `src/`, `db/` en `scripts/` niet voorkomt. Eerst een spec (de AC's van `compacte-kennisbasis-rails` pinnen regel 9).
  aanleiding: `scripts/kit/check-docs.mjs` (regel 9; review 2026-11-03, bevinding P5: 17 regels bonden iets dat niet bestond)
- [ ] **ESLint-onderdrukkingen afbouwen tot nul** (R-CI-02, spec onderdrukkingen-ratchet). Geen paar (bestand, lintregel) mag stijgen (`pnpm ratchet`,
  strikt) en `pnpm ratchet` meldt per PR de stand en de onderdrukkingen in de bestanden die de PR raakt. Stand bij de bouw en doel per lintregel:
  `rails/afwezigheid` 89 in 46 bestanden → 0 en `rails/negatieve-tabel` 51 in 29 bestanden → 0, elk in een eigen PR per testmap (`test/rails`,
  `test/scripts`, `test/hooks`, de rest), want het herschrijven is mechanisch; `complexity` 30 in 16 bestanden → 0, per bestand in de PR die het
  raakt, `rails/hooks/lib/rolhek.mjs` (10) samen met het krimpen van het rolhek; `max-params` 3 en
  `@typescript-eslint/no-unnecessary-type-parameters` 1 → 0 in één kleine PR. Een onderdrukking die echt nodig blijft, krijgt een eigen
  eigenaarbesluit met reden. **Klaar als:** `eslint-suppressions.json` is leeg en `pnpm lint:prune` verandert niets.
  aanleiding: `eslint-suppressions.json` (review 2026-11-03, bevinding P5: 123 onderdrukkingen zonder doel, een dag later 174)

- [ ] **Tokens per rol in de meting-store.** De Agent-payload van `PostToolUse` telt alleen de laatste aanvraag van een
  subagent (`totalTokens`) en een start op de achtergrond heeft geen totalen. Een `SubagentStop`-hook telt de tokens uit het
  transcript van de subagent op en schrijft ze per rol weg; dat raakt `.claude/settings.json` (`altijdVragen`), dus eerst een
  besluit-PR. **Klaar als:** `pnpm meting` toont tokens per rol, ook voor achtergrondruns, zodat het doel uit §8 van het plan
  (< 120k tokens per review) meetbaar is.
  aanleiding: `docs/template/specs/agents-leveren.md` (OV-2, eigenaarbesluit 2026-11-19: splitsen)
- [ ] **Overnameplan golf 2: vaste vorm voor overdracht en review.** [Overnameplan](reviews/2026-11-18-overnameplan-agentic.md) §4:
  een statuscontract voor alle vijf agents, afgedwongen door de SubagentStop-hook (ook voor architect en docs), het reviewrapport als schema
  met AC-tabel, `Niet getoetst:` en ruisfilter, en de security-review in dezelfde vorm. **Klaar als:** de hook weigert een eindbericht zonder
  status, en reviewerStop eist de AC-tabel.
  aanleiding: `docs/reviews/2026-11-18-overnameplan-agentic.md` (§4; leerpunten #683, #688; PR #596)
- [ ] **Overnameplan golf 3: groen betekent iets.** [Overnameplan](reviews/2026-11-18-overnameplan-agentic.md) §5: een bewijsregel per AC
  met exacte testtitel in check-docs, trigger en uitkomst per nieuwe AC, BASE_ROOD/IN_BRANCH in `pr:verify`, en een melding
  "0 tests geraakt" in de Stop-hook. **Klaar als:** elk punt heeft een check met falende fixtures.
  aanleiding: `docs/reviews/2026-11-18-overnameplan-agentic.md` (§5; leerpunten #793, #678, #758)
- [x] **Overnameplan golf 4: besluit-PR's die ADR's herzien.** [Overnameplan](reviews/2026-11-18-overnameplan-agentic.md) §6:
  `gebouwd` afleiden uit merge-feiten (ADR 0054, ADR 0080, ADR 0062, R-WERK-08), een begrensde fixlus (stopregel in CLAUDE.md,
  framework §8), schaduwmodus met een vooraf genoemde drempel (ADR 0091, ADR 0071 punt 6) en een gedragsbaseline voor
  tekstwijzigingen aan agents en skills (ADR 0059). Elk punt eerst als besluit-PR; de bouw volgt na de merge door de eigenaar. **Klaar als:** elk van 4a–4d heeft een gemergde of gesloten besluit-PR.
  Gemerged: #906 (ADR 0104, 4a), #907 (ADR 0105, 4b), #908 (ADR 0106, 4c) en #909 (ADR 0107, 4d); de bouw staat in de items hieronder.
  aanleiding: `docs/reviews/2026-11-18-overnameplan-agentic.md` (§6; eigenaarvraag 2026-11-18)
- [x] **Bouw ADR 0104: `gebouwd` volgt uit de AC-dekking.** Volgens de Gevolgen van het ADR: één gedeelde afleiding voor
  `check-docs`, `check-roadmap`, `feiten` en het rolhek; regel 6 als ratchet; `vergeten-gebouwd` weg; de omzetting van
  bestaande `status: gebouwd`; R-WERK-07, R-WERK-08 en R-DOC-10. **Klaar als:** de "Klaar als" van ADR 0104 klopt.
  Bewijs: `test/rails/ac-dekking.test.ts`, `test/rails/ac-dekking-basis.test.ts`, `test/rails/check-roadmap-dekking.test.ts`,
  `test/hooks/rolhek-gebouwd-afgeleid.test.ts`.
  aanleiding: `docs/template/adr/0104-gebouwd-uit-ac-dekking.md` (Gevolgen)
- [x] **Bouw ADR 0106: schaduwmodus met tijdgrens.** Register `.kit/schaduw.json` met schemacheck, `schaduw-termijn` in
  `strikt` en `meldingen` (voorvoegsel `schaduw:`), overslag in een app, weigering in `template:release`, meetregel `Schaduw` met `pnpm meting --schaduw` en de norm in het
  regelboek. **Klaar als:** de falende fixtures uit de Gevolgen van ADR 0106 staan groen.
  Bewijs: `test/rails/schaduw-register.test.ts`, `test/rails/schaduw-termijn.test.ts`, checks `schaduw-register` en `schaduw-termijn`.
  aanleiding: `docs/template/adr/0106-schaduwmodus-met-tijdgrens.md` (Gevolgen)
- [x] **Bouw ADR 0107: gedragsbaseline.** Spec `gedragsbaseline`; `scripts/kit/leerpunt.mjs` toetst `baseline:`,
  `geen baseline:` en het scenarioblok; het PR-sjabloon, de sluitzin in `opleveren`, een recept en R-WERK-13.
  **Klaar als:** de "Klaar als" van ADR 0107 klopt. Gemerged: #914.
  aanleiding: `docs/template/adr/0107-gedragsbaseline-voor-tekstwijzigingen.md` (Gevolgen)
- [ ] **Fixlus afdwingen (ADR 0105, R-DOC-02).** (a) De SubagentStop-hook (`reviewerStop` in `rails/hooks/lib/werkstraat.mjs`)
  eist per bevinding `blokkerend` of `klein`, en in de modus fixdiff per bevinding `opgelost` of `niet opgelost`; (b)
  `pnpm meting` meldt "let op" boven drie reviewrondes per branch. **Klaar als:** beide
  hebben een test met een fixture die op de huidige code faalt.
  aanleiding: `docs/template/adr/0105-begrensde-fixlus.md` (Gevolgen)
- [ ] **Nieuwe-app-script bouwstap 2: `repo-instellingen`.** Bouwstap 1 is gebouwd (`scripts/kit/nieuwe-app.mjs`,
  `test/scripts/nieuwe-app.test.ts`); het subcommando `repo-instellingen` bestaat nog niet. Eerst de spec herzien: werking 7, AC-10,
  de `REDEN_`-teksten en het bypass-randgeval leunen op `grensRedenen` uit `scripts/kit/pr-merge.mjs`, dat weg is sinds ADR 0093;
  wat `--controleer` dan toetst, is ontwerpwerk van deze stap of van `check-github` (ST-01). Kritiek werk (R-WERK-05): spec-review
  van de herziening, aparte tester en goedkeuring van de eigenaar op de PR. **Klaar als:** de herziene AC's van bouwstap 2 zijn groen
  en `scripts/kit/nieuwe-app.mjs` meldt niet meer dat `repo-instellingen` niet bestaat.
  aanleiding: `docs/template/specs/nieuwe-app-script.md` (bouwstap 2, "Te herzien vóór bouwstap 2")
- [ ] **Cloud-netwerkvorm: vervolg op de review van de bouw.** Uit #890, niet opgevolgd: (N-1) de main-regel decodeert alleen `%2F`,
  niet elke procent-escape (`branches/main/rename` en GraphQL `deleteRef` vallen erbuiten; de ruleset blijft de grens); (N-3) de
  MCP-regel herkent alleen de servernaam `github`; (N-5) de dubbele melding bij `git push origin main` wordt één melding; (B-3) een
  corpustoets op codeblokken uit `docs/**` en `.claude/skills/**` die vangt dat docs of skills een commandovorm voorschrijven die het
  rolhek weigert. Plus het open deel van de meting na de merge: of `gh api -X DELETE …/git/refs/heads/<branch>` een branch echt
  verwijdert (meting (e) is onvolledig, F12), terwijl de skill `opleveren` die route al voorschrijft (dat het hookproces
  `CLAUDE_CODE_REMOTE` ziet, is gemeten: F8). **Klaar als:** N-1, N-3, N-5 en B-3 hebben elk een test of een besluit "aanvaard", en de
  meting staat in de spec.
  aanleiding: `docs/template/specs/cloud-netwerkvorm.md` (#890 "Vervolg, buiten deze PR"; #900, meting (e) onvolledig)
- [ ] **Sandbox-probes `Read(/*secret*)` en de `.claude`-regels per submap uitvoeren.** Sinds 2026-10-23 "nog niet geprobeerd":
  verankert de sandbox `/*secret*` aan de projectroot of leest hij het absoluut? Leest hij het absoluut, dan is de root onbeschermd en volgt direct een herstel. Aanwijzing
  (geen meting): de sandboxinstellingen van een cloudsessie op 2026-11-22 tonen `/home/user/template/*secret*` als leesweigering, dus
  verankerd aan de root. **Klaar als:** de probes uit `docs/operations/sandbox-bewijs.md` zijn gedraaid en de uitslag staat daar.
  aanleiding: `docs/operations/sandbox-bewijs.md` (`Read(/*secret*)`, open sinds 2026-10-23)
- [ ] **Securitysuite toetst de zoek-escape.** Per resource met `q` toetst de suite dat `%` en `_` letterlijk gezocht worden en geen
  wildcard zijn. Na #656, #657 en #661 zou dit een roadmap-item of leerpunt worden; dat gebeurde niet. AC-17 en AC-18 van de spec
  dekken het gat tot dan. **Klaar als:** een test in `test/security/` faalt met een zoekterm `%` of `_` die als wildcard werkt.
  aanleiding: `docs/template/specs/lijstpagina.md` (OV-6, leerpunt #662)
- [ ] **Pools sluiten bij een mislukte start.** Mislukt het starten van de server, dan blijven de databasepools open; de spec besloot
  het gedrag gelijk te houden en het sluiten in een eigen PR te doen. **Klaar als:** een test laat zien dat `runServer` bij een
  mislukte start de pools sluit.
  aanleiding: `docs/template/specs/create-server.md` (OV-2, besluit eigenaar 2026-11-15: "een eigen PR")
- [ ] **Kleine restpunten uit reviews.** Elk klein en zonder eigen spec, als beperkte fix: `REVIEW_COMMENT_API`
  (`rails/hooks/lib/rolhek.mjs`) vangt geen endpoint met dot-segmenten zoals `pulls/./comments/1` (#822); `t.close()` in de
  `afterAll` van `test/security/actorsoorten.int.test.ts` gooit als `beforeAll` faalde en wordt `t?.close()` (#825);
  `test/scripts/nieuwe-app-poorten.test.ts` is rood als op de host een stack op +10 draait, op te lossen met
  `NIEUWE_APP_BEZETTE_POORTEN` (#862); ongeveer twintig testbestanden bouwen nog een eigen `GIT_ENV` (#785); de markeringen
  `(vervallen)`, `(nieuw)` en `(voorbeeld)` die `scripts/kit/ac-toets.mjs` kent, staan niet in R-WERK-07 of R-DOC-10 (#742,
  beschermd: eigenaarakkoord); `docs/operations/agent-doorloop.md` belooft een leerpunt over de schrijfbare `.git` in een worktree en
  meldt dat een merge in een worktree nog niet gemeten is. **Klaar als:** elk punt is gedaan of met reden geschrapt.
  aanleiding: #822, #825, #862, #785 en #742 (reviewopmerkingen "later" of "niet in deze PR")

## Geparkeerd

Bewust nog niet, tot de genoemde aanleiding er is (P1). Niets verdwijnt: elk item staat er met zijn scope.

- [ ] **Toasts: overige opvolging.** Bereikbaar onder een open modale `Dialog` (inert: niet voorgelezen, sluitknop onbereikbaar) en een `Toaster`
  voor `CenteredCard`-schermen (`/login`, `/uitnodiging`); toonklassen in een CVA-recept in plaats van gekopieerd uit `Notice`, zodat de
  contrasttest ze dekt; bestaande `Notice`-meldingen na een mutatie omzetten (`name-section.tsx`, `sessions-section.tsx`, `row-actions.tsx`) met
  bijgewerkte tests, waarna `.claude/rules/web.md` en `docs/gouden-pad.md` Toast noemen (beschermd pad: akkoord eigenaar).
  terug als: de proef-app toasts gebruikt
- [ ] **Screenshot-baselines van de catalogus** in de Playwright-image (uit fase 2).
  terug als: een visuele regressie doorglipt
- [ ] **ST-06 (P1) — generator tot complete CRUD-flow.** De generator levert bewust 501-handlers; zoeken en sorteren in de lijst zijn gebouwd
  (#111, #113). **Werk:** ontwerp na de proef-app een uitbreiding voor eenvoudige owner-scoped resources: migratie en RLS-tests, strict
  contracten, permissies, lijst/detail/aanmaken/wijzigen/verwijderen, query-hooks, formulieren en ConfirmDialog, met het gedeelde lijstpatroon
  en het cursor-contract. Documenteer welke relaties en bijzondere mutaties handwerk vragen; behoud spec-eerst, dry-run, weigering om te
  overschrijven en rollback bij mislukte generatie. **Afhankelijkheden:** ST-09, lijstpatroon, ADR 0047, retention uit ST-05.
  **Klaar als:** een gegenereerde fixture-resource werkt door alle lagen tegen de echte stack; isolatie, verboden rollen, validatie, paginering
  en destructieve acties getest; generatie haalt gates en build; dry-run toont alle schrijfdoelen, ook de route-tree; een mislukking laat geen
  half gegenereerde resource achter.
  terug als: ST-09 klaar is
- [ ] **Overnameplan: vervolg op de meting van ST-09.** Uit [het overnameplan](reviews/2026-11-18-overnameplan-agentic.md) §6 (na de
  tabel): detectie van verzwakte tests (eerst in schaduwmodus), een stille testreporter, een lokaal frictierapport uit de transcripten
  en eventueel leesrollen zonder Bash (ADR 0087). De cijfers van ST-09 bepalen welke van de vier een eigen item worden.
  Daar hoort ook een evalharnas met betaalde runs bij, als opvolger van de gedragsbaseline in de sessie (ADR 0107 punt 8,
  spec `gedragsbaseline`); dat vraagt een eigen ADR.
  terug als: ST-09 klaar is
- [ ] **Herbouw: lokale bewaking afbouwen waar een hard equivalent bestaat** ([herbouw](reviews/2026-11-06-herbouw.md) §5, stap 2–4).
  Stap 1 (een eigen GitHub App) vervalt door ADR 0093 en de effecttoets door ADR 0091. Daarmee vervalt ook de voorwaarde van de
  afbouw: de agent werkt blijvend onder het eigenaaraccount en het rolhek blijft (ADR 0093 punt 6), dus rolhekregels zonder hard
  equivalent (mergen of reviewen als eigenaar, tests verwijderen) blijven lokaal. Open: een ADR dat alleen de lokale controles uit
  §4.1 afbouwt die wel een hard equivalent hebben, per controle dat equivalent en een fixture die de omzeiling vangt, en de controles
  één voor één weg (eigenaarmerge per gate-pad). Het krimpen van regelboek en instructies (§4.2) loopt via "Vervolg compacte
  kennisbasis" en "Krimp van bindende documenten" hierboven; hier blijft alleen de ADR-set terugbrengen. Volgorde gekozen door de
  hoofdsessie op mandaat van de eigenaar ("doe wat goed is"): na ST-09, omdat die de meetgrond levert (`pnpm meting`, weigeringen per
  taak); de review adviseerde ervóór, zodat ST-09 de template meet en niet de bewaking, maar dat advies leunde op stap 1.
  terug als: ST-09 klaar is
- [ ] **ST-07 (P1) — schermpatronen en design-system, rest.** Lijstpatroon (#92, #114) en toasts (#129) zijn gebouwd. **Werk:** leg herbruikbare
  recepten vast voor lijst/detail/formulier, empty/loading/error/forbidden, bevestigen en succes-/foutfeedback; inventariseer ontbrekende
  componentvarianten uit de proef-app (kandidaten uit `docs/reviews/2026-10-14-ui-expansion-review.md`, "Andere gaten": progress en
  skeleton naast `AsyncView`, tooltip alleen als aanvulling en bestandsinvoer); behoud documenttitel- en focusgedrag bij nieuwe AppShell-mounts. **Afhankelijkheden:** ConfirmDialog;
  concrete behoeften uit ST-09. **Klaar als:** patronen in catalogus en voorbeelden; keyboard, focus en aria-live inhoudelijk getest; axe op 375
  en 1280 px zonder uitzonderingen; geen dubbele mutatie bij busy-state; ConfirmDialog documenteert retries na fouten; app-varianten vragen geen
  core-wijziging.
  terug als: ST-09 ontbrekende patronen heeft vastgelegd
- [ ] **ST-08 (P1) — monitoring en foutdiagnose** (fase 2: clientfouten naar een eigen tabel met allowlist-velden, geen PII, 5 min dedupe en
  build-SHA, framework §6). **Werk:** verbind serverfouten, clientfouten, build-SHA en request-ID; definieer signalen voor readiness-uitval,
  foutpercentage, jobachterstand en mislukte verzending, met per signaal drempel, verantwoordelijke en herstelactie in het app-runbook na
  eigenaarbesluit. Core levert contracten en uitbreidingspunten; de app kiest bij release monitor en alarmering. **Afhankelijkheden:** ST-03 en
  ST-05 voor jobstatus en retention, ST-12 voor buildidentiteit; spec voor clientfouten. **Klaar als:** een geforceerde fout is traceerbaar zonder
  PII, tokens, body of query; dedupe en opruimen getest; een alert en herstel zijn in staging bewezen. Geen telemetry-provider verplicht in core.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): fouttracking standaard in een eigen tabel via `reportClientError()`, externe dienst optioneel (was in R-PROV-01). De clientfouten-route wordt een data-route zonder login (naast de machineroute van ST-15): maximale grootte per melding, limiet per IP per minuut, geen onnodige vrije tekst; de bouw-PR zet hem als uitzondering terug in R-UIT-02 (was in R-UIT-02). `assert()` meldt in productie aan de fouttracking (was in R-CODE-04).
  terug als: de eerste app naar staging gaat
- [ ] **ST-11 (P2) — notificaties en storage (optioneel).** Notificaties: registratiecontract voor berichtsoorten, ontvangers en autorisatie,
  voorkeuren en kanalen, met hergebruik van mail-layout en outbox; in-app inbox en push vragen eigen specs. Storage: provider-neutrale grens
  voor uploads en downloads met owner-controle, toegestane typen en grootte, korte signed-URL-geldigheid, metadata en opruimen van verweesde
  bestanden; geen provider-SDK in de browser. **Afhankelijkheden:** concrete appbeslissing; ST-03, ST-05; provider-ADR; dependencygoedkeuring.
  **Klaar als:** ontvangstrechten en voorkeuren getest; herhaalde jobs veroorzaken geen dubbele inboxregels; twee gebruikers benaderen elkaars
  bestanden niet; verlopen links en ongeldige uploads geweigerd; accountverwijdering en retention behandelen bestanden. Zonder activering voegt het
  geen service of runtimeverplichting toe.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): core levert poort `FileStorage` met contracttestsuite (was in R-OPSL-01, ADR 0060).
  terug als: een concrete app notificaties of bestanden nodig heeft
- [ ] **ST-12 (P2) — templateversies en upgradecontrole** (stuk 6 template-versie; ADR 0040). Nu: `docs/template-changelog.md` met "Bij een update"-notities, `TEMPLATE_VERSION` en de versie in `GET /api/health` (spec release-versie) en
  `scripts/kit/app-init.mjs` die de template-SHA vastlegt; het versieschema is semver `0.x` en een update volgt een releasetag `template-v<x.y.z>`, met de adviserende `pnpm template:status` (spec `template-release`, ADR 0094). **Werk:** onderscheid releaseversie, opgenomen
  templatecommit en app-build-SHA; leg herkomst vast bij app-init en update; upgrade-notities bij breaking changes, migraties, instellingen en
  handstappen; een adviserende controle op core/app-grens en ontbrekende stappen die niets automatisch wijzigt en de mergeprocedure niet vervangt.
  **Afhankelijkheden:** ST-09; eigenaarbesluit over versieschema. **Klaar als:** app-init legt de juiste herkomst vast;
  een update wijzigt die controleerbaar; een fixture detecteert een ontbrekende upgradevoorwaarde; buildmetadata komt overeen met het gebouwde
  commit; een app kan een template-update reviewen zonder core-code te kopiëren.
  terug als: de eerste template-update (ST-09) gedaan is
- [ ] **ST-13 (P2) — SaaS- en PWA-pakketten (optioneel).** Documenteer activeringsgrenzen en een aparte ADR of spec per pakket. SaaS: workspace of
  tenant, lidmaatschap en rollen; abonnement of betaling alleen bij concrete behoefte. PWA: manifest, installatie, veilige updateflow en alleen
  afgesproken offlinegedrag; push apart van installatie. Kies geen billing-, push- of hostingprovider. **Klaar als:** het pakket is weglaatbaar
  en voegt zonder activatie geen tabellen, dependencies of externe dienst toe; SaaS-tests bewijzen tenant-isolatie over API én database;
  PWA-tests bewijzen updates en uitloggen zonder achterblijvende privé-cache.
  terug als: de eigenaar een concrete app en pakket kiest
- [ ] **E-mailconnector en e-mailtemplates.** Nu heeft elke mail een eigen bestand op het basissjabloon (`src/core/api/mail/layout.ts`) en
  verstuurt core alleen via SMTP (`src/core/api/mail/smtp.ts`). **Werk:** een provider-neutrale poort voor uitgaande mail met SMTP als standaard
  en een adapter voor een HTTP-maildienst per app-ADR (bezorgbaarheid, bounces); een registratie van mailsoorten (onderwerp, variabelen,
  Nederlandse tekst) op het basissjabloon, met voorbeeldweergave in Mailpit en een snapshottest per mailsoort. **Afhankelijkheden:** ST-03
  (verzenden alleen via de outbox, ADR 0050); het algemene plan voor externe koppelingen (uitgaande client met rail, machineroute en inbox
  voor bounce- en klachtmeldingen, app-brede sleutel in env): de adapter bouwt geen eigen HTTP- of geheimenpad; provider-ADR en dependencyakkoord
  (R-PROV-01, R-SEC-06). Mailsoorten met een inloglink raken auth (R-AUTH-05, R-AUTH-06) en gaan via een besluit-PR.
  terug als: ST-03 gebouwd en het koppelingsplan besloten is, of een app meer dan de basismails nodig heeft
- [ ] **SSO-module.** Inloggen via een externe identiteitsprovider (OIDC eerst, SAML alleen op aanleiding), per organisatie in te schakelen;
  koppelen aan een bestaand account alleen op geverifieerd e-mailadres; rol-, MFA- en sessieregels blijven gelijk (R-AUTH-02, R-AUTH-03,
  R-AUTH-08); intrekken bij de provider sluit de toegang. **Afhankelijkheden:** kritiek pad, eerst besluit-PR met ADR: R-AUTH-01 staat nu
  alleen de plugins two-factor en magic link toe en ADR 0041 wees een externe OIDC-provider als standaard af; tenantmodel uit ST-13 als SSO per
  organisatie gaat; het clientgeheim van de provider in env via het koppelingsplan, niet in de database; dependencyakkoord (R-SEC-06); integratietests tegen een
  lokale provider (R-TEST-01). Bouwt een app het eerder, dan gaat dat als `leerpunt` naar de template en wordt het hier algemeen herbouwd
  (R-WERK-13).
  terug als: een concrete app zakelijke klanten met een eigen identiteitsprovider heeft
- [ ] **Feature flags, onderhoudsmodus en waarschuwing bij niet-opgeslagen formulieren.** Niet in de basis (besluit eigenaar 2026-10-10).
  terug als: een app het nodig heeft
- [ ] **sonarjs, better-tailwindcss en squawk** (stuk 4): de eerste twee vragen een nieuwe dependency, squawk een nieuwe tool (voor `gate:slow`).
  terug als: een fout die deze tool had gevangen doorglipt, of de proef-app toont dat ze nodig zijn
- [ ] **Uitbreidingen op aanleiding** (voorheen R-FASE-02; R-FASE-01), elk met zijn aanleiding:
  - bestanden (signed URL's) of realtime, met eigen ADR; terug als: de app ze nodig heeft
  - screenshot-regressie en axe in CI; terug als: een visuele of toegankelijkheidsfout doorglipt
  - jscpd, knip, ast-grep; terug als: review herhaaldelijk kopieën, dode code of een fout patroon vindt
  - mutation testing; terug als: er kritieke reken- of geldlogica is
  - Renovate automatisch mergen en OpenTelemetry; terug als: de basis stabiel draait
  - devcontainer of agent-sandbox in Docker; terug als: iemand meewerkt of agents zonder toestemmingsprompts draaien
  aanleiding: `docs/framework.md` §12 (R-FASE-01; één plek per norm, R-DOC-06)
- [ ] **ADR 0030 PR 2: algemene agent-merge**. Voor niet-kritiek werk vervangen door ADR 0069
  (`docs/template/specs/agent-samenvoegen.md`); dit item gaat alleen nog over agent-merge van kritiek werk. Zie `.claude/skills/opleveren/SKILL.md`
  en `docs/operations/agent-doorloop.md`.
  terug als: er ≥ 10 feature-PR's zijn zonder gevolgfout, de AC→test-check en het risico-overzicht actief zijn en ST-01 is besloten
- [ ] **R-CODE-10 consequent: Engelse technische namen, Nederlandse UI** (was #407). Nederlandse identifiers, scriptnamen, configsleutels
  (`.claude/gates.json`), API-velden en documentstatussen naar Engels, in afgebakende PR's met een inventaris eerst; contracten en
  documentformaten apart, met een upgradeaanpak voor bestaande apps. Geen bewezen winst in tokens of snelheid; de aanpak en
  acceptatiecriteria staan in #407.
  terug als: gemengde taal in technische namen aantoonbaar een fout veroorzaakt of een check verbergt (zoals #402), of bij de release-reset (#384)

## Besluiten

Een ADR met status `voorgesteld` is geen besluit; afvinken gebeurt pas als de eigenaar hem accepteert.
Geldende ADR-besluiten staan in `node scripts/kit/feiten.mjs adr`; afgevinkte besluititems, ook eigenaarbesluiten zonder ADR, staan in [het archief](roadmap-archief.md).

- [ ] ST-01 (GitHub-bescherming) besluiten: voorwaarde voor ADR 0030 PR 2; zie Volgende.

## Gebouwd

Afgevinkte items per fase en stuk, met hun bewijs en de **Klaar als**-criteria: [roadmap-archief.md](roadmap-archief.md).
Nog open uit een stuk dat verder gebouwd is (3c en 3e):

- [ ] UI-kit: tabel, tabs, galerij en filterbalk (#156, spec `docs/template/specs/ui-data-display.md`); in `check:catalogus` en op `/design-system`.
      De carousel is op 2026-10-15 uit de spec gehaald (spec, "Buiten scope"); de componenten bestaan, de spec staat nog op `goedgekeurd`
- [x] Laatste geslaagde login en afzonderlijke deactivatie met herstel, naast blokkeren
      (spec `accountstatus-en-laatste-login`, ADR 0052); bewijs `test/api/account-lifecycle.int.test.ts`,
      `test/auth/login-tracking.int.test.ts` en `e2e/account-lifecycle.spec.ts`
