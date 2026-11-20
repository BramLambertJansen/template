---
status: gebouwd
namespace: relatieve-tijd
---

# Relatieve tijd: `format.relative` en `RelativeTime`

## Doel

Elke app uit de template toont een tijdstip ten opzichte van nu ("3 minuten geleden", "gisteren", "over 2 dagen") met
één formatter in `src/core/web/lib/format.ts` en één kitcomponent `RelativeTime`, zonder dependency en deterministisch
testbaar door een expliciet referentietijdstip.

## Rollen en wie wat ziet

Geen nieuwe rol, permissie of zichtbaarheidsregel. De formatter en het component kennen geen accounts; ze tonen alleen
het tijdstip dat de aanroeper doorgeeft. Het catalogusvoorbeeld staat op de bestaande route `/design-system` achter de
bestaande guard `design-system:read`, met alleen vaste voorbeelddata (R-WEB-08).

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel, grant of opslag; tijd blijft een ISO-string uit de API (R-CODE-07).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| n.v.t. | n.v.t. | n.v.t. | n.v.t. |

n.v.t. — geen route, permissie of foutcode; alles draait in de browser.

## Koppeling

n.v.t. — geen externe dienst; `Intl.RelativeTimeFormat` en `Intl.DateTimeFormat` zijn ingebouwd in browser en Node.

## Kopieer de vorm van

- `src/core/web/lib/format.ts` — één formatter per soort waarde, gedeelde `LOCALE`, `parse()` die hard faalt op een ongeldige ISO-tijd.
- `src/core/web/lib/format.test.ts` — Nederlandse uitvoer letterlijk vergelijken; de nieuwe test komt in een nieuw bestand ernaast.
- `src/web/features/accounts/account-row.tsx` — hoe een scherm een ISO-tijd uit de API via `format` toont.
- `src/core/web/ui/copy-button.tsx` — vorm van een klein publiek kitcomponent met `readonly` props-interface.
- `src/web/features/design-system/input-utilities-examples.tsx` — catalogussectie met `Section` (id, titel, gebruikszin, `framed`).
- `src/web/features/design-system/example-targets.ts` — vindplaats van het voorbeeld per component en tabblad.
- `docs/ui-input-utilities.md` — vorm van de gebruiksdoc.

## Hergebruik en UX

Hergebruikt `Intl.RelativeTimeFormat` binnen `src/core/web/lib/format.ts` en `format.dateTime` voor de volledige datum; geen nieuw component buiten de kit.

### `format.relative(iso, now)`

- Signatuur: `relative: (iso: string, now: Date): string`, als vijfde sleutel naast `date`, `dateTime`, `cents` en `number`.
- Eén module-constante `new Intl.RelativeTimeFormat('nl-NL', { numeric: 'auto' })` met de bestaande `LOCALE`.
- `iso` gaat door de bestaande `parse()`: een ongeldige ISO-tijd gooit `format: geen geldige ISO-tijd: '<iso>'`.
  Een `now` met ongeldige tijd (`Number.isNaN(now.getTime())`) gooit `format: geen geldig referentietijdstip`.
- Verschil `d = (tijd(iso) − now) / 1000` in seconden, negatief = verleden. `a = |d|`. Vaste grenzen (geen kalenderrekening,
  geen tijdzone: een maand is 30 dagen, een jaar 365 dagen). Waarde = `Math.trunc(d / eenheid)` (afkappen richting nul,
  nooit naar boven afronden):

| Bereik van `a` | Eenheid voor Intl | Waarde |
|---|---|---|
| `a < 60` | `second` | altijd `0` (dus "nu", ook in de toekomst) |
| `60 ≤ a < 3600` | `minute` | `trunc(d / 60)` |
| `3600 ≤ a < 86400` | `hour` | `trunc(d / 3600)` |
| `86400 ≤ a < 604800` | `day` | `trunc(d / 86400)` |
| `604800 ≤ a < 2592000` | `week` | `trunc(d / 604800)` |
| `2592000 ≤ a < 31536000` | `month` | `trunc(d / 2592000)` |
| `a ≥ 31536000` | `year` | `trunc(d / 31536000)` |

