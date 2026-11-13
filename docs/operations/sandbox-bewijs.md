# Sandboxbewijs: `.claude/settings.json`

Handmatige proef van de Claude Code-sandbox uit `.claude/settings.json:130` (roadmap stuk 5). De hoofdsessie draaide de
probes zelf, met toestemming van de eigenaar, en legde alleen vast of een actie lukte; geen inhoud. Een test in CI kan dit
niet: de sandbox bestaat alleen in de agentsessie (`test/rails/sandbox-settings.test.ts` dekt de spiegel, niet de werking).

**Omgeving:** Ubuntu op WSL2, kernel 6.18.54.1-microsoft-standard-WSL2; `bwrap` en `socat` in `/usr/bin`. Datum 2026-10-21,
template-commit `bfa24b3`.

| Probe (elk een eigen Bash-commando, alleen de uitslag gelogd) | Verwacht | Uitslag |
| --- | --- | --- |
| `cat .env >/dev/null` | geweigerd | geweigerd door de sandbox (`Permission denied`) |
| `head -c 1 .env.example >/dev/null` (`allowRead`, `.claude/settings.json:149`) | toegestaan | toegestaan |
| `cat src/probe-secret.txt` (bestond al bij de start van het commando) | geweigerd | geweigerd (`Permission denied`) |
| `head -c 1 node_modules/better-auth/dist/context/secret-utils.mjs` (2026-10-23, met `Read(./*secret*)`) | toegestaan | geweigerd: `./*secret*` matcht op elke diepte; vervangen door `Read(/*secret*)`, uitslag daarvan open (zie Beperkingen) |
| `ls ~/.ssh`, `ls ~/.aws` | geweigerd | niet te toetsen: de mappen bestaan op deze machine niet |
| `touch ~/sandbox-probe`, `touch /etc/sandbox-probe` | geweigerd | geweigerd (`Read-only file system`) |
| `touch .claude/settings.json` | geweigerd | geweigerd (`Read-only file system`) |
| `curl https://api.github.com` (`allowedDomains`) | toegestaan | toegestaan |
| `curl https://example.com` | geweigerd | geweigerd (proxy `403`) |

Twee lagen: een eerder, samengesteld commando dat ook `.env` las, weigerde de permissielaag van Claude Code al vóór uitvoering
(`deny`, `.claude/settings.json:6`); de losse `cat .env` hierboven bereikte de sandbox en die weigerde het lezen.

## Beperkingen

- **Nieuw bestand binnen één commando.** De leesweigering op `*secret*` geldt voor paden die bestaan als het commando start.
  Een bestand dat hetzelfde commando aanmaakt en daarna leest, is leesbaar; in een volgend commando is het geweigerd. Een
  geheim dat al op schijf staat, blijft dus afgeschermd. Zo'n afgeschermd bestand kan de agent ook niet verwijderen
  (`Device or resource busy`); dat doet de eigenaar.
- **`Read(/*secret*)` en de `.claude`-regels per submap** (2026-10-23) zijn nog niet geprobeerd: de sandbox laadt de
  instellingen van de hoofd-checkout bij de start van een sessie. Open: of de sandbox `/*secret*` aan de projectroot
  verankert (zoals permissieregels) of als absoluut pad leest. Probes in een nieuwe sessie na de merge: de gemelde
  `denyOnly`; `probe-secret.txt` in de root en `.claude/` geweigerd; `secret-utils.mjs` in `node_modules` en in
  `.claude/worktrees/*/node_modules` leesbaar. Leest de sandbox `/` absoluut, dan is de root onbeschermd en volgt direct
  een herstel.
- **Plaatshouders** (meting 6 november 2026, Claude Code 2.1.318): in de sandbox waren de gemeten afgeschermde paden
  een alleen-lezen koppeling van `/dev/null` (tekenapparaat 1,3 van `nobody`, `rdev` 259); buiten de sandbox bestond geen pad
  van de toen zeventien paden van `SANDBOX_LEEG`. AC-11 dekt ook de vorm van een leeg bestand, die bij de meting van AC-11 (f)
  niet is gezien. `.env` en `.env.local` kwamen er later bij (AC-12, leerpunt #642) en zijn bij die meting buiten de sandbox
  niet gemeten. `pnpm pr:verify` telt ze niet als wijziging van de werkmap (ADR 0084, ADR 0091).
- **Geen geneste kooi** (meting 2026-11-11, hoofdsessie): binnen de sandbox kan de kooi (`scripts/kit/kooi.mjs`, ADR 0072)
  niet starten. De tests die haar nodig hebben slaan er over (ADR 0088, `docs/operations/testuitvoering.md`): `pnpm test:unit`
  exit 0 met 10.688 tests, 10.307 geslaagd, 381 overgeslagen, 0 mislukt, en één regel `⚠ overgeslagen: …`. Daarvoor faalden
  er 382 tests in 10 bestanden en weigerde de pre-push-hook elke push van een agent (leerpunt #607). Groen in de sandbox
  bewijst de kooi- en rolhektests niet; dat doet alleen CI (`pnpm pr:verify`).
- **`~/.ssh` en `~/.aws`** zijn alleen als regel aanwezig; bewijs volgt op een machine waar die mappen bestaan.
- **`excludedCommands`** (`.claude/settings.json:135-143`: onder meer `pnpm test:db`, `ui:check`, `gate:slow`,
  `db:generate`, `check:snapshot`) draaien buiten de sandbox, met `ask`; ADR 0044 beschrijft dat gat. Volgens de documentatie van
  Claude Code geldt de uitzondering alleen als elk commando in de Bash-aanroep op de lijst past: `cd`, `&&`, een pipe, een
  omleiding of `$(...)` houdt de hele aanroep in de sandbox. Meting 2026-11-10: kaal `pnpm db:generate` (hoofdsessie) en kaal
  `pnpm check:snapshot` en `pnpm db:generate` (developer-subagent) draaiden buiten de sandbox met exit 0; met een pipe erachter
  (`pnpm check:snapshot | tail -5`) bleef de aanroep in de sandbox; met `cd <wortel> &&` ervoor of `2>&1` erachter draaide
  hij er, anders dan de documentatie zegt, toch buiten. Alleen de kale vorm is dus zeker. In de sandbox faalt de
  remote-lezing van de runner; de melding noemt dan de kale vorm (`scripts/runner.sh:117`, spec `claude-sandbox-werkstraat` AC-13).
- **Niet getoetst:** `failIfUnavailable` en `allowUnsandboxedCommands: false` (`.claude/settings.json:133`–`:134`).
- De deny- en ask-patronen in `permissions` zijn gemak, geen grens (framework §8); dit verslag bewijst de sandbox.
