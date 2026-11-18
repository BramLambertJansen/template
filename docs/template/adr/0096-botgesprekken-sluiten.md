# 0096 — De hoofdsessie sluit een beantwoord en verouderd botgesprek met een eigen script

Status: geaccepteerd

Wijzigt [0093](0093-agent-onder-eigenaaraccount.md) punt 6 en [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)
punt 6 (alleen: reviews via de API); vult [0069](0069-agent-merge-niet-kritiek.md) punt 4 aan (de ankertoets geldt ook voor
dit script; de merge-routes zelf wijzigen niet). Drempel: A3 (het rolhek laat een schrijfactie door die voor elke rol dicht
was) en A4. Uitwerking: [spec](../specs/botgesprekken-sluiten.md). Besluiten van de eigenaar, 2026-11-18.

## Context

Sinds 0093 voegt de hoofdsessie een PR zonder beschermd pad zelf samen met `pnpm pr:merge`. De ruleset op `main` eist
opgeloste gesprekken (R-REPO-02). Bij PR #803 (18 november 2026) liet het mergescript alles door, maar GitHub weigerde met
HTTP 405 "A conversation must be resolved before this pull request can be merged": de reviewbot van Codex had een gesprek
geopend. De bevinding was verwerkt in een nieuwe commit en beantwoord, maar het rolhek weigert elke GraphQL-mutatie met
`Review` in de naam, voor elke rol (0063 punt 6). De eigenaar moest klikken. Zo vraagt elke vrije PR met een botbevinding
een klik van de eigenaar, wat 0093 juist wilde wegnemen.

Eigenaar en agent delen één account (0093 punt 1). Wie een gesprek opende, laat zich daarom alleen onderscheiden als bot of
mens: GitHub geeft een bot het type `Bot`, een persoon het type `User`. Een reviewopmerking wijzigen of wissen via de
REST-API was nog open, en verbergen via `minimizeComment` ook; daarmee kan een agent de eerste opmerking van een mens wissen,
zodat een bot de eerste wordt, of een latere botopmerking wissen of verbergen.

## Besluit

1. **Eén eigen script.** `pnpm pr:resolve <nummer>` leest de reviewgesprekken van de PR bij GitHub, toetst per gesprek de
   voorwaarden van punt 2, sluit alleen wat voldoet en noemt elk ander open gesprek met de reden. Alle lezingen gaan vóór
   de eerste schrijfactie; wat niet te lezen is, wordt nooit gesloten.
2. **Voorwaarden per gesprek, alle drie:** (a) de eerste opmerking komt van een bot; (b) na de laatste opmerking van een bot
   staat een antwoord van een `User` met schrijfrecht (`OWNER`, `MEMBER` of `COLLABORATOR`); (c) GitHub meldt het gesprek
   als verouderd (de regel is sinds de opmerking gewijzigd). Een gesprek dat een mens opende, sluit het script nooit. Een
   botbevinding die de agent afwijst zonder de code te wijzigen, blijft voor de eigenaar.
3. **Niet op een PR met een beschermd pad.** Het script gebruikt dezelfde padtoets als het mergescript, op dezelfde kop van
   `main` als de modus. Raakt de PR een beschermd pad, of zijn de bestanden of de padtabel niet te lezen, dan sluit het
   niets: die gesprekken sluit de eigenaar, die de PR ook samenvoegt.
4. **Het rolhek laat alleen precies `pnpm pr:resolve <nummer>` door, alleen voor de hoofdsessie, onder dezelfde ankertoets
   als het mergescript** (0069 punt 4): modus `niet-kritiek` in het anker, scripts, rails en hostbestanden gelijk aan het
   anker, vanuit de repo-root. Elke andere vorm die het script herkenbaar start, weigert het voor elke rol. De kale mutatie
   `resolveReviewThread` via `gh api` blijft voor elke rol geweigerd.
5. **De wis- en verbergroute gaan dicht.** Het rolhek weigert voor elke rol elke schrijvende `gh api`-aanroep op een
   reviewopmerking (`repos/<repo>/pulls/comments/<id>`: elke andere methode dan `GET`, of een veld), en de mutatie
   `minimizeComment` (en daarmee `unminimizeComment`) valt onder de weigering van review-mutaties (besloten 2026-11-18): een
   botbevinding verdwijnt niet ongezien uit beeld. Dat geldt voor de directe `gh`-vorm, ook met `-R`, een volledig pad of
   `command`; via een omhulsel (`bash -c`, `env -i`) bij de hoofdsessie, of via een interpreter of een eigen
   script bij elke rol, ziet het rolhek een review-schrijfactie niet (R-ROL-10; geen nieuw vangnet, besloten 2026-11-18). Antwoorden in een gesprek
   (`…/pulls/<nr>/comments/<id>/replies`) blijft open voor de hoofdsessie.