- De functie leest nooit zelf de klok; `now` is altijd een argument.

### `<RelativeTime iso now? />`

- Nieuw publiek kitcomponent `src/core/web/ui/relative-time.tsx`, export `RelativeTime` en `type RelativeTimeProps`
  via `src/web/ui/index.ts`. Props: `readonly iso: string`, `readonly now?: Date` (standaard `new Date()` op het moment van renderen).
- Rendert precies `<time dateTime={iso} title={format.dateTime(iso)}>{format.relative(iso, now)}<span className="sr-only"> ({format.dateTime(iso)})</span></time>`.
  Zo leest een schermlezer de volledige datum mee (`title` alleen is niet toegankelijk), ziet een muisgebruiker hem als
  tooltip, en blijft de zichtbare tekst kort. Geen eigen klassen voor kleur of typografie: het component erft van de ouder (`Text`, `TableCell`, `DescriptionList`).
- Statisch bij render: geen timer, interval of live-verversing. Rendert de ouder opnieuw (bijv. een query-refetch), dan
  rekent het opnieuw met een nieuwe `now`. Reden: geen timers in de kit houdt tests deterministisch en voorkomt
  onnodige renders in lange lijsten; een app die live tekst wil, geeft zelf een `now` door.
- Geen nieuwe dependency, token, variant of copytekst: alle zichtbare tekst komt uit `Intl` via `format`.
- Bestaande componenten: `DescriptionList`, `Section`, `Stack`, `Text` (catalogus); `format.dateTime` (volledige datum).

### Staten

| Staat | Gedrag |
|---|---|
| laden, leeg, fout, bezig, gelukt | n.v.t. — geen data ophalen; de ouder regelt die staten met `AsyncView`. |
| ongeldige `iso` | Gooit dezelfde fout als `format.dateTime`; de bestaande ErrorBoundary van de route vangt hem (geen "Invalid Date"). |
| verouderd | Tekst kan verouderen zolang de pagina open staat zonder nieuwe render; geaccepteerd (zie "Statisch bij render"). |

### Alle zichtbare tekst letterlijk

Uitvoer van `format.relative` (vastgesteld met Node `Intl`, `nl-NL`, `numeric: 'auto'`):

| `d` | Tekst |
|---|---|
| `0` t/m `±59` s | `nu` |
| −60 s | `1 minuut geleden` |
| −180 s | `3 minuten geleden` |
| +300 s | `over 5 minuten` |
| −3600 s | `1 uur geleden` |
| −23 u 59 min | `23 uur geleden` |
| +2 u | `over 2 uur` |
| −1 dag | `gisteren` |
| +1 dag | `morgen` |
| −2 dagen | `eergisteren` |
| +2 dagen | `overmorgen` |
| +3 dagen | `over 3 dagen` |
| −6 dagen | `6 dagen geleden` |
| −7 dagen | `vorige week` |
| +7 dagen | `volgende week` |
| +14 dagen | `over 2 weken` |
| −29 dagen | `4 weken geleden` |
| −30 dagen | `vorige maand` |
| +30 dagen | `volgende maand` |
| −364 dagen | `12 maanden geleden` |
| −365 dagen | `vorig jaar` |
| +365 dagen | `volgend jaar` |
| −3 × 365 dagen | `3 jaar geleden` |

Schermlezertekst achter de relatieve tekst: ` (<format.dateTime(iso)>)`, bijv. ` (13 november 2026 om 11:00)`.

Catalogus, tabblad "Gegevens tonen", sectie:

