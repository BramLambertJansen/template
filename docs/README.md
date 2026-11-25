# Documentatie

Deze template is bedoeld om webapps met code-agents te bouwen. De documentatie helpt jou en de agents een app te starten, wijzigingen te bouwen en de gedeelde basis te onderhouden.

## Waar begin je?

| Je wilt… | Lees |
|---|---|
| Begrijpen wat de template bevat | [README](../README.md) |
| De lokale omgeving starten | [Lokaal draaien](../README.md#lokaal-draaien) |
| Een cloudomgeving voor Claude Code inrichten of herstellen | [Cloudomgeving](ENVIRONMENT.md) |
| Een nieuwe app laten aanmaken | [Startinstructie voor coding agents](../START-NIEUWE-APP.md) → [setup-playbook](nieuwe-app.md); de startinstructie beschrijft de volgorde, het playbook de uitvoering |
| De template met een echte app beproeven | [ST-09 praktijkproef](operations/st-09-praktijkproef.md): generiek protocol; appkeuze, appdata en resultaten blijven in de aparte app-repo |
| Een feature bouwen | Begin bij de [app-specs](specs/) of [template-specs](template/specs/). Hergebruik een passende spec. Volg na de spec-review de [bouwstappen met voorbeeldbestanden](gouden-pad.md#stappen). |
| Een spec opzetten als die ontbreekt | Gebruik voor een resource met een eigenaar per rij de [resourcegenerator](gouden-pad.md#begin-met-pnpm-newresource-naam) en voor andere features het [spec-sjabloon](specs/_template.md). |
| Een koppeling met een externe dienst bouwen | Skill `nieuwe-koppeling`; [Gouden pad](gouden-pad.md#koppeling-met-een-externe-dienst) |
| UI-componenten vinden en uitproberen | [UI-catalogus](design-system-catalogue.md) |
| Een ontwerp of huisstijl overnemen | Skill `ontwerp-overnemen`; mappingdocumenten in [ontwerp/](ontwerp/_template.md) |
| Tabellen, tabs, galerijen en filters gebruiken | [Gegevensweergave en navigatie](ui-data-display.md) |
| Een formulier over meerdere stappen verdelen | [Stappenformulier](ui-stappenformulier.md) |
| Een tijdstip relatief tonen ("3 minuten geleden") | [Relatieve tijd](ui-relative-time.md) |
| Een foutreferentie voor support tonen | [Foutreferentie](ui-error-reference.md) |
| Weten wat de app doet als het netwerk wegvalt of bij afdrukken | [Offline-melding en afdrukken](offline-en-print.md) |
| De architectuur of regels begrijpen | [Framework](framework.md) |
| Een PR beoordelen | [Definition of Done](dod.md) |
| Controles uitvoeren en CI-resultaten verzamelen | [Agentdoorloop met bewijs](operations/agent-doorloop.md#ontwikkelen-en-runnerchecks) |
| Weten hoe de tests parallel draaien | [Testuitvoering](operations/testuitvoering.md) |
| Weten wat nog ontbreekt | [Roadmap](roadmap.md) |
| Weten wat een template-update verandert | [Wijzigingen van de template](template-changelog.md) |
| Weten welke templateversie een server draait | `GET /api/health` geeft `version` en, met `BUILD_SHA` in de image, `build` (`src/core/shared/template-version.ts`) |
| Een beheerder aanmaken of herstellen | [Beheerdersrunbook](operations/eerste-admin.md) |
| Weten waarom een core-onderdeel zich zo gedraagt | [Loginregistratie en MFA](operations/loginregistratie.md), [focus van het foutenoverzicht](operations/formulierfocus.md), [datumkiezer](operations/datumkiezer.md), [foutlogging van idle databaseverbindingen](operations/databasefoutlogging.md) |

## Afspraken en achtergrond

Architectuurbesluiten staan in [template/adr/](template/adr/) en voor een app in [adr/](adr/). Een spec met status `voorstel` beschrijft voorgenomen werk. De agentdoorloop beschrijft [afgebakend core-werk](operations/agent-doorloop.md#besluit-en-taakscope-voorbereiden) en [hoe je goedkeuring en bouwstatus vaststelt](operations/agent-doorloop.md#pr-en-statussen-afronden).

In [reviews/](reviews/) vind je eerdere bevindingen en hun afhandeling. Verschilt een oude review van de huidige afspraak in het framework, een besluit of een spec, raadpleeg dan de wijzigingsgeschiedenis.

## Werken met agents

[AGENTS.md](../AGENTS.md) is het startpunt voor elke code-agent. Voor Claude Code komen daar [CLAUDE.md](../CLAUDE.md) en de regels, skills, rollen en hooks onder `.claude/` bij. Andere runtimes voeren die hooks niet automatisch uit. Bij verschil geldt het [framework](framework.md) (R-DOC-03).

Lees de spec van de feature die je bouwt of reviewt. Raadpleeg de [README](../README.md), deze leeswijzer, besluiten en reviews alleen als je taak erom vraagt (R-DOC-05). Een besluit legt het waarom vast. De eigenaar beoordeelt voorstellen en wijzigingen volgens de besluitroute van het framework.

## Documentatie onderhouden

Beschrijf de huidige werking in concreet Nederlands. Gepland werk hoort op de roadmap, keuzes met hun reden en gevolgen in besluiten, en wijzigingen voor appbouwers in de changelog.

Zet agentprocedures bij de ontwikkelinstructies. Noem de regel, het commando en de verwachte uitkomst. Bewaar voorbeelden, randgevallen, valkuilen, herstelstappen, overdrachtsinformatie en de reden achter beperkingen waar de bouwer ze nodig heeft. Houd ze vindbaar vanuit de leeswijzer of de agentinstructies. Controleer bij inkorten of lessen uit reviews en overleg behouden blijven, ook voor agents die een instructie afzonderlijk laden.
