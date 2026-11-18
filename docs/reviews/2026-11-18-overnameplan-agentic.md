# Overnameplan: wat de template leert van de beste Claude Code-repo's

Datum: 18 november 2026. Basis: `origin/main` `2c0d9b11`. Soort: reviewdocument, geen spec of ADR; geeft geen mandaat.
Elk voorstel gaat via de werkstraat (framework §8); golf 4 gaat eerst als besluit-PR naar de eigenaar.

## 1. Werkwijze

De eerste ronde zocht op vier manieren naar repo's: GitHub-zoekopdrachten, curated lijsten, community-bronnen en
repo's die aantoonbaar met Claude Code gebouwd zijn. Dat leverde 39 kandidaten op. Van de top 20 controleerden agents
de sterren, de activiteit, de band met Claude Code en welke mechanismen er echt in zitten.

Daarna volgden drie analyses:

- **Gap-analyse:** 30 ideeën naast de template gelegd. Een tweede agent probeerde elke uitkomst te weerleggen.
- **Diepere oogst:** in de beste repo's verder gezocht en de leerpunten erbij gehaald. Elke kandidaat werd beoordeeld
  vanuit drie invalshoeken: winst, kosten en risico, en of hij bij de principes van de template past.
- **Opbouw van agents en skills:** onze 5 agents en 9 skills vergeleken met de best gebouwde voorbeelden.

De cijfers bij de leerpunten komen uit de issues en uit `pnpm meting`. Een deel is met de hand geteld (zie §7).

Gebruikte repo's: `obra/superpowers`, `garrytan/gstack`, `EveryInc/compound-engineering-plugin`, `humanlayer/humanlayer`,
`Fission-AI/OpenSpec`, `anthropics/claude-plugins-official` (onder meer pr-review-toolkit, feature-dev,
security-guidance, hookify), `anthropics/skills`, `wshobson/agents`, `trailofbits/skills`, `open-gsd/gsd-core`, en de
Anthropic-posts over harness-ontwerp.

## 2. Oordeel

Op handhaving is de template sterker dan vrijwel elke publieke repo. Rolhek, stop-hooks, tekstpins en check-docs heeft
bijna niemand. De zwakte zit elders, en de leerpunten bevestigen dat:

1. **Subagents zijn duur en leveren niet altijd.** In #664 kreeg de reviewer 67% van de weigeringen en verbruikte hij
   277k van de 634k tokens. Runs zonder rapport: #676 en #792.