- id `example-relative-time`, titel `RelativeTime`, gebruikszin `Een tijdstip ten opzichte van nu, met de volledige datum voor schermlezers en als tooltip.`
- Een `DescriptionList` met vaste `now` = `2026-11-13T10:00:00Z` en deze termen en tijden:
  `Zojuist` → `2026-11-13T09:59:30Z`; `Minuten geleden` → `2026-11-13T09:57:00Z`; `Vandaag` → `2026-11-13T07:00:00Z`;
  `Gisteren` → `2026-11-12T09:00:00Z`; `Vorige week` → `2026-11-05T10:00:00Z`; `Maanden geleden` → `2026-08-13T10:00:00Z`;
  `Jaren geleden` → `2023-11-13T10:00:00Z`; `Morgen` → `2026-11-14T10:00:00Z`; `Over 2 weken` → `2026-11-27T10:00:00Z`.
- Zoekdoeltekst in `example-targets.ts`: `Bekijk tijdstippen in het verleden en de toekomst; de volledige datum staat in de tooltip.`

### Focusvolgorde en toetsenbord

`RelativeTime` is geen interactief element: geen `tabIndex`, geen rol, geen eigen toetsenbordbediening; het staat niet
in de tabvolgorde. De volledige datum bereikt een schermlezer via de `sr-only`-tekst; een toetsenbordgebruiker die de
exacte datum nodig heeft, krijgt die van het scherm via `format.dateTime` (keuze van de feature, niet van dit component).

## Acceptatiecriteria

- **relatieve-tijd/AC-1** — Gegeven `now = 2026-11-13T10:00:00Z`, wanneer `format.relative` wordt aangeroepen met elke
  `d` uit de tabel "Alle zichtbare tekst letterlijk", dan is de uitvoer exact de bijbehorende tekst. Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-2** — Gegeven dezelfde `now`, wanneer `d` precies op een grens ligt (59 s, 60 s, 3599 s, 3600 s,
  86399 s, 86400 s, 604799 s, 604800 s, 2591999 s, 2592000 s, 31535999 s, 31536000 s, zowel verleden als toekomst), dan
  kiest de functie de eenheid uit de grenzentabel (bijv. −59 s → `nu`, −60 s → `1 minuut geleden`, −3599 s → `59 minuten geleden`,
  −86399 s → `23 uur geleden`, −604799 s → `6 dagen geleden`, −2591999 s → `4 weken geleden`, −31535999 s → `12 maanden geleden`). Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-3** — Gegeven `d = −89 min`, dan is de uitvoer `1 uur geleden` (afkappen, niet `2 uur geleden`);
  gegeven `d = −47 u`, dan `gisteren`; gegeven `d = −13 dagen`, dan `vorige week`. Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-4** — Wanneer `iso` gelijk is aan `now`, of `now` een paar seconden vóór `iso` ligt, dan is de uitvoer `nu` (nooit `over 0 seconden` of `-0`). Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-5** — Wanneer `iso` `'gisteren'` is, dan gooit `format.relative` `format: geen geldige ISO-tijd: 'gisteren'`;
  wanneer `now` `new Date('x')` is, dan gooit hij `format: geen geldig referentietijdstip`. Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-6** — Wanneer `format.relative` twee keer met dezelfde argumenten wordt aangeroepen onder een andere
  systeemklok (`vi.setSystemTime`), dan is de uitvoer gelijk: de functie leest de klok niet. Toets: `src/core/web/lib/format-relative.test.ts`
- **relatieve-tijd/AC-7** — Gegeven `<RelativeTime iso="2026-11-13T09:57:00Z" now={new Date('2026-11-13T10:00:00Z')} />`,
  dan rendert één `time`-element met `dateTime="2026-11-13T09:57:00Z"`, `title="13 november 2026 om 10:57"`, zichtbare tekst
  `3 minuten geleden` en `textContent` `3 minuten geleden (13 november 2026 om 10:57)`. Toets: `src/core/web/ui/relative-time.test.tsx`
