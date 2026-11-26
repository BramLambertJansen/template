# 0113 — Herstelcodes voor TOTP

Status: geaccepteerd

Herziet [0043](0043-accounts-uitnodigen-mfa-en-beheer.md) punt 3 (twee van de drie backup-code-paden gaan open) en punt 5
(wie zijn TOTP kwijt is, heeft eerst zijn herstelcodes). Drempel: A2 (auth) en A4 (0043 wijzigen). Aanleiding: roadmap
ST-02. Uitwerking: [spec accountbeheer-uitbreiding](../specs/accountbeheer-uitbreiding.md), OV-3.

## Context

Een admin heeft altijd TOTP (0043 punt 4). Raakt hij zijn telefoon kwijt, dan is `pnpm admin:create` op de server nu de enige
weg terug: werk voor de beheerder van de host, en bij de laatste admin een stilstand. De plugin two-factor van Better Auth
heeft herstelcodes (10 codes, versleuteld in `twoFactor.backupCodes`), maar 0043 zette alle drie de paden dicht, omdat ze
anoniem zijn, de eigen `trustDevice`- en sessieregels omzeilen en codes naar de browser sturen.

## Besluit

1. **`/two-factor/verify-backup-code` en `/two-factor/generate-backup-codes` gaan uit `disabledPaths`.**
   `/two-factor/view-backup-codes` blijft dicht (een gestolen sessie mag de codes niet lezen); er is geen route die het aantal
   resterende codes toont.
2. **Codes zie je één keer**: in het antwoord van `/two-factor/enable` (het inschrijfscherm toont ze na de eerste juiste
   TOTP-code) en van `/two-factor/generate-backup-codes`. Nergens anders gaan ze naar de browser.
3. **Inloggen met een herstelcode volgt dezelfde regels als inloggen met TOTP**: geen `trustDevice` en geen
   `disableSession`, alleen half ingelogd (met een volledige sessie; alle drie `VALIDATION`, terwijl `/verify-totp`
   `TRUST_DEVICE_DISABLED` houdt), dezelfde loginregels van 0052 (snapshot van `session_version`, gedeactiveerd, laatste
   login, geblokkeerd via `session.create.before`), en de nieuwe sessie krijgt sterkte `mfa`.
4. **Een herstelcode werkt één keer, ook bij twee gelijktijdige verzoeken**: blijvend door de compare-and-swap van de plugin
   op `backupCodes`; de race beslist een claim van gebruiker plus code via `app.claim_one_time_use` met een eigen prefix
   (0075, laatste gevolg), vóór de controle door de plugin, met TTL `TOTP_REUSE_BLOCK_SECONDS`. Een geclaimde code geeft
   hetzelfde antwoord als een foute (`INVALID_BACKUP_CODE`).
5. **Nieuwe codes maken vraagt wachtwoord én een `mfa`-sessie** (`MFA_REQUIRED`), net als wachtwoord en e-mail wijzigen
   (0043 punt 8); de oude codes vervallen.
6. Punt 5 van 0043 wordt: wie zijn TOTP kwijt is, logt in met een herstelcode; zonder codes blijft `pnpm admin:create`.

## Alternatieven

- **Paden dicht laten** (0043): houdt de afhankelijkheid van de hostbeheerder; afgewezen in OV-3 van de spec.
- **Eigen routes via `defineRoute`** in plaats van de plugin-endpoints: dubbel werk naast de versleutelde opslag en de
  poginglimiet van de plugin, zonder extra controle.
- **`/view-backup-codes` openen** om codes later te tonen: een gestolen `mfa`-sessie kan dan alle codes lezen.

## Gevolgen

- Een herstelcode is, net als het wachtwoord plus TOTP, genoeg om een `mfa`-sessie te krijgen. Wie wachtwoord en een code
  heeft, komt binnen zonder telefoon. Aanvaard: dat is het doel; de codes zie je één keer en elke code werkt één keer.
- De poginglimiet komt van de plugin (5 per uitdaging; daarnaast blokkeert de plugin het account 15 minuten na 10 foute
  pogingen, TOTP en herstelcode samen) en van Better Auth (3 per 10 s per IP op `/two-factor/*`).
- Faalt een verzoek na de claim zonder dat de plugin de code verbruikt (bijvoorbeeld de poginglimiet), dan is die geldige
  code tot het einde van de TTL onbruikbaar. Aanvaard: kort, en de andere codes werken.
- De plugin verbruikt een juiste code vóór de loginregels van 0052 de sessie weigeren. Wordt het account tussen de
  wachtwoordstap en de code geblokkeerd of gedeactiveerd, of stijgt `session_version`, dan is die code weg zonder sessie,
  en de web toont "klopt niet of is al gebruikt". Aanvaard (eigenaar, 26 november 2026): hooguit één code per uitdaging,
  en zo'n account kan op dat moment toch niet inloggen.
- Nieuwe herstelcodes maken is geen wijziging van de tweestapsverificatie in de zin van R-AUTH-02: het TOTP-geheim blijft
  gelijk, dus andere sessies blijven bestaan.
- `app.one_time_use` krijgt per geprobeerde herstelcode een rij, zoals bij TOTP (0075).
- De lijst in 0043 punt 3 noemt voortaan één backup-code-pad (`/view-backup-codes`); de test per pad volgt mee (R-TEST-02).
