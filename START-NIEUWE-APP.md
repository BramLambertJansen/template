# Start een nieuwe app — opdracht voor de coding agent

Je start een nieuwe applicatie vanuit [BramLambertJansen/template](https://github.com/BramLambertJansen/template).
Werk niet in de template en maak geen fork: maak een nieuwe GitHub-repository vanuit de template, kloon die naar de
ontwikkelmachine, koppel de templatehistorie en draag de gecontroleerde app-repo over voor featureontwikkeling.

Dit is de korte ingang voordat de app-repo bestaat. Het [setup-playbook](docs/nieuwe-app.md) is de enige gedetailleerde
uitvoerbron; alleen de eenmalige installatie vóór de eerste agentsessie staat hieronder. Gebruik de actuele versie op `template/main`; meld tegenstrijdigheden en verzin geen tweede setuppad.

## Ondersteunde besturingssystemen

Deze setup ondersteunt **Ubuntu 24.04** en **Ubuntu 26.04**, rechtstreeks op de computer of op Windows via **WSL2**.
macOS valt buiten de huidige ondersteuning.

## Begeleiding: ook voor wie niet technisch is

De gebruiker is de eigenaar van de nieuwe app, maar hoeft niets te weten van programmeren, GitHub, terminals of
databases. Jij voert de techniek uit en begeleidt. De volledige begeleidingsregels (toon, eigenaarstaken, keuzes, uitleg in
gewone woorden) staan in het playbook, sectie *Begeleiding* in `nieuwe-app.md`; dat is de enige bron. Lees die sectie
vóór je de eerste vraag stelt.

## Intake: alleen vragen wat ontbreekt

Lees eerst de opdracht en eventuele voortgang. Neem een al gegeven naam, beschrijving of repo-naam over. Ontbreekt iets,
vraag dat in één bericht en wacht:

> Welkom! Ik zet je nieuwe app klaar en regel zoveel mogelijk zelf. Soms vraag ik je iets aan te klikken of
> over te typen; dan zeg ik precies wat en wat je daarna ziet. Aan het eind heb je een eigen project op GitHub, een
> map op je computer en een app die je in je browser opent.
>
> Hoe moet de app heten? Geef ook een korte beschrijving: wat doet de app en voor wie?
> Ik leid de projectnaam op GitHub af van de appnaam. Het project wordt standaard openbaar (public): iedereen kan de
> code lezen, niet je gegevens. Wil je een andere projectnaam, eigenaar of zichtbaarheid, zeg het erbij.

Bevestig naam, repo-naam, beschrijving en doelmap kort. Vraag alleen bij een ongeldige, onduidelijke of bezette keuze om
verduidelijking. Kiest de eigenaar privé, controleer dan vóór de repo bestaat of het GitHub-plan dat draagt (playbook
Fase 4.1, *Zichtbaarheid private*); anders blijkt het pas bij de eerste push. Sla de intake en actuele fase op in
`SETUP-PROGRESS.md` in de setupmap. Beschrijving en herkomst komen
later in de README van de app; de beschrijving komt ook bij de GitHub-repo. `app:init` verwerkt alleen de bestaande
hernoemstap, niet de beschrijving. Vraag nog geen volledige backlog, hostingprovider of productiegeheimen. Stel uit de
antwoorden een repo-naam voor; een appnaam bedenk je niet.

Deze template bevat geen gekozen proefapp of appdata. Alleen wanneer de eigenaar ST-09 opdraagt, volg je daarnaast het
[generieke praktijkprotocol](docs/operations/st-09-praktijkproef.md). Kies geen app of datamodel namens de eigenaar.

## Volgorde en overdrachten

| Stap | Uitvoering | Wanneer door? |
| --- | --- | --- |
| Intake en preflight | Agent controleert antwoorden, omgeving, bestaande tools, GitHub-login en -plan bij privé, template-instelling, restanten van een eerdere ronde met dezelfde naam en alle vijf lokale poorten | Ontbrekende keuzes zijn beantwoord; bestaande installatie hoeft niet opnieuw |
| Machine en toegang | Volgens het playbook; eigenaar doet noodzakelijke installatie, login en goedkeuring | Resultaat per eigenaarstap gecontroleerd |
| App-repo | GitHub-eerst via de templatefunctie, dan klonen naar `~/code/<slug>` | Juiste nieuwe repo, origin en bronversie vastgesteld |
| Historie en naam | Bron-tree vergelijken, eenmalig koppelen, `app:init`, beschrijving toevoegen | Tree gelijk, merge met twee ouders, eigen appnaam en beschrijving |
| Push en bescherming | Eerst CodeQL-beschikbaarheid vaststellen; eigenaar doet eerste main-push en aangewezen beveiligingsstappen; de agent geeft daarvoor het genummerde blok van playbook Fase 6.1 en laat de eigenaar niet zelf uitzoeken wat te typen | Bij ontbrekende of onbekende CodeQL stoppen; werkelijke push en instellingen gecontroleerd |
| Bootstrap en stack | Eigenaar installeert eerst met machinecontrole en start daarna de app | Machinecontrole groen; vervolgens volledige doctor, migraties en databasebewijs groen |
| Agent en browser | Runtimegrenzen controleren; browser-, login- en MFA-controle volgens playbook | Uitvoerder en uitslag vastgelegd; niet-uitgevoerde controles blijven open |
| Overdracht | Locatie, URL's, bewijs, beperkingen en de openingsopdracht voor de nieuwe sessie in de app-map | Stoppen; featurewerk begint in die nieuwe sessie |

**Eén eigenaarstaak tegelijk:** noem de terminal of plek, geef genummerde stappen en het verwachte resultaat. Eindig met
"Typ klaar als dit gelukt is; plak bij een fout de melding, zonder geheimen." Stop en wacht. Na de reactie verifieer je de
uitkomst, of vraag je de ontbrekende uitvoer. "Klaar" is een hervatsignaal, geen bewijs en geen opdracht voor nieuwe features.

Bij fouten blijf je bij de huidige stap en volg je de herstelregels van het playbook. Na een herstart lees je eerst de
voortgang en controleer je de laatste afgeronde stap. Een bestaande repo of map overschrijf je niet; verifieer herkomst
en staat voordat je hervat. Installeer werkende onderdelen niet opnieuw.

## Grenzen

- Eerst de omgeving controleren, niet eerst de template clonen en ombouwen. De nieuwe app ontstaat via GitHub met de templatefunctie.
- Vergelijk vóór de eenmalige `-s ours`-merge de tree van de nieuwe repo met `template/main`, zoals het playbook voorschrijft.
  Bij verschil stoppen en een herstelkeuze voorleggen: die merge neemt inhoudsverschillen niet mee.
- De eigenaar doet de eerste setup-push naar main en latere merges. Geen force-push, checkomzeiling of stilzwijgend public maken.
- GitHub-instellingen worden niet meegekopieerd. Rapporteer alleen daadwerkelijk gecontroleerde bescherming.
- Geen appfunctionaliteit, gekozen proefapp, appseeds of appdata in de template. Appspecificaties en appresultaten horen in de nieuwe app-repo.
- Maak onderscheid tussen werkinstructie en afdwinging: `.claude/`-hooks bewijzen niets over de sandbox van een andere agent.

## Eerste agentsessie

Er moet eerst een werkende coding agent in een Ubuntu-/WSL2-omgeving beschikbaar zijn. Een agent kan zichzelf niet
installeren voordat hij gestart is. De eigenaar verzorgt die minimale bootstrap. Hieronder staan de stappen voor Claude Code.
Voor een andere runtime bevestigt de eigenaar de start- en veiligheidsstappen, zonder stilzwijgend te wisselen.

Vooraf nodig: een GitHub-account, een Claude-abonnement met Claude Code, en op Windows
[Visual Studio Code](https://code.visualstudio.com/). Daarna, eenmalig:

Draai je Ubuntu rechtstreeks op je computer, open dan een terminal en begin bij stap 3. Staat Ubuntu of Claude Code er al,
sla dan de bijbehorende installatiestap over.

1. **In Windows: Ubuntu installeren.** Klik met de rechtermuisknop op **Start** → **Terminal (Admin)** (Windows 10:
   **Windows PowerShell (Admin)**), plak dit en druk op Enter. Verwacht: Ubuntu wordt geïnstalleerd; herstart de computer
   als daarom gevraagd wordt. Heb je al Ubuntu 26.04, dan is dat ook goed en sla je deze stap over.

   ```powershell
   wsl --install -d Ubuntu-24.04
   ```

2. **Ubuntu openen.** Open **Ubuntu 24.04** (of je bestaande Ubuntu 26.04) uit het Startmenu. Kies een gebruikersnaam en
   wachtwoord (dat wachtwoord heb je later nog nodig).
3. **Claude Code installeren.** Plak in dat Ubuntu-venster dit en druk op Enter. Verwacht: geen foutmelding. Sluit het
   venster daarna en open Ubuntu opnieuw.

   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

4. **Inloggen.** Plak in het nieuwe Ubuntu-venster dit en druk op Enter. Verwacht: Claude Code opent en vraagt je in te
   loggen; doe dat zoals het scherm aangeeft.

   ```bash
   claude
   ```

5. **Claude afsluiten.** Typ in Claude dit en druk op Enter. Verwacht: je ziet weer de Ubuntu-prompt.

   ```text
   /exit
   ```

6. **Instructies klaarzetten en agent starten.** Plak in hetzelfde Ubuntu-venster dit hele blok en druk op Enter.
   Verwacht: Claude Code opent in `~/setup` zodra beide instructiebestanden zijn opgehaald. Bij een fout stopt het blok
   en blijf je in Ubuntu.

   ```bash
   mkdir -p ~/setup &&
   curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/START-NIEUWE-APP.md -o ~/setup/START-NIEUWE-APP.md &&
   curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md &&
   cd ~/setup && claude
   ```

7. **Opdracht geven.** Plak in de geopende Claude-sessie deze opdracht en druk op Enter:

   ```text
   Start een nieuwe app vanuit BramLambertJansen/template. Volg START-NIEUWE-APP.md en daarna nieuwe-app.md.
   Vraag alleen de ontbrekende appnaam en korte beschrijving. Voer de setup stap voor stap uit, wacht bij eigenaarstaken
   op mijn reactie en controleer het resultaat voordat je doorgaat. Begin nog niet aan features.
   ```

Vul naam en beschrijving gerust al in de opdracht in; de agent vraagt die dan niet opnieuw. Ga niet ontwikkelen in de
setupmap. Na de gecontroleerde setup geeft de agent je een openingsopdracht voor een nieuwe sessie in de app-map
(playbook Fase 10); daar begint het bespreken van de eerste functionaliteit.