- **relatieve-tijd/AC-8** — Gegeven `<RelativeTime>` zonder `now` en een systeemklok op `2026-11-13T10:00:00Z` (`vi.setSystemTime`),
  wanneer `iso` `2026-11-12T09:00:00Z` is, dan is de zichtbare tekst `gisteren`; na `vi.advanceTimersByTime` van een uur zonder
  nieuwe render is de tekst ongewijzigd en staat er geen timer open (`vi.getTimerCount() === 0`). Toets: `src/core/web/ui/relative-time.test.tsx`
- **relatieve-tijd/AC-9** — Het `time`-element heeft geen `tabIndex` en geen `role`; `RelativeTime` en `RelativeTimeProps` worden geëxporteerd uit `src/web/ui/index.ts`. Toets: `src/core/web/ui/relative-time.test.tsx`
- **relatieve-tijd/AC-10** — Op `/design-system?vak=gegevens` staat de sectie `RelativeTime` met de gebruikszin uit deze spec en
  de negen voorbeeldtermen met hun teksten (`nu`, `3 minuten geleden`, `3 uur geleden`, `gisteren`, `vorige week`, `3 maanden geleden`,
  `3 jaar geleden`, `morgen`, `over 2 weken`); `pnpm check:catalogus` slaagt zonder uitzondering. Toets: `src/web/features/design-system/relative-time-examples.test.tsx`
