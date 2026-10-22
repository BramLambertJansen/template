# Verwijs-PR na de ADR-consolidatie — gedeelde opdracht

Eigenaarbesluiten (2026-10-21): ADR 0001–0038 zijn geconsolideerd (gemerged #249–#253, #255). Verwijzingen buiten docs/adr/ gaan naar de nieuwe nummers, in drie PR's: A docs, B besluit-PR goedgekeurde specs, C code/rails/tests. Historie laten staan: docs/reviews/**, CHANGELOG.md (bestaande regels), gebouwde specs (accountbeheer, design-system, eigen-account, lijstpagina, rate-limit, ui-collections, ui-kit-basics, roadmap-vinkjes). db/migrations/** nooit wijzigen. Ook niet: test/rails/fixtures/**, synthetische ADR-paden in tests (docs/adr/0001-x.md, 0027-example.md, 0017-a.md, ...), .claude/decisions.json.

## Mapping oud → nieuw
0001,0002,0005 → 0039 (bestand `0039-stack-provider-neutraal-en-toolchain.md`; let op: er is ook een vervallen `0039-lokale-gate-hergebruik.md` — link altijd naar het volledige bestand)
0006,0008,0037 → 0040 · 0003,0007,0010 → 0041 · 0004,0012 → 0042 · 0013,0014,0024,0026 → 0043 · 0009 → 0044
0011,0017,0031,0032,0033,0034 → 0045 (ook nog geldende delen van 0023)
0025,0027,0030,0038 → 0046 (ook nog geldende delen van 0029; 0035 nooit gebouwd)
0016 → 0047 · 0015,0028 → 0048 · 0018,0019 → 0049 · 0020,0036 → 0050 · 0021,0022 → 0051

Puntnummers: elk besluitpunt in 0039–0051 heeft "(was 00NN punt n)". Vertaal "00NN punt n" via die herkomst naar "00MM punt k". Bekende eenduidige vertalingen: 0029 punt 5/6/7/8/9/10/14/15/16/18 → 0046 punt 13/14/15/27/28/29/30/33/35/32; 0038 punt 1/2/4/5/6/7/9 → 0046 punt 1/2/4/5/6/31/7; 0031 besluit 1/2/3/4/5 → 0045 punt 20/17/21/22/23; 0033 punt 1/2 → 0045 punt 3/8; 0033 punt 3 en 4 → 0045 punt 9; 0017 OV-4 → 0045 punt 16; 0011 punt 9 → 0045 punt 15; 0026 besluit 4 → 0043 punt 16; 0022 punt 5 → 0051 punt 14; 0021 punt 6 → 0051 punt 5; 0018 punt 3/4 → 0049 punt 4/5; 0037 besluit 6 → 0040 punt 17.
Niet eenduidig (verwijs dan naar het ADR zonder puntnummer, of naar het passende punt na lezen): 0029 punt 3 (vervallen; 0046 punt 7), 0029 punt 11–13 (0046 punt 36–37), 0029 punt 17 (0046 Gevolgen), 0029 P1–P7 (0046 Principes), 0038 punt 8 (verspreid), 0025 punt 4 en 0027 punt 6 (runner: 0044; CI/pr:verify: 0046), 0025 punt 3d (0046 punt 18), 0016 OV-1/OV-1b (0047 punt 1–3), 0020 punt 2 (0050 punt 2–3), OV-codes van specs (OV-A2 e.d.) horen bij de spec, niet bij het ADR.
Controleer elke vertaling in het nieuwe ADR; bij twijfel geen puntnummer.

## Regels
- Links in docs/** moeten naar bestaande bestanden wijzen (check-docs). Gebruik relatieve paden zoals de omliggende tekst.
- Alleen verwijzingen omzetten; geen inhoud herschrijven, behalve waar PR A expliciet werkinstructie toevoegt.
- Een test die een meldtekst letterlijk controleert, wijzigt in dezelfde PR als de bron; noem elke gewijzigde test met reden in je verslag.
- Niet committen of pushen; de hoofdsessie doet dat. Werk alleen in je eigen worktree.
- Checks (pnpm start mogelijk niet in de sandbox; node_modules en binaries uit /home/bmj/template/node_modules/.bin): prettier --check op gewijzigde bestanden; check-docs (`docsViolations` uit scripts/kit/check-docs.mjs, vergeleken met .kit/baseline.json: alleen `docs:adr:0039:dubbel` mag); voor C ook eslint en `vitest run` op de geraakte tests.
- Eindverslag kort: gewijzigde bestanden (aantal per map), wat bewust is blijven staan en waarom, niet-eenduidige vertalingen met je keuze, gewijzigde tests met reden, letterlijke laatste regel per check.
