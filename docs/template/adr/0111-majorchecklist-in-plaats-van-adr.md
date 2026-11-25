# 0111 — Een toolchain-major gaat via de majorchecklist; een ADR alleen als er meer verandert dan het versienummer

Status: voorgesteld

Een ADR omdat het een regel lichter maakt (A3): R-PROV-04 vroeg voor elke major van Node, pnpm of TypeScript een ADR.
Wijzigt [0039](0039-stack-provider-neutraal-en-toolchain.md) punten 5, 6 en 7 en de gevolgregel "Een andere major-versie
van Node, pnpm of TypeScript vraagt een nieuw ADR". Opdracht van de eigenaar (24-11-2026, plan "toolchain bijwerken en
bijhouden", PR 2). Voorstel van de hoofdsessie; de merge door de eigenaar is het besluit.

## Context

ADR 0039 legde de majors vast als tekst: "Node 26", "pnpm 11", "TypeScript 6.0". Daardoor vroeg elke major een ADR, ook als
alleen het versienummer veranderde. En elke versie stond op drie plekken: `mise.toml` of `package.json`, ADR 0039 en
`AGENTS.md`. Die liepen uit elkaar. Bij pnpm 12 (ADR 0110, PR #984) bleek wat een major echt vraagt: de changelog lezen, de volle CI
plus `gate:slow`, de cloud-setup en `app:init`, de versie overal gelijk, en weten hoe je terugdraait. Dat is een vaste lijst.
Een ADR voegt pas iets toe als er een keuze is: andere werkwijze, configuratie of code.

## Besluit

1. **Beleid: hoogste binnen de vertrouwde major.**

   | Tool | Regel |
   |---|---|
   | Node | Nieuwste patch van de huidige LTS-lijn. De volgende major pas als die LTS is. |
   | pnpm | Nieuwste versie van de huidige major die minstens 7 dagen oud is (`minimumReleaseAge`). |
   | TypeScript | Nieuwste versie binnen de `peerDependencies` van de gepinde typescript-eslint. |

2. **Een major gaat via de majorchecklist** in de PR-beschrijving. De checklist staat op één plek:
   `.github/pull_request_template.md`, sectie "Majorchecklist".
3. **Een ADR alleen als werkwijze, configuratie of code verandert**, niet voor alleen het versienummer.
4. **De bron van de versie** is `mise.toml` (Node) en `package.json` (pnpm in `packageManager`, TypeScript). Regels en
   ADR's noemen geen versie: ADR 0039 punten 5–7 en `AGENTS.md` verwijzen naar die bestanden. Afgeleide pins (de
   Node-images in de Dockerfile en `compose.yaml`) blijven gelijk aan de bron; checklistpunt 4 en
   `test/scripts/dockerfile.test.ts` bewaken dat.
5. Ongewijzigd: geen Corepack, `package.json` is de enige bron voor de pnpm-versie, Renovate verbergt geen major maar opent
   hem als eigen PR met label `major`, en Postgres 18 pas als alle beoogde providers het bieden. Een Postgres-major valt
   niet onder de checklist en vraagt nog een ADR ([0042](0042-database-en-datapad.md)).

## Alternatieven

- **Een ADR per major houden:** veel tekst voor een versienummer, en drie plekken die uit elkaar lopen.
- **De checklist in de skill `opleveren`:** die leest alleen Claude Code; het PR-sjabloon ziet elke runtime en de eigenaar.
- **Geen checklist, alleen CI:** CI dekt de cloud-setup en de changelog niet.

## Gevolgen

- `docs/framework.md` R-PROV-04 krijgt de nieuwe tekst en verwijst naar de checklist.
- `AGENTS.md` noemt geen versies meer.
- In `renovate.json` verwijzen de beschrijvingen naar de checklist in plaats van "mergen pas na een ADR".
- Wat de checklist niet afdwingt (punt 2) is een afspraak. Achterstand en een klaarstaande volgende major bewaakt
  `pnpm check:toolchain` (plan PR 4).
- Klaar als: R-PROV-04, ADR 0039 (via deze ADR) en `AGENTS.md` geen vaste versie meer noemen en de checklist op één plek
  staat.