- **relatieve-tijd/AC-11** — De catalogussectie heeft geen axe-schendingen (een `scanAxe(page)` per breedte en thema) en geen pagina-overflow op 375 en 1280 px, licht en donker. Toets: `e2e/relative-time.spec.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `iso` gelijk aan `now` of binnen 59 s ervoor of erna | `nu` | n.v.t. |
| Afkappen bij 1 u 29 min of 47 u | `1 uur geleden`, `gisteren`; nooit naar boven afronden | n.v.t. |
| 23 u geleden maar op de vorige kalenderdag (Europe/Amsterdam) | `23 uur geleden`; geen kalenderrekening | n.v.t. |
| 26 u geleden, kalendermatig eergisteren | `gisteren` (verstreken tijd telt, niet de kalender) | n.v.t. |
| Zomer-/wintertijdovergang tussen `iso` en `now` | Verstreken seconden tellen; geen correctie | n.v.t. |
| 7–13 dagen | `vorige week` / `volgende week` (Intl-tekst bij waarde ±1) | n.v.t. |
| 30–59 dagen | `vorige maand` / `volgende maand` | n.v.t. |
| ISO met andere offset (`+02:00`) of milliseconden | Zelfde verschil in seconden; `dateTime`-attribuut is de invoer letterlijk | n.v.t. |
| Ongeldige `iso` | Gooit; ErrorBoundary van de route vangt het | n.v.t. |
| Ongeldige `now` | Gooit `format: geen geldig referentietijdstip` | n.v.t. |
| Pagina lang open zonder nieuwe render | Tekst verouderd; geen live-verversing (bewust) | n.v.t. |

## Raakt ook

Beschermde core-paden (eigenaarakkoord via deze spec, R-REPO-03):

- `src/core/web/lib/format.ts` — `relative` toegevoegd; bestaande sleutels ongewijzigd.
- `src/core/web/ui/relative-time.tsx` — nieuw component.

Overige bestanden van de bouw-PR:

- nieuw `src/core/web/lib/format-relative.test.ts` — AC-1 t/m AC-6 (het bestaande `format.test.ts` blijft ongewijzigd).
- nieuw `src/core/web/ui/relative-time.test.tsx` — AC-7 t/m AC-9 (Vitest-project `web`, jsdom).
- `src/web/ui/index.ts` — export `RelativeTime`, `type RelativeTimeProps`.
- nieuw `src/web/features/design-system/relative-time-examples.tsx` — `RelativeTimeSection`.
- `src/web/features/design-system/vak-panels.tsx` — sectie in het paneel `gegevens`.
- `src/web/features/design-system/example-targets.ts` — vindplaats `example-relative-time` in vak `gegevens`.
- nieuw `src/web/features/design-system/relative-time-examples.test.tsx` — AC-10 (sectie, gebruikszin, teksten).
- nieuw `e2e/relative-time.spec.ts` — AC-11 (375/1280 px, licht/donker, `scanAxe`, geen overflow).
- nieuw `docs/ui-relative-time.md` — gebruiksdoc: signatuur, grenzentabel, statisch gedrag, wanneer `format.dateTime` wel.

Checks die de bouw raakt: `pnpm check:catalogus` (nieuw publiek component + voorbeeld), `pnpm ui:check` (375/1280, axe),
`pnpm ratchet` (o.a. docs-controle), lint/typecheck/format. Niet geraakt: `check:migrations`, `check:secdef`,
`test:db`/policies, `test/security/resources.ts` en permissietests (geen tabel, route of permissie).

## Buiten scope

- Live-verversing (timer, interval, `useNow`-hook) en een gedeelde klokprovider.
- Kalenderrekening voor "gisteren"/"vorige week" in Europe/Amsterdam.
- Andere talen dan `nl-NL`, `numeric: 'always'`, korte stijl (`3 min. geleden`).
- Bestaande schermen (accounts, sessies) ombouwen naar `RelativeTime`; dat is een aparte, eigen keuze per scherm.
- Wijzigingen aan `src/core/web/copy`, tokens, recepten, dependencies, scripts, regels of bestaande tests.

## Testplan

- Unit (`format-relative.test.ts`): tabel uit "Alle zichtbare tekst letterlijk" als `test.each`; grenzen uit AC-2 in beide
  richtingen; afkappen (AC-3); `nu` en geen `-0` (AC-4); beide foutmeldingen (AC-5); klokonafhankelijkheid met `vi.setSystemTime` (AC-6).
- Component (`relative-time.test.tsx`): attributen, zichtbare en volledige tekst (AC-7); standaard-`now`, geen timers met
  fake timers (AC-8); geen `tabIndex`/`role` en barrel-export (AC-9).
- Catalogus (`relative-time-examples.test.tsx`): sectie op `?vak=gegevens`, gebruikszin en negen teksten (AC-10); `pnpm check:catalogus`.
- E2e (`e2e/relative-time.spec.ts`) tegen de echte lokale stack: 375/1280 px, licht/donker, `scanAxe`, geen overflow (AC-11).
- Procesbewijs (geen AC): `git diff --stat origin/main -- package.json pnpm-lock.yaml` leeg en de volledige bestaande testsuite groen.
- Risico: de teksten komen uit de ICU-data van de runtime. Zijn ze in een browser anders dan in Node, dan faalt AC-10 of AC-11 zichtbaar; meld dat en pas niets aan de grenzen aan zonder de eigenaar.

## Open vragen

- **OV-1** — Tekst onder 60 s: `nu` (Intl, `format(0, 'second')`) of `zojuist`. Aanbeveling: `nu` — komt uit Intl zonder eigen copytekst in core, en klopt ook voor een tijdstip net in de toekomst; `zojuist` zou een tekst in `src/core/web/copy` en een aparte toekomstvariant vragen.
- **OV-2** — "Gisteren" op verstreken tijd (24–48 u) of op kalenderdag in Europe/Amsterdam. Aanbeveling: verstreken tijd — deterministisch, tijdzone-onafhankelijk en eenvoudig te testen; de afwijking (26 u geleden is "gisteren", ook als het kalendermatig eergisteren was) staat in "Randgevallen".
- **OV-3** — Live-verversing. Aanbeveling: niet in de kit; statisch bij render (zie "Hergebruik en UX"); een app die het nodig heeft, vraagt later een eigen spec.