6. **Wat 0093 punt 6 wordt:** de regels tegen samenvoegen, goedkeuren, labels en statussen blijven voor elke rol; de enige
   schrijfacties op reviews buiten de eigenaar zijn antwoorden en het sluiten van een gesprek via dit script.
7. Het script voegt niets samen en is geen voorwaarde van `pnpm pr:merge`; dat blijft de enige route om samen te voegen
   (0069 punt 4).

## Alternatieven

- **Een kale uitzondering in het rolhek** (`gh api graphql` met `resolveReviewThread` toestaan): het rolhek ziet alleen de
  tekst van het commando, niet wie het gesprek opende of of het verouderd is. Dan sluit de agent ook het gesprek van een mens.
- **Bot en beantwoord, zonder verouderd:** een antwoord alleen bewijst niets; de agent kan elke bevinding wegpraten.
- **Elk botgesprek sluiten:** de bevinding verdwijnt dan ongelezen uit beeld.
- **Ook sluiten op een PR met een beschermd pad:** bespaart de eigenaar een klik, maar daar wil hij elke botbevinding open zien.
- **De reviewbot uitzetten:** de bevindingen zijn nuttig (#803 leverde een echte verbetering); dan verdwijnt een gratis lezer.
- **De eis van opgeloste gesprekken uit de ruleset halen:** dan voegt de agent ook samen met een open gesprek van de eigenaar.
- **Het sluiten inbouwen in het mergescript:** het mergescript is de smalste route naar `main` en houdt één schrijfactie aan
  het eind; sluiten erbij maakt het groter en mengt twee besluiten. Een eigen script is apart te toetsen en te weigeren.
- **Een vangnet tegen omhulsels bij de hoofdsessie:** dat is het open roadmap-item "Omhulsels met opties"; het rolhek krijgt
  geen nieuwe regel per programma (R-ROL-10).

## Gevolgen

- Een vrije PR met een verwerkte en beantwoorde botbevinding komt zonder klik van de eigenaar op `main`.
- Aanvaard risico: "verouderd" bewijst dat de regel wijzigde, niet dat de bevinding is opgelost: een agent die alleen een
  regel aanraakt en "verwerkt" antwoordt, haalt de blokkade weg. Wat dat tegenhoudt: het antwoord en de wijziging staan
  zichtbaar in de PR, een gesloten gesprek blijft leesbaar, de verse reviewer leest de diff vóór de push (afspraak), elke
  agent-merge is een steekproef (0069 punt 5) en een PR met een beschermd pad voegt de eigenaar samen, met zijn gesprekken
  open (punt 3). Een vangnet, geen grens.
- Aanvaard risico: eigenaar en agent delen één account, dus een antwoord van de eigenaar zelf in een botgesprek, ook een
  bezwaar, telt als antwoord.
- Aanvaard risico: een bot die tussen lezen en sluiten opnieuw reageert, ziet zijn gesprek toch gesloten; de opmerking blijft
  leesbaar. Een gesprek wordt ook verouderd als de regel om een andere reden wijzigt (een merge van `main`); het antwoord
  blijft dan de voorwaarde.
- Aanvaard risico: het script schrijft via `gh` in een eigen proces, buiten het zicht van het rolhek, net als het
  mergescript. De grens is de ankertoets: een script dat op de eigen branch is gewijzigd, krijgt geen recht.
- Aanvaard risico: een agent (elke rol via een interpreter of een eigen script, de hoofdsessie ook via een omhulsel) kan een gesprek sluiten, een
  reviewopmerking wijzigen, wissen of verbergen, of het script starten zonder ankertoets; het rolhek ziet dat niet (R-ROL-10).
  Buiten een beschermd pad ziet alleen de review van de diff en van de PR het; een gesloten gesprek en een verborgen
  opmerking blijven in de PR leesbaar.
- Venster: tot een sessie een anker heeft met deze wijziging, kent het rolhek `pnpm pr:resolve` niet. De rolhekregel van
  punt 4 geldt dan niet, ook niet in de bouw-PR; alleen de eigen toets van het script blijft (modus, PR, padtoets).
- Wat het rolhek in Claude Code weigert, voor de directe vorm: een gesprek van een mens sluiten, een gesprek zonder antwoord
  of zonder gewijzigde regel sluiten (alleen via het script, dat dat toetst), een reviewopmerking wijzigen, wissen of
  verbergen, en het script starten in een andere vorm of als subagent. Het rolhek werkt alleen in Claude Code en is een
  vangnet, geen grens (R-WERK-23, R-ROL-10, zoals 0069 punt 4); elders voegt een agent niet zelf samen.
- R-ROL-08 en R-WERK-12 volgen dit ADR; R-ROL-10, R-REPO-01, R-ROL-12 en R-REPO-02 wijzigen niet. R-DOC-09 is van
  toepassing: de nieuwe uitzondering in het rolhek krijgt een leerpunt en een tabeltest.
