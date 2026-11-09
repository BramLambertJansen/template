# 0086 — De tekst van een aangehaalde heredoc is geen substitutie

Status: geaccepteerd

Wijzigt [0083](0083-bewaking-met-minder-wrijving.md) punt 3 (vangnetten per segment) voor één vorm. Drempel: A3 (een
vangnet wordt smaller) en A4. Aanleiding: leerpunt #619 (PR #616, 7 november 2026), eerder #587. Uitwerking:
[spec rolhek-vooraf-krimp](../specs/rolhek-vooraf-krimp.md) AC-11.

## Context

`decideBash` in `rails/hooks/lib/rolhek.mjs` zoekt substituties (`$(…)` en backtick-paren) op de ruwe commandotekst en toetst
de inhoud als eigen commando. Die ruwe tekst bevat ook de body van een heredoc. De tokenizer in `rails/hooks/lib/shell.mjs`
slaat die body al over, maar `substitutions()` niet. Gevolg, gereproduceerd op main `d7de2dd`: `cat > f <<'EOF'` met in de body
tekst als `` `g*.md` `` of `` `lefthook.ym[]l]` `` wordt geweigerd met "een commandowoord dat niet letterlijk is", voor elke
rol. Bash voert in een heredoc met aangehaalde delimiter niets uit: geen substitutie, geen expansie. Dit raakt elke
commitboodschap met Markdown-code (`git commit -F - <<'EOF'`); de omweg (Write naar een bestand, dan `-F`) kost elke keer een
extra stap.

## Besluit

1. **De body van een heredoc met een aangehaalde delimiter is letterlijk voor `substitutions()`.** Aangehaald is
   `<<'EOF'`, `<<"EOF"`, `<<\EOF` en dezelfde vormen met `<<-`. Bij een onaangehaalde delimiter, een delimiter die niet
   letterlijk te lezen is (`<<$x`) of een body zonder sluitregel blijft alles zoals nu: de body wordt toetsend gelezen.
2. **De grens komt van de tokenizer, niet van een tweede lezer.** Alleen een `<<`-operator die `tokenize` zelf als operator
   leest, opent een body. `<<'EOF'` in een string, commentaar of `$'…'` doet dat niet, zodat tekst na een
   schijn-heredoc niet aan het zicht onttrokken wordt (de les van #603: een tweede bash-model laat telkens een sluiproute open).
3. **Alleen de substitutiezoeker verandert.** De rest van de regel met de operator blijft volledig gelezen (`cat <<'E'; $(x)`).
   De ruwe vangnetten (`RAW_*`, `SHELL_TRICKS`) blijven de heredoc-tekst bekijken (eigenaarsbesluit 26 oktober 2026): een
   body die `gh pr merge` bevat, blijft verdacht.

## Alternatieven

- **Alle heredoc-tekst letterlijk, ook onaangehaald.** Bash voert daar `$(…)` en backticks wel uit; dat is een sluiproute.
- **Een eigen heredoc-detectie met een regex in `substitutions()`.** Een tweede lezer die van bash en van `tokenize`
  afwijkt, is precies wat #603 liet lekken (`echo "<<'EOF'"` gevolgd door een regel met een backtick).
- **Niets doen, de omweg via Write.** Kost bij elke commit een extra stap en leert agents om rolhekmeldingen te omzeilen.

## Gevolgen

- Een commitboodschap of notitie met code tussen backticks gaat in één Bash-aanroep door, in een heredoc met aangehaalde
  delimiter.
- Een nieuwe heredoc-vorm die `tokenize` niet kent, valt terug op het huidige gedrag (toetsen), dus dicht.
- Het regelboek verandert niet; R-ROL-11 noemt dit niet.