2. **Overdracht en review hebben geen vaste vorm.** Er is geen statusregel, en "niet getoetst" ziet eruit als "schoon".
   Reviews keurden goed wat daarna rood werd (#683: 2 van 2).
3. **De boekhouding kost veel commits.** Ongeveer 10% van de commits is `mark … as built` of `set PR number`
   (#673, #756).
4. **Mechanismen worden hard gemaakt voordat ze bewezen zijn.** Er is drie keer gebouwd en daarna weer verwijderd,
   samen meer dan 22.000 regels (#700, #701, #705).

De beste repo's hebben voor elk van die vier een bewezen patroon. Neem die patronen over, en begin met wat geen
ADR-herziening vraagt.

Bij het schrijven gecontroleerd: de `description` in `.claude/agents/architect.md:3` en `.claude/agents/docs.md:3` bevat een
niet-gequote `: `, wat strikte YAML weigert. `.claude/agents/developer.md` noemt geen enkele skill. De
`SubagentStop`-matcher in `.claude/settings.json:174` dekt architect en docs niet.

## 3. Golf 1: klein en direct (geen ADR-herziening)

| # | Wat | Bron | Winst | Grootte | Leerpunten |
|---|---|---|---|---|---|
| 1a | **Defecten en drift in de agents:** YAML-quotes in de descriptions van architect en docs; een frontmatter-parsetest voor alle agents en skills; `tester.md` eerlijk maken over wat de hook wel en niet draait; architect stap 6 en de padlijst in docs vervangen door verwijzingen | trailofbits, gstack (één bron per norm) | Een echt defect weg, minder drift | S | |
| 1b | **Skillrouter in de developer:** per stap staat welke skill je laadt (migratie, nieuw-route, nieuw-scherm, nieuw-component, nieuwe-koppeling, ontwerp-overnemen). De kopie van AGENTS.md gaat eruit | superpowers, Anthropic best practices | Hoog: skills laden nu alleen als de beschrijving toevallig matcht | S | |
| 1c | **Budget en skelet eerst:** de reviewer rapporteert na hooguit 25 toolcalls, de architect schrijft de spec na hooguit 15. Regel: eerst een skelet, dan invullen. Bouwers krijgen geen geneste Agent-tool en geen `mcp__*` | #792 (na de budgetregel leverden 3 van 3 runs), feature-dev | Geen runs zonder uitvoer meer | S | #792, #676 |
| 1d | **Reviewpakket:** een kit-script dat per range één bestand maakt met log, stat, specpad en diff. Bij een re-review bevat het alleen de fixdiff | superpowers review-package | Tokens per review van ~277k naar <120k, minder weigeringen voor de reviewer | S-M | #664, #753, #736 |

## 4. Golf 2: vaste vorm voor overdracht en review

| # | Wat | Bron | Winst | Grootte | Leerpunten |
|---|---|---|---|---|---|
| 2a | **Statuscontract voor alle vijf agents:** het eindbericht begint met `Status: KLAAR / KLAAR_MET_ZORGEN / CONTEXT_NODIG / GEBLOKKEERD` en heeft hooguit 15 regels; het bewijs staat in een rapportbestand. De SubagentStop-hook dwingt dit af, ook voor architect en docs. Herhaalde rolhekweigeringen tonen als één regel | superpowers handling-reports, gstack, security-guidance | De hoofdsessie beslist op één woord, en "klaar maar onzeker" kan niet meer als klaar doorgaan | M | #792, #688 |
| 2b | **Reviewrapport als schema:** bevindingen in de vorm `B<n> [blokkerend/belangrijk/klein] bestand:regel`, een AC-tabel met oordeel (gedekt / ontbreekt / extra / misverstaan) en de test als bestand:regel, en de koppen `Niet getoetst:` en `Oordeel:`. Een blokkerende bevinding citeert het R-id en zegt of het defect al bestond. Ruisfilter: geen bevinding voor wat al bestond, wat een gate al vangt of smaak. Het rapport van de bouwer geldt als claims. Zustersites zoeken met `git grep` | superpowers task-reviewer, gstack checklist, pr-review-toolkit, EveryInc | Goedkeuren zonder bewijs wordt zichtbaar, minder vals-positieven | M | #683, #596, #603, #650 |
| 2c | **Security-review in dezelfde vorm,** met een falsificatiepass: lees per bevinding het codepad opnieuw | trailofbits fp-check | Een onvolledige security-review ziet er niet meer schoon uit | S | |

## 5. Golf 3: groen betekent iets, en de spec is het contract

| # | Wat | Bron | Winst | Grootte | Leerpunten |
|---|---|---|---|---|---|
| 3a | **Bewijsregel per AC** in het specsjabloon (`Bewijs: pad::'ns/AC-n: …'`). Check-docs eist die exacte testtitel, met een ratchet voor bestaande gaten | Anthropic harness-post (sprint contracts), OpenSpec | Geen extra CI-rondes meer op AC-dekking | M | #793, #678, #730 |
| 3b | **Nieuwe AC = trigger + uitkomst** | OpenSpec (WHEN/THEN) | Testbare AC's | S | |
| 3c | **`pr:verify` deelt rode checks in** als BASE_ROOD (al rood op main) of IN_BRANCH. Opleveren stopt bij BASE_ROOD | gstack base-red | Geen correctiepogingen meer op storingen die de agent niet veroorzaakte | S | #758, #693 |
| 3d | **Stop-hook meldt "0 tests geraakt"** terwijl er src gewijzigd is | humanlayer | Groen zonder dat er iets getest is, valt op | S | #683 |

## 6. Golf 4: besluiten die ADR's herzien (eerst een besluit-PR)

De eigenaar wil alle vier als besluit-PR voorgelegd krijgen.

| # | Wat | Herziet | Waarom het de moeite waard is |
|---|---|---|---|
| 4a | **`gebouwd` afleiden uit merge-feiten** (lokale git en trailers, offline), niet met de hand schrijven | ADR 0054, ADR 0080, het statusdeel van ADR 0062, R-WERK-08 | Ongeveer 10% van de commits en de losse status-PR's verdwijnen. ADR 0080 zegt al dat de merge het bewijs is |
| 4b | **Begrensde fixlus:** kleine bevindingen gaan nooit in de lus. Ronde 2 toetst alleen de fixdiff (opgelost of niet opgelost). Ronde 3 gaat naar een verse developer. Daarna volgt één gebundeld besluit van de eigenaar | De stopregel in CLAUDE.md, framework §8 | #596 liep 8 rondes. De huidige regel maakt geen onderscheid tussen een reviewronde en een mislukte fix |
| 4c | **Schaduwmodus met een vooraf genoemde drempel:** een nieuwe hook of check logt eerst alleen, en na een vaste periode besluit de eigenaar. Securitycontroles blijven meteen hard | R-PRINC-10, ADR 0071 punt 6, ADR 0091 | Meer dan 22.000 regels gebouwd en daarna verwijderd. Het oude bezwaar, dat niemand het log leest, vervalt door de tijdgrens en het verplichte besluit |
| 4d | **Gedragsbaseline voor tekstwijzigingen:** een PR die een agent of skill aanpast voor een gedragsleerpunt bevat het scenario en een paar runs zonder en met de wijziging | ADR 0059 (de ladder) | Een prozafix is nu een aanname. Een volledig evalharnas (L, met betaalde runs) volgt pas na ST-09 |

Daarna is ST-09 (de proef-app) de meetgrond. Op basis van die cijfers bekijken we vier dingen: detectie van verzwakte tests (eerst
in schaduwmodus), een stille testreporter, een lokaal frictierapport uit de transcripten, en eventueel leesrollen zonder Bash
(ADR 0087).

## 7. Bewust niet

- **Zekerheidsdrempels die het model zelf rapporteert.** Die zijn slecht gekalibreerd en kunnen echte RLS- of auth-blokkers onderdrukken.
- **Een verificateur per blokker.** Dat is een extra overdracht, terwijl ADR 0090 overdrachten net schrapte.
- **Een model per dispatch.** ADR 0090 heeft dat al geschrapt.
- **Een CI-reviewer.** Die vraagt een secret en is niet-deterministisch. Opnieuw bekijken na 4a.
- **Skills afleiden uit de git-historie, `docs/solutions`, geheugen per subagent of een plugin-pakket.** Deze omzeilen
  de triage, breken de onafhankelijke review of omzeilen de review van beschermde paden.
- **Mutatietests en een flake-register.** Hier is geen gemeten kostenpost voor.

## 8. Meten

Leg vóór golf 1 een nulmeting vast met `pnpm meting --trend`, `pnpm meting --pr-tabel`, git log en de leerpunten. Vergelijk na
elke golf over de volgende 10 PR's. De doelen:

- 0 subagentruns zonder rapport;
- weigeringen voor de reviewer onder 25% van het totaal;
- minder dan 120k tokens per review;
- hooguit 3 reviewrondes per PR;
- de helft minder fouten die na goedkeuring alsnog rood worden;
- ongeveer 0 boekhoudcommits;
- 0 correctiepogingen na BASE_ROOD.

Veel huidige cijfers zijn met de hand geteld. Neem daarom in de eerste PR van golf 1 mee dat de meting-store weigeringen en tokens per rol vastlegt.
