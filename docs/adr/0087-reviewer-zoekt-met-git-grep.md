# 0087 — De reviewer zoekt met `git grep`

Status: geaccepteerd

Herziet [0064](0064-leesbudget-per-laag.md) punt 5, alleen voor de reviewer. Drempel: A3 (het rolhek wordt ruimer) en A4.
Aanleiding: leerpunt #664, eerder #609. Uitwerking: [spec rolhek-lezen](../specs/rolhek-lezen.md) AC-6 tot AC-10.

## Context

0064 punt 5 gaf de reviewer een kleine leeslijst in Bash en zei: "pipes en `git grep` komen er niet bij"; zoeken deed de
Grep-tool. In sessies zonder Grep- en Glob-tool werkt dat niet. De route uit de weigertekst (`git ls-files` en Read) faalt:
`git ls-files` accepteert geen glob, `git grep` en `grep` zijn geweigerd. In zes proefsessies (snoeiproef 10 november 2026)
kwamen 58 van de 87 rolhek-weigeringen van de reviewer. Een reviewer kon niet nagaan of de tekst "7 dagen" nog ergens stond
en vertrouwde op een zoekactie van de hoofdsessie, de partij die hij onafhankelijk moet toetsen (R-ROL-04).

## Besluit

1. **`git grep` met een vaste optielijst, alleen voor de reviewer.** Alleen vlaggen en waarde-opties die lezen en tellen;
   elke andere optie, elke globale git-optie en elke variabele vóór het commando blijft geweigerd. Daarmee blijven dicht:
   `-O`/`--open-files-in-pager` (voor elke rol, al 0064 punt 5), `--textconv`, `--no-index`, `--untracked`,
   `--no-exclude-standard`, `--recurse-submodules`, `-f` en `-P`. Werkmap buiten de repo: geweigerd.
2. **Een patroon is vrije tekst, zonder expansie.** Spaties, aanhalingstekens en regex-tekens mogen; een stuurteken of een
   woord dat bash nog expandeert niet. `git grep` krijgt geen uitvoerweg die `git diff|log|show|status` de reviewer niet al
   geven (pager en fsmonitor uit repo-config); config wijzigen is voor elke rol dicht (R-ROL-08).
3. **Glob-pathspec bij `git ls-files` en `git grep`.** Een aangehaalde glob mag, na `--` en bij `git ls-files` ook zonder
   `--`, met één padregel voor beide posities: binnen de repo, geen pathspec-magie (`:` vooraan).
4. **De weigertekst wijst een route die werkt**, eerst de Grep-tool en zonder die tool `git grep` en `git ls-files`, en een
   test voert die route uit.
5. **Pipes, `grep`, `rg`, `wc` en `git blame` blijven buiten de lijst.** `git grep -c` en `-l` dekken tellen en een
   bestandslijst.

## Alternatieven

- **`grep -rn` of `rg`.** Lezen ook buiten de repo en hebben elk een eigen optieoppervlak met uitvoerwegen (`rg --pre`);
  `git grep` blijft standaard binnen de gevolgde bestanden.
- **Pipes naar `grep` of `wc`.** Vraagt per segment een tweede programma toetsen, zonder gemeten nood.
- **Niets doen; de hoofdsessie zoekt.** Dan toetst de reviewer niet onafhankelijk; dat is de reden van het leerpunt.

## Gevolgen

- De reviewer kan zonder Grep-tool in de hele repo zoeken; R-WERK-21 noemt die route.
- Een onaangehaalde glob, die bash zelf expandeert, wordt bewust geweigerd, met een melding die de aangehaalde vorm noemt.
  Een aangehaalde glob in een commando met `#`, `\` en dergelijke, die het rolhek niet zeker als aangehaald leest, wordt
  ook geweigerd; dat is een geaccepteerd vals-positief (R-ROL-11), met een melding die een werkende vorm noemt.
- Voor de andere rollen verandert niets.
