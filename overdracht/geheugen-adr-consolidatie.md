---
name: adr-consolidatie
description: "Plan en eigenaarkeuzes voor het samenvoegen van ADR 0001–0038 tot 13 nieuwe ADR's (0039–0051), per cluster-PR"
metadata:
  node_type: memory
  type: project
  originSessionId: 0e8694cd-ff9d-4a78-a60b-e23485ad53c0
  modified: 2026-10-22T12:49:11.226Z
---

Eigenaarkeuzes 2026-10-21 (na #245/#246, ADR 0038 geaccepteerd):
- Nieuwe lijst: 0039 stack/provider/toolchain (0001,0002,0005) · 0040 template+grens core/app (0006,0008,0037) · 0041 auth (0003,0007,0010) · 0042 database/datapad (0004,0012) · 0043 accounts (0013,0014,0024,0026) · 0044 tests buiten sandbox (0009) · 0045 railwerk (0011,0017,0031,0032,0033,0034) · 0046 werkstraat/beslisroute (0025,0027,0030,0038 + resten 0029) · 0047 generator (0016) · 0048 UI-catalogus (0015,0028) · 0049 readiness/image (0018,0019) · 0050 achtergrondtaken (0020,0036) · 0051 audit/AVG (0021,0022).
- 0038 wordt opgenomen, als laatste cluster. 0002 en 0034 gaan op in een cluster.
- 0018–0022/0024: zelfde besluiten, compact, correcties uit 0036 erin; werkinstructie naar docs/.
- Per cluster een besluit-PR (alleen docs/adr), volgorde 0039–0042 → 0043–0044 → 0049–0051 → 0047–0048 → 0045 → 0046; daarna één verwijs-PR (docs/rails/scripts/tests/.claude).

Stand 2026-10-21: alle zes besluit-PR's open en groen: #253 (0039–0042), #251 (0043–0044), #252 (0049–0051), #249 (0047–0048), #250 (0045), #255 (0046, als laatste mergen). Daarna nog de verwijs-PR (worktrees $TMPDIR/wt-consol{,2..6}).

Alle zes gemerged. Botsing: #247 voegde ook een 0039 toe (0039-lokale-gate-hergebruik); eigenaar koos: die naar `vervallen` (#257), #248 dicht, dubbel nummer als baseline-uitzondering (#256). #254 (codex testparallelisme) afgerond, wacht op #256.
Verwijs-PR: eigenaar koos drie PR's (A docs, B besluit-PR goedgekeurde specs, C code/rails/tests met testparen), en historie (docs/reviews, CHANGELOG, gebouwde specs) laten staan.

Koerswijziging eigenaar 2026-10-22: einddoel is één lijst met alleen de geconsolideerde ADR's (0039–0051 houden, geen hernummering). Oude ADR's 0001–0038 en 0039-lokale worden verwijderd, MITS alle informatie in de nieuwe ADR's staat (geen "staat in 0012"-verwijzingen). Nieuw ADR alleen als het onderwerp niet in een bestaand ADR past; anders bestaand ADR herschrijven met de aanvulling. Akkoord vanuit chat/sessie, in dezelfde PR. Vraagt eerst wijziging van A4 (0046 punt 2) + guard/rolhek. Historische docs: links omzetten naar nieuwe ADR's.

Stand 2026-10-22: verwijs-PR's open: #258 (A docs), #259 (B specs, gereviewd ok), #260 (C code/rails/tests; developer schreef beschermde paden via Python in Bash, Edit-ask ging niet af — gat in rolhek, voorleggen/roadmap). Eigenaar akkoord op plan: (1) verwijs-PR's af, (2) 0046 punt 2 (A4) herschrijven + guard/rolhek, (3) 13 ADR's zelfstandig maken, (4) oude ADR's verwijderen + baseline-entry weg + historische links om. Voorwaarden: merge blijft acceptatie; herzieningsregel per ADR; verwijderen pas na reviewer-check; ADR-wijziging alleen in besluit-PR. Overdracht: /tmp/claude-1000/overdracht-adr.md (tijdelijk; zie ook dit bestand).

Stand 2026-10-22 later: #258, #259 en #260 (head 21239a1, commentaarfixes tester + reviewer) gereviewd en CI groen; wachten op merge. Rolhek-gat (schrijven via Bash) voorgelegd als roadmap-item, antwoord open. Stap 1 (A4 + guard/rolhek) pas na de merges: #260 raakt document-state.mjs en rolhek.mjs.
#258/#259 gemerged; #260 na twee mergeconflicten (dod.md, #261 auth) groen op acdc811. #261 voegde ADR 0052 (accountstatus) + spec toe met verwijzingen naar 0026/0027. Eigenaarakkoord 2026-10-22: 0052 gaat in stap 2 op in 0043 (spec mee omzetten); rolhek-gat als roadmap-item → PR #262.
#260 gemerged. Stap 1 code-PR #264 (branch feat/adr-herschrijven, worktree $TMPDIR/wt-a4): uitslag `herzien`, herzieningsregel `Herzien: JJJJ-MM-DD (#NNN): wat`, verwijderen in besluit-PR, D+A zelfde nummer geweigerd; contract in scratchpad contract-a4.md (sessie 61e3b870). Na merge: besluit-PR met nieuwe 0046 punt 2. Hoofdcheckout: eigenaar moet `git restore .claude` draaien (mislukte checkout liet 10 bestanden oud).
Stand 2026-10-22 middag: #264 gemerged op 2a13847 zonder Codex-fixes; die staan op branch `fix/a4-codex-review` (10732ef, gepusht, nog geen PR, laatste delta nog reviewen). Main kreeg ADR 0053 (archief/ i.p.v. verwijderen), 0054, 0055 — eerst afstemmen met eigenaar. Volledige overdracht: /tmp/claude-1000/overdracht-adr.md, contract /tmp/claude-1000/contract-a4.md.

**Why:** 0038 maakt de merge tot acceptatie; consolidatie was de aanleiding daarvoor.
**How to apply:** werk vanaf branch `docs/adr-consolidatie`; statusregels kaal; herkomstregel per besluit ("was 0029 punt 9"); link nooit naar een nieuw nummer dat nog niet op main staat. Zie [[sandbox-overlays-schone-worktree]].
