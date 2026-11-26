# 0112 — In de cloud herstelt een startup-hook de toolchain na een pin-bump

Status: geaccepteerd

Herziet [0085](0085-worktree-installatie-in-de-sandbox.md) (alternatief "Installeren vanuit een SessionStart-hook buiten de
sandbox"), [0061](0061-claude-sandbox-werkstraat.md) (gevolg "normale sessies vragen geen nieuwe toolchaininstallatie") en
R-TOOL-01, alleen voor nieuwe cloudsessies. Herziet ook het besluit over OV-1 van de spec
[cloud-zelfinstallatie](../specs/cloud-zelfinstallatie.md) (23 november 2026). Drempel: A3 (een hook voert zonder vraag
een installatie buiten de sandbox uit) en A4 (0061 en 0085 wijzigen). Aanleiding: incident van 25 november 2026.
Uitwerking: [spec cloud-toolchain-zelfherstel](../specs/cloud-toolchain-zelfherstel.md).

## Context

De omgeving op claude.ai/code draait het setup-script (`scripts/cloud-omgeving.sh`, dat `scripts/cloud-setup.sh` draait)
één keer, op de stand van dat moment, en hergebruikt daarna een momentopname. Die vervalt alleen als het veld of de
toegestane hosts wijzigen, niet als een pin in `mise.toml` of `package.json` omhoog gaat. Na de bumps naar pnpm 12.21.0 en
Node 26.13.0 startte elke nieuwe cloudsessie met Node 26.11.1 en pnpm 11.28.2; `feiten.mjs` weigerde, en het herstel was
handwerk van de eigenaar. Elke Renovate-bump herhaalt dat. Agents wezen het script of het netwerk aan, omdat de melding de
cache niet noemt.

## Besluit

1. **Een SessionStart-hook herstelt de toolchain**, alleen met `CLAUDE_CODE_REMOTE=true` en alleen bij `source: startup`.
   Lokaal en bij `resume`, `clear`, `compact` en `fork` blijft alles zoals in 0085 en 0061.
2. **De hookcode komt van het anker** (`rails/hooks/` op `main`, ADR 0045), in een eigen SessionStart-entry met een
   timeout van 600 s; de bestaande `session-start` blijft op 30 s. De lader ververst voor deze hook het anker en wist bij
   parallel uitpakken nooit een intacte map.
3. **Detectie zonder werkmapcode**: de hook leest de pins als tekst en past dezelfde regels toe als
   `scripts/kit/toolchain.mjs`. Klopt alles, dan doet hij niets, zonder netwerk.
4. **Installeren alleen als de invoer van de installatie gelijk is aan het anker**: `scripts/cloud-setup.sh`,
   `scripts/kit/` en de configuratie van mise, pnpm en lefthook in elke vorm die hun documentatie noemt, getrackt en
   ongetrackt en genegeerd, vergeleken op inhoud (blob-hashes zonder filters, niet via de index of de werkboom-diff van
   git) en zonder fsmonitor of externe diff uit de werkmap. Dan draait hij
   `scripts/cloud-setup.sh` uit de werkmap, synchroon, en stopt hij het met zijn hele procesgroep vóór zijn eigen timeout.
   Wijkt de invoer af, dan installeert hij niet.
5. **Eén regel in de context**, alleen bij herstel, een reden om niet te herstellen, of falen; de sessie start altijd. In de
   cloud noemt de melding van `feiten.mjs` de cache als waarschijnlijke oorzaak, met één herstelroute.
6. R-TOOL-01: de eigenaar installeert de toolchain lokaal met `scripts/bootstrap.sh`; in de cloud via de omgeving, en na
   een pin-bump via deze hook.

## Alternatieven

- **Niets doen; de eigenaar wijzigt het veld na elke bump** (OV-1 optie a): handwerk bij elke Renovate-bump, en tot dan
  kan geen cloudsessie werken.
- **Herstel bij elke sessiestart** (optie c): de werkmap is na `resume` door de agent beschreven; de reden waarom 0085 het
  afwees blijft gelden.
- **Installeren op elke verse clone, zonder vergelijking met `main`**: het veld draaide één keer, niet per sessie op de
  gekozen branch. Een hook die dat wel doet, voert als root buiten de sandbox de configuratie uit van elke branch, ook een
  die een agent pushte.
- **De sessie draait het script zelf, zonder te vragen**: de Bash-tool kan `~/.local` niet schrijven (sandbox, gemeten
  19 november), en het verschuift de grens naar de agent.

## Gevolgen

- In een cloudsessie die met een verouderde cache start, draait als root en buiten de sandbox alleen installatie-invoer
  die gelijk is aan `main`: werk dat door CI, de ruleset en de eigenaarmerge ging. `node_modules` en de mise-installaties
  uit de cache worden niet vergeleken. `pnpm install` met de lockfile van `main` controleert bij een kloppende
  `node_modules/.modules.yaml` de bestanden niet opnieuw, en `pnpm exec lefthook install` voert daarna
  `node_modules/.bin/lefthook` als root uit. Aanvaard restrisico: de cache komt van het veld van de eigenaar, en een
  agent kan `node_modules` in de sandbox alleen in zijn eigen sessie beschrijven, niet in de cache van een volgende.
  Hetzelfde geldt voor de git-configuratie in `.git/` tijdens het script zelf: alleen de vergelijking is ertegen
  gehard, niet elke git-aanroep van mise, pnpm of lefthook. `.git/` wordt niet gepusht; bij `startup` komt het uit de
  clone van het platform, vóór de agent iets doet.
- De vergelijking beschermt alleen tegen afwijkende installatie-invoer buiten `.claude/`. De SessionStart-hooks zelf (de
  stubs in `.claude/hooks/`, waaronder `laden.mjs`) en de `env` uit `.claude/settings.json` komen uit de werkmap van de
  gekozen branch en draaien al als root, vóór deze vergelijking. Dat risico bestond al vóór deze ADR (ADR 0045, 0061) en
  verandert hier niet; de grens daarvoor blijft CI, de ruleset en de eigenaarmerge, en de keuze van de eigenaar op welke
  branch hij een cloudsessie start.
- Op een branch met een pin-bump die nog niet op `main` staat, herstelt de hook niet; dan blijft het veld de route.
- Tot het veld wijzigt, herhaalt elke nieuwe sessie de installatie (ongeveer anderhalve minuut met Node aanwezig).
- Een hook- of laderwijziging werkt pas na de samenvoeging (0045); de hookcode moet op Node 22 draaien (koude VM).
- 0061 en 0085 krijgen in dezelfde PR een `Herzien:`-regel (R-CI-05).
