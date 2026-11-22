# 0104 — `gebouwd` volgt uit de AC-dekking op `main`, niet uit een statusregel

Status: geaccepteerd

Wijzigt [0054](0054-gebouwd-in-de-bouw-pr.md) punt 1, 3 en 5, [0080](0080-specarchief-en-bouwvorm.md) punt 4, 5 en 6,
[0062](0062-spec-en-bouw-in-een-pr.md) punt 4 en [0095](0095-gebouwd-zonder-pr-nummer.md) punt 1, 2, 3, 4, 5 en 7; de
regeltekst van R-WERK-07, R-WERK-08 en R-DOC-10 volgt in de bouw-PR (R-DOC-10). Drempel: A3 (de aanleiding van regel 6, 7 en
14 van `check-docs` en van de roadmap-id-regel verandert, de melding `vergeten-gebouwd` vervalt) en A4. Overnameplan golf 4a
([§6](../../reviews/2026-11-18-overnameplan-agentic.md)); voorstel van de architect, de merge door de eigenaar is het besluit.

## Context

Sinds 0095 zet de hoofdsessie of de architect `status: gebouwd` in een gewone commit van de bouw-PR. Wat overblijft: de
developer mag die regel niet schrijven (R-WERK-08), dus vraagt elke bouw een handeling van een andere rol; vergeet de bouw-PR
hem, dan volgt een losse PR (na 0103 zette één commit vijf specs op `gebouwd`); een vervolg-AC krijgt het merkteken
`(nog niet gebouwd)` erbij en weer eraf; en de melding `vergeten-gebouwd` bestaat alleen omdat dit vergeten wordt (#756).

De regel herhaalt een feit dat al vastligt: regel 6 van `check-docs` eist per AC van een gebouwde spec een testbestand met het
volledige AC-id, en een test komt alleen op `main` via een merge met groene verplichte checks (0054 punt 3). 0054 en 0095 wezen
"afleiden uit git" af: netwerk of een git-walk bij elke lezer, een squash-merge zonder head in git, checks die pas op `main`
afgaan, en "code geraakt" is geen "af" bij deelbouw. Die bezwaren gelden voor een afleiding uit de historie. Dit besluit leest
de boom en gebruikt git alleen voor de vergelijking met de merge-base die `check-roadmap` en `vergeten-gebouwd` al maken.

## Besluit

1. **Het mergefeit is de test op `main`.** Een AC is gebouwd als een testbestand in de boom zijn volledige id
   (`<namespace>/AC-n` of `<specnaam>/AC-n`) als heel woord noemt: de toets van regel 6. Een spec is gebouwd als elk levend
   eigen AC gebouwd is, en deels gebouwd (`n/m`) als een deel dat is; een vervallen AC (0095 punt 6) telt niet mee. Lezen vraagt
   alleen de boom: geen netwerk, geen historie, ook in een ondiepe kloon.
2. **De statusregel draagt alleen eigenaarstatussen** (`voorstel`, `goedgekeurd`, `vervallen`). Niemand schrijft nog
   `gebouwd`; `check-docs` weigert een `status: gebouwd` die op de merge-base niet stond, het rolhek ook. `feiten specs` toont
   de afgeleide stand.
3. **De checks gaan af in de PR die de stand verandert**, op de werkmap tegenover de merge-base (lokale git):
   - regel 6 wordt een ratchet: een AC dat op de merge-base gebouwd was en nu niet meer, is een overtreding (sleutel
     `docs:ac:<spec>:<AC-n>`), tenzij het in dezelfde PR vervalt;
   - regel 14 (dood pad) toetst elke spec met minstens één gebouwd AC; het lijstitem van een niet-gebouwd AC is uitgezonderd;
   - regel 7 (`:vorm`) toetst een spec zolang ze niet volledig gebouwd is;
   - `check-roadmap`: wordt een spec in deze PR volledig gebouwd en noemt ze een roadmap-id, dan wijzigt `docs/roadmap.md` mee.
   Zonder merge-base met `origin/main` meldt de check dat, zoals de AC-toets nu.
4. **Het merkteken `(nog niet gebouwd)` achter een AC-id vervalt.** Een nieuw AC zonder test is vanzelf niet gebouwd; een nieuw
   AC in een gebouwde spec blijft een inhoudswijziging, dus een besluit (0080 punt 4). `check-docs` weigert het merkteken op een
   nieuw AC; achter een doelpad in het regelboek (R-DOC-10) blijft het.
5. **Bestaande regels** `status: gebouwd`, met of zonder `# #<n>`, leest elke check als `goedgekeurd`. De bouw-PR zet ze in de
   template om in één mechanische commit; een app zet ze om wanneer ze wil, en een template-update maakt niets rood.
6. **`vergeten-gebouwd` vervalt** met regel 18: er valt niets meer te vergeten.
7. **Overgang.** Tot de bouw-PR gemerged is, gelden 0095 en R-WERK-08 zoals ze er staan.

## Alternatieven

- **Trailer `Bouwt: <spec>` in een commit van de bouw-PR.** `pnpm pr:merge` squasht, de eigenaar merget met een mergecommit:
  of de trailer op `main` belandt, hangt af van de merge-vorm. Een ondiepe kloon (sandbox, CI-jobs met `fetch-depth: 1`) ziet
  de historie niet. En de trailer is ook een handmatige claim per spec, die niets zegt over deelbouw.
- **De spec in de PR-beschrijving noemen:** alleen via `gh` leesbaar, dus niet offline.
- **De statusregel houden als cache die een check tegen de afleiding legt:** de bouwer schrijft hem nog steeds en de rolgrens
  blijft; alleen `vergeten-gebouwd` wordt hard.
- **Status quo (0095):** een handeling per spec door hoofdsessie of architect, en een losse PR als die vergeten wordt.

## Gevolgen

- Geen statusregel, geen merkteken en geen status-PR meer: de developer bouwt een AC af met zijn test, de merge beslist. Meten
  zoals 0046 punt 36.
- Controles nemen niet af (R-PRINC-10): de AC-dekking blijft, nu als ratchet tegen verlies; regel 14 toetst ook deels gebouwde
  specs; `check-docs` weigert meer (een nieuwe `gebouwd`-regel, een nieuw merkteken). Wat wegvalt: de expliciete claim "af"
  van een rol, en de melding die alleen daarvoor bestond.
- Aanvaard risico: een spec waarvan één AC geen test krijgt, wordt niet rood maar blijft zichtbaar deels gebouwd (`feiten`,
  AC-tabel van de reviewer). Een test die een AC-id noemt zonder het gedrag te toetsen, telt mee, zoals nu (0095, Gevolgen).
- Aanvaard risico: regel 14 kan op een deels gebouwde spec een pad buiten een AC-item melden dat nog komt; `(nieuw)` erachter.
- Apps: na de template-update blijft hun `gebouwd` geldig als `goedgekeurd`; de besluit-PR (R-WERK-05) verandert niet.
- **De bouw-PR bevat:** één gedeelde afleiding (voor `check-docs`, `check-roadmap`, `feiten` en het rolhek); per punt een test
  met een fixture die rood moet worden (AC verliest zijn test; nieuwe `status: gebouwd`; nieuw merkteken; spec wordt volledig
  gebouwd met roadmap-id zonder roadmapwijziging; dood pad buiten een AC-item van een deels gebouwde spec) en een die groen
  blijft (vervallen AC zonder test; dood pad in een niet-gebouwd AC-item; oude `gebouwd # #<n>`); geen merge-base geeft een
  melding; `vergeten-gebouwd.mjs` en zijn test weg; de omzetting; R-WERK-07, R-WERK-08, R-DOC-10 en de skills en docs die
  `status: gebouwd` voorschrijven; nieuwe AC's in spec `gebouwd-zonder-nummer` (één levende spec per mechanisme).
- **Klaar als:** geen spec in `docs/template/specs/` draagt `status: gebouwd` of het merkteken, `feiten specs` toont de
  afgeleide stand, en de genoemde fixtures staan groen in `pnpm test`.
