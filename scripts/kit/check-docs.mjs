// check-docs (framework §10, ADR 0045), via de ratchet (scripts/kit/ratchet.mjs): proza mag niet wijzen naar iets dat
// niet bestaat, en de gespiegelde lijsten mogen niet uit elkaar lopen.
//  1. Elk pad en elk `pnpm <script>` tussen backticks in AGENTS.md, CLAUDE.md en .claude/**/*.md bestaat
//     (een kale naam of relatief pad telt als een bestand in git erop eindigt; `/route` is een URL, geen pad).
//  2. Relatieve links in docs/**/*.md en README.md wijzen naar een bestaand bestand.
//  3. ADR- en spec-statussen komen uit de vaste woordenlijst; een goedgekeurde of gebouwde spec heeft "Hergebruik en UX".
//     Een ADR-nummer is uniek per map en staat in de kop (`:adr-kop`). Regel 2, 3, 6 en 7 gelden gelijk in docs/adr/,
//     docs/specs/, docs/template/adr/ en docs/template/specs/ (ADR 0089 punt 4 en 6, templateregime/AC-9).
//  4. De padtabel `paden` in .claude/gates.json (ADR 0079, spec padtabel Werking 6): samenhang (altijdVragen ⇒ besluit-pr,
//     schrijven ≥ gate ⇒ niet agent), geen onbekende kolom of waarde, geen `{}`, dubbele of `!`-sleutel, en de vloer (VLOER);
//     de oude vorm is rood. CODEOWNERS is gelijk aan de afleiding uit de padtabel voor de eerste handle uit `goedkeurders`
//     (ADR 0089, scripts/kit/codeowners.mjs; sleutel `docs:spiegel:codeowners`), de Edit-regels in `ask` van
//     .claude/settings.json zijn precies de afgeleide `altijdVragen` (ADR 0045 punt 9). `onderhoud` heeft de vorm { repository }.
//     `template` is verplicht met dezelfde vorm, en `onderhoud.repository` is gelijk aan `template.repository` (spec template-repo).
//     Het app-bestand `.claude/gates.app.json` (spec app-padtabel), alleen als het getrackt is: vorm (`$comment` en `paden`),
//     dezelfde rijregels, geen altijdVragen, geen besluit agent, geen glob uit gates.json en niet in de template zelf
//     (sleutel `docs:gates-app:<…>`); de spiegels en check 5 draaien op het samengevoegde object (`samengevoegd`).
//  5. `schrijfrecht` van een rol overlapt niet met de afgeleide gates (WS-02), op de uitzonderingen in SCHRIJFRECHT_VRIJ na.
//  6. Elk AC-id van een gebouwde spec (`status: gebouwd`, met of zonder commentaar erachter; ADR 0095) heeft een testbestand
//     met `<namespace>/AC-n` of `<specnaam>/AC-n` als heel woord; een los `AC-n` telt niet (sleutel `docs:ac:<spec>:<AC-n>`).
//     Overgeslagen: een AC met `(nog niet gebouwd)` achter het id, en een AC die direct na het streepje begint met
//     `Vervallen door ADR <nummer>` als dat ADR in de ADR-map naast de specmap staat en `geaccepteerd` is.
//  7. Spec-discipline: geen lijstitem met `⚠ open` in "Open vragen" bij goedgekeurd of gebouwd (`:open-vraag`); elk pad in
//     "Kopieer de vorm van" bestaat bij voorstel of goedgekeurd (`:vorm`).
//  8. `framework §N` buiten §1–§12, §11a en de `## <n>.`-koppen van het regelboek (niet in de ADR-mappen); 9. backtick-paden in
//     het regelboek; 10. R-id's in .claude/rules/* en het regelboek; 11. harde grenzen alleen op `AGENTS.md` (9 KB, 100
//     regels) en `CLAUDE.md` (50 regels), sleutels `docs:AGENTS.md:budget:<bytes>` en `docs:<bestand>:regels:<n>`, zodat
//     de ratchet groei en krimp ziet (ADR 0065, scripts/kit/leesbudget.mjs). Hoofdstuk, regelboek, spec en ADR zijn een
//     meting in `pnpm leespad`, nooit een overtreding. `docsMeldingen` geeft "let op" vanaf 85 % van een grens;
//     `docsKrimp` de krimpcheck (AC-6), die de ratchet buiten de baseline houdt.
//  12. Geen normwoord onder "Hoe (geen norm)" in .claude/rules/*.md (leerpunt #393, sleutel `docs:<bestand>:hoe-norm:<woord>`).
//  13. `docs/app.md` (spec app-agentregels, sleutel `docs:app-md:<…>`): in de template byte-gelijk aan `APP_STUB` uit
//     scripts/kit/app-init.mjs (een app herschrijft het bestand, dus de template wijzigt het niet), en overal getrackt als
//     `CLAUDE.md` de regel `@docs/app.md` heeft.
//  14. Een gebouwde spec noemt tussen backticks geen repopad (src/, scripts/, rails/, test/, e2e/, db/, deploy/, .claude/,
//     .github/, met extensie) dat niet bestaat, tenzij gevolgd door `(vervallen)`, `(nieuw)` of `(voorbeeld)` na witruimte
//     met hooguit één regeleinde (ADR 0095), of in een nieuwe AC met `(nog niet gebouwd)` achter het id (leerpunt #738, sleutel `docs:<spec>:dood-pad:<pad>`);
//     behalve het optionele app-bestand `.claude/gates.app.json` (spec app-padtabel).
//  15. Elk changelogfragment in docs/template-changelog.d/ (spec template-release AC-1, sleutel
//     `docs:changelog-fragment:<bestand>`): naam, front matter met één `soort`, minstens één lijstitem en als enige kop
//     `### Bij een update` met een lijstitem eronder (`fragmentFout` in scripts/kit/template-release.mjs). In template en
//     app; `README.md` in de map is geen fragment.
//  16. Geen document met status `vervallen` of `vervangen door NNNN` in docs/template/specs/ of docs/template/adr/
//     (R-CI-06, spec vervallen-documenten-weg AC-6, sleutel `docs:<pad>:vervallen-in-template`); niet in docs/specs/ of docs/adr/.
//  17. Geen gewijzigd changelogfragment dat al op de merge-base met origin/main staat (leerpunt #877, sleutel
//     `docs:fragment-behoud:<bestand>`); in `docsKrimp`, dus strikt en nooit in de baseline.
//  18. Een melding, nooit een overtreding (gebouwd-zonder-nummer/AC-15, leerpunt #756): een testregel die tegenover de
//     merge-base met origin/main is toegevoegd (of in een niet-getrackt testbestand staat) en een AC-id noemt van een spec
//     die nog `goedgekeurd` is, of van een AC die in een gebouwde spec nog `(nog niet gebouwd)` draagt; één regel per spec
//     en testbestand in `docsMeldingen` (scripts/kit/vergeten-gebouwd.mjs).
//  19. Geen gewijzigde of verdwenen uitgebrachte sectie `## [x.y.z]` van docs/template-changelog.md tegenover de merge-base
//     met origin/main (leerpunt #837, sleutel `docs:changelog-behoud:<versie>`); in `docsKrimp`, dus strikt en nooit in de
//     baseline. Een nieuwe sectie toevoegen (`template:release`) mag.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  afgeleid,
  APP_BESTAND,
  OUDE_VORM_ZONDER_PADEN,
  padenVan,
  rijFouten,
  SCHRIJVEN,
  samengevoegd,
  VLOER,
} from '../../rails/hooks/lib/padtabel.mjs';
import { onderhoudVan, templateVan } from '../../rails/hooks/lib/rolhek.mjs';
import { acIds } from '../../rails/hooks/lib/document-state.mjs';
import { ADR_MAPPEN, adrKopViolations, adrNumber, duplicateAdrNumbers, invalidAdrNames } from './adr-numbers.mjs';
import { APP_STUB } from './app-init.mjs';
import { CODEOWNERS, codeownersTekst, eersteGoedkeurder, HERSTEL } from './codeowners.mjs';
import { grensMeldingen, grensViolations, normenMeldingenUitGit, normenUitGit, zonderBasis } from './leesbudget.mjs';
import { CHANGELOG, FRAGMENT_MAP, fragmentFout, releaseTeksten } from './template-release.mjs';
import { CODESPAN, HEK, sluitHek } from './markdown.mjs';
import { zonderPromptViolations } from './zonder-prompt.mjs';
import { receptRolhekViolations } from './recept-rolhek.mjs';

export { normViolations } from './normen.mjs';

/** @typedef {{ key: string, message: string }} Violation */

const ADR_STATUS = /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m;
export const SPEC_STATUS = /^status:\s*(voorstel|goedgekeurd|gebouwd|vervallen)\b/m;
// Pakketbeheer-commando's van pnpm zelf, geen scripts uit package.json.
const PNPM_COMMANDS = new Set(['add', 'install', 'i', 'update', 'up', 'remove', 'rm', 'exec', 'dlx', 'run', 'why']);

/** @param {string} root */
function trackedFiles(root) {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

/**
 * @param {string} root
 * @returns {Promise<Violation[]>}
 */
export async function docsViolations(root = '.') {
  const files = trackedFiles(root);
  /** @param {string} file */
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  // Spec app-padtabel: alleen een getrackt app-bestand telt.
  const app = files.includes(APP_BESTAND) ? read(APP_BESTAND) : null;
  return Promise.resolve([
    ...identifierViolations(files, read),
    ...linkViolations(root, files, read),
    ...statusViolations(files, read),
    ...vervallenInTemplateViolations(files, read),
    ...statusvormViolations(files, read),
    ...acViolations(files, read),
    ...mirrorViolations(files, read, app),
    ...(files.includes('.claude/gates.json') ? padenViolations(read('.claude/gates.json')) : []),
    ...(files.includes('.claude/gates.json') ? appViolations(read('.claude/gates.json'), app) : []),
    ...(files.includes('.claude/gates.json') ? schrijfrechtViolations(read('.claude/gates.json'), app) : []),
    ...(files.includes('.claude/gates.json') ? werkmapNegeerViolations(files, read('.claude/gates.json')) : []),
    ...(files.includes('.claude/gates.json') ? mergeModusViolations(read('.claude/gates.json')) : []),
    ...paragraafViolations(files, read),
    ...(files.includes(REGELBOEK) ? regelboekPadViolations(root, read(REGELBOEK), files) : []),
    ...rIdViolations(files, read),
    ...hoeNormViolations(files, read),
    ...appMdViolations(files, read),
    ...fragmentViolations(files, read),
    ...grensViolations((file) => (files.includes(file) ? read(file) : null)),
    ...zonderPromptViolations(files, read),
    ...receptRolhekViolations(files, read),
  ]);
}

/**
 * Meldingen vanaf 85 % van een harde grens (leesbudget/AC-2); nooit een overtreding.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function docsMeldingen(root = '.') {
  const files = trackedFiles(root);
  const grens = grensMeldingen((file) => (files.includes(file) ? readFileSync(path.join(root, file), 'utf8') : null));
  // Dynamisch: vergeten-gebouwd.mjs importeert zelf uit dit bestand (regel 18), zo ontstaat geen importcyclus bij het laden.
  const { vergetenGebouwdMeldingen } = await import('./vergeten-gebouwd.mjs');
  return [
    ...grens,
    ...zonderBasis(root, false).meldingen,
    ...normenMeldingenUitGit(root),
    ...vergetenGebouwdMeldingen(root),
  ];
}

/**
 * De krimpcontrole op normen tegenover `git merge-base origin/main HEAD` (spec krimp-op-normen) en het behoud van
 * changelogfragmenten die al op die basis staan (regel 17, leerpunt #877) en van de uitgebrachte changelogsecties
 * (regel 19, leerpunt #837); nooit in de baseline.
 * Zonder basis is ze in CI rood (AC-5).
 * @param {string} root
 * @returns {Promise<Violation[]>}
 */
export async function docsKrimp(root = '.') {
  return Promise.resolve([
    ...zonderBasis(root, process.env['GITHUB_ACTIONS'] === 'true').violations,
    ...normenUitGit(root),
    ...fragmentBehoud(root),
    ...changelogBehoud(root),
  ]);
}

/**
 * De merge-base met origin/main, of `null` zonder basis (regel 17 en 19).
 * @param {string} root
 * @returns {string | null}
 */
function mergeBasis(root) {
  const basis = spawnSync('git', ['merge-base', 'refs/remotes/origin/main', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sha = basis.stdout.trim();
  return basis.status === 0 && sha !== '' ? sha : null;
}

/**
 * Regel 19 (leerpunt #837): een uitgebrachte sectie van docs/template-changelog.md die op de merge-base met origin/main
 * staat, wijzigt niet en verdwijnt niet (ook ongecommit in de werkmap). `template:release` neemt alleen fragmenten mee,
 * dus een regel in een uitgebrachte sectie viel buiten elke release. Een nieuwe sectie toevoegen mag; zonder merge-base
 * of zonder het bestand op de basis toetst dit niets.
 * @param {string} root
 * @returns {Violation[]}
 */
function changelogBehoud(root) {
  const basis = mergeBasis(root);
  if (basis === null) return [];
  const oud = spawnSync('git', ['show', `${basis}:${CHANGELOG}`], { cwd: root, encoding: 'utf8' });
  if (oud.status !== 0) return [];
  const pad = path.join(root, CHANGELOG);
  const nu = releaseTeksten(existsSync(pad) ? readFileSync(pad, 'utf8') : '');
  return [...releaseTeksten(oud.stdout)]
    .filter(([versie, sectie]) => nu.get(versie) !== sectie)
    .map(([versie]) => ({
      key: `docs:changelog-behoud:${versie}`,
      message: `${CHANGELOG}: de uitgebrachte sectie [${versie}] is gewijzigd of verdwenen; zet haar terug en zet de wijziging als fragment in ${FRAGMENT_MAP}/`,
    }));
}

/**
 * Regel 17 (leerpunt #877): een changelogfragment dat al op de merge-base met origin/main staat, is nog niet uitgebracht
 * en mag niet wijzigen (status M, ook ongecommit in de werkmap). Een PR op een hergebruikte branchnaam overschreef zo stil
 * het item van een eerdere PR. Verwijderen mag (`template:release`), toevoegen ook; zonder merge-base toetst dit niets.
 * @param {string} root
 * @returns {Violation[]}
 */
function fragmentBehoud(root) {
  const basis = mergeBasis(root);
  if (basis === null) return [];
  const diff = spawnSync('git', ['diff', '--name-status', '--no-renames', '-z', basis, '--', `${FRAGMENT_MAP}/`], {
    cwd: root,
    encoding: 'utf8',
  });
  const velden = diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : [];
  /** @type {Violation[]} */
  const violations = [];
  for (let i = 0; i + 1 < velden.length; i += 2) {
    const [status, pad] = [velden[i], velden[i + 1] ?? ''];
    const naam = path.posix.basename(pad);
    if (status !== 'M' || naam === 'README.md') continue;
    violations.push({
      key: `docs:fragment-behoud:${naam}`,
      message: `${pad} staat al op main en is nog niet uitgebracht; zet het terug en voeg een nieuw fragment toe (bv. met achtervoegsel -2)`,
    });
  }
  return violations;
}

/**
 * Regel 15: de vorm van elk changelogfragment; de reden komt uit `fragmentFout`, dezelfde toets als `template:release`.
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function fragmentViolations(files, read) {
  const map = `${FRAGMENT_MAP}/`;
  return files
    .filter((file) => file.startsWith(map) && file !== `${map}README.md`)
    .flatMap((file) => {
      const naam = file.slice(map.length);
      const fout = fragmentFout(naam, read(file));
      return fout === null ? [] : [{ key: `docs:changelog-fragment:${naam}`, message: `${file}: ${fout}` }];
    });
}

const REGELBOEK = 'docs/framework.md';
const ADR_MAP = 'docs/adr/';
const ARCHIEF = 'docs/adr/archief/';
// Regel 3, 6 en 7: specs in docs/specs/ en docs/template/specs/ (framework §10); `_template.md` en dergelijke tellen niet.
export const SPEC_BESTAND = /^docs\/(?:template\/)?specs\/[^_/][^/]*\.md$/;
const SPEC_ARCHIEF = 'docs/specs/archief/';

/** Regelnummer (1-based) van een positie in een tekst. @param {string} text @param {number} index */
function regelVan(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * Regel 8: `framework §N` of `framework.md §N` wijst naar een bestaande paragraaf: de ankers §1–§12 en §11a, of een
 * `## <n>.`-kop van het regelboek (§13, §8a; ADR 0065 punt 3). ADR's (ook het archief) vallen erbuiten: ze wijzigen
 * niet, hun ankers blijven.
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function paragraafViolations(files, read) {
  const koppen = new Set(
    files.includes(REGELBOEK) ? [...read(REGELBOEK).matchAll(/^## (\d+[a-z]?)\./gm)].map(([, n = '']) => n) : [],
  );
  const anker = (/** @type {string} */ n) => n === '11a' || (/^\d+$/.test(n) && Number(n) >= 1 && Number(n) <= 12);
  const geldig = (/** @type {string} */ n) => anker(n) || koppen.has(n);
  return files
    .filter((file) => file.endsWith('.md') && !ADR_MAPPEN.some((map) => file.startsWith(map)))
    .flatMap((file) => {
      const text = read(file);
      const fout = [...text.matchAll(/\bframework(?:\.md)?`?\s?§(\d+[a-z]?)/g)].filter(([, n = '']) => !geldig(n));
      return fout.map((match) => ({
        key: `docs:${file}:paragraaf:§${match[1] ?? ''}`,
        message: `${file}:${String(regelVan(text, match.index))}: framework §${match[1] ?? ''} bestaat niet; het regelboek kent §1–§12, §11a en zijn eigen \`## <n>.\`-koppen (framework §9)`,
      }));
    });
}

/**
 * Een pad in het regelboek heeft een extensie of eindigt op `/`. Zo tellen `origin/main`, `application/json` en een
 * lintregel als `rails/klassen` niet als pad.
 * @param {string} id
 */
function regelboekPad(id) {
  return looksLikePath(id) && /(?:\.\w+|\/)$/.test(id);
}

/**
 * Begint een pad met een getrackte topmap of een getrackt topbestand, met `./` of met een alias (`#core/…`), dan telt alleen
 * een match vanaf de hoofdmap. Een kale naam of relatief pad (`queries.ts`, `features/`) telt als een getrackt bestand erop
 * eindigt, zoals regel 1.
 * @param {string} id @param {readonly string[]} files
 */
function regelboekPadGetrackt(id, files) {
  const pad = id.replace(/^\.\//, '');
  const top = pad.split('/')[0] ?? '';
  const vanafRoot =
    id.startsWith('./') || id.startsWith('#') || files.some((file) => file === top || file.startsWith(`${top}/`));
  if (!vanafRoot) return pathExists(pad, files);
  const doel = doelPad(pad);
  return files.some((file) => file === doel || file.startsWith(`${doel}/`));
}

/**
 * Getrackt (of een map met getrackte bestanden), of een runtime-artefact dat git niet trackt: een pad dat `.gitignore`
 * negeert, ook als het niet bestaat (`.claude/hooks/.cache/`), of een pad achter een symlink (`node_modules/.bin` in een
 * kopie met `node_modules` als link). De afsluitende `/` blijft staan: zo matcht een map-regel ook zonder de map.
 * Alleen een getrackte `.gitignore` telt: `.git/info/exclude` en de globale `core.excludesFile` verschillen per machine
 * (leerpunt #390). `-v -z` geeft bron, regel, patroon en pad; een negatie (`!…`) negeert niet.
 * @param {string} root @param {string} id @param {readonly string[]} files
 */
function regelboekPadBestaat(root, id, files) {
  const pad = id.replace(/^\.\//, '');
  if (regelboekPadGetrackt(id, files)) return true;
  const { status, stdout, stderr } = spawnSync('git', ['check-ignore', '-v', '-z', '--stdin', '--no-index'], {
    cwd: root,
    input: `${pad}\0`,
    encoding: 'utf8',
    // Git vertaalt zijn meldingen; de C-locale houdt "beyond a symbolic link" taalonafhankelijk.
    env: { ...process.env, LC_ALL: 'C' },
  });
  if (status === 128) return stderr.includes('beyond a symbolic link');
  const [bron = '', , patroon = ''] = stdout.split('\0');
  return status === 0 && path.basename(bron) === '.gitignore' && files.includes(bron) && !patroon.startsWith('!');
}

/**
 * Regel 9: elk backtick-pad in het regelboek bestaat, of staat direct gevolgd door `(nog niet gebouwd)`; die markering bij
 * een bestaand pad is ook een fout.
 * @param {string} root @param {string} text @param {readonly string[]} files @returns {Violation[]}
 */
function regelboekPadViolations(root, text, files) {
  return [...text.matchAll(/`([^`\n]+)`( \(nog niet gebouwd\))?/g)].flatMap((match) => {
    const [, id = '', markering] = match;
    if (!regelboekPad(id)) return [];
    const bestaat = regelboekPadBestaat(root, id, files);
    if (bestaat === (markering === undefined)) return [];
    const plek = `${REGELBOEK}:${String(regelVan(text, match.index))}`;
    return bestaat
      ? [
          {
            key: `docs:${REGELBOEK}:markering:${id}`,
            message: `${plek}: \`${id}\` bestaat, haal "(nog niet gebouwd)" weg (framework §9)`,
          },
        ]
      : [
          {
            key: `docs:${REGELBOEK}:pad:${id}`,
            message: `${plek}: \`${id}\` bestaat niet; zet er "(nog niet gebouwd)" direct achter (framework §9)`,
          },
        ];
  });
}

const R_ID = /\bR-[A-Z]+-\d+(?![\d-])/g;

/**
 * Regel 10: een R-id in `.claude/rules/*` staat letterlijk in het regelboek, en het regelboek definieert elk R-id één keer
 * (een definitie begint de regel, eventueel na een opsommingsteken). De krimpcontrole (`normen.mjs`, krimp-op-normen/AC-1)
 * toetst dubbele definities in het vaste patroon ook, buiten de baseline.
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function rIdViolations(files, read) {
  const boek = files.includes(REGELBOEK) ? read(REGELBOEK) : '';
  const bekend = new Set([...boek.matchAll(R_ID)].map(([id]) => id));
  const padregels = files
    .filter((file) => file.startsWith('.claude/rules/'))
    .flatMap((file) =>
      [...new Set([...read(file).matchAll(R_ID)].map(([id]) => id))]
        .filter((id) => !bekend.has(id))
        .map((id) => ({ key: `docs:${file}:r-id:${id}`, message: `${file}: ${id} staat niet in ${REGELBOEK}` })),
    );
  const definities = [...boek.matchAll(/^\s*(?:[-*]\s+)?(?:\*\*)?(R-[A-Z]+-\d+[a-z]?)(?![\w-])/gm)].map(
    ([, id = '']) => id,
  );
  const dubbel = [...new Set(definities.filter((id, index) => definities.indexOf(id) !== index))];
  return [
    ...padregels,
    ...dubbel.map((id) => ({
      key: `docs:${REGELBOEK}:r-id-dubbel:${id}`,
      message: `${REGELBOEK}: ${id} staat er meer dan één keer`,
    })),
  ];
}

// Regel 12: woorden die een norm maken, als heel woord; Nederlands en Engels, elk met zijn vervoegingen (#402: een te
// smalle regex blijft stil groen, daarom pint test/rails/check-docs-hoe-norm.test.ts elke vorm). Bewust erbuiten:
// woorden die ook beschrijven ("dient als", "vereist", "eist", "dwingt af"): Hoe-tekst mag zeggen wat een check doet.
// Een woordgroep mag over één regelafbreking lopen, niet over een witregel.
const WIT = '(?:[ \\t]+|[ \\t]*\\n[ \\t]*)';
const NORMWOORD = new RegExp(
  `\\b(?:nooit|never|alleen|uitsluitend|only|altijd|always|moet(?:en)?|must|should|shall|verboden|forbidden|mag${WIT}niet|mogen${WIT}niet|verplicht(?:e|en)?|mandatory)\\b`,
  'gi',
);
// De kop kaal, als Markdown-kop of vet, met of zonder dubbele punt; tekst erachter hoort bij de sectie.
const HOE_KOP = /^(?:#{1,6}\s+)?(?:\*\*)?Hoe \(geen norm\)(?:\*\*)?:?(?:\*\*)?(.*)$/;

/**
 * De secties onder "Hoe (geen norm)" tot de volgende Markdown-kop. Regels in een codeblok worden leeg (een
 * `# commentaar` daarin is geen kop), zodat regelnummers kloppen. @param {string} text
 */
function hoeSecties(text) {
  /** @type {{ regels: string[], start: number }[]} */
  const secties = [];
  /** @type {{ regels: string[], start: number } | undefined} */
  let sectie;
  let hek = '';
  text.split('\n').forEach((line, index) => {
    const inCode = hek !== '' || HEK.test(line);
    if (hek !== '') hek = sluitHek(line, hek) ? '' : hek;
    else hek = HEK.exec(line)?.[1] ?? '';
    const kop = inCode ? null : HOE_KOP.exec(line);
    if (kop !== null) secties.push((sectie = { regels: [kop[1] ?? ''], start: index }));
    else if (!inCode && /^#{1,6}\s/.test(line)) sectie = undefined;
    else sectie?.regels.push(inCode ? '' : line);
  });
  return secties;
}

/**
 * Regel 12 (leerpunt #393): onder "Hoe (geen norm)" in `.claude/rules/*.md` staat geen normwoord. Zo'n sectie noemt
 * zichzelf niet-bindend, dus een norm daar valt buiten het regelboek (R-DOC-03) en buiten de R-id-controles (regel 10,
 * krimp-op-normen). Codespans tellen niet (`--only` is een optie).
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function hoeNormViolations(files, read) {
  return files
    .filter((file) => file.startsWith('.claude/rules/') && file.endsWith('.md'))
    .flatMap((file) =>
      hoeSecties(read(file)).flatMap(({ regels, start }) => {
        const tekst = regels.join('\n').replace(CODESPAN, (span) => span.replace(/[^\n]/g, ' '));
        return [...tekst.matchAll(NORMWOORD)].map(({ 0: woord, index }) => ({
          key: `docs:${file}:hoe-norm:${woord.toLowerCase().replace(/\s+/g, '-')}`,
          message: `${file}:${String(start + 1 + tekst.slice(0, index).split('\n').length - 1)}: "${woord.replace(/\s+/g, ' ')}" onder "Hoe (geen norm)" is een norm zonder R-id; zet hem als regel met R-id in ${REGELBOEK} en boven "Hoe" (R-DOC-03), of beschrijf zonder normwoord`,
        }));
      }),
    );
}

const APP_MD = 'docs/app.md';
const APP_MD_STUB =
  'wijkt af van de stub; de template wijzigt dit bestand niet (een app herschrijft het, spec app-agentregels)';
const APP_MD_ONTBREEKT = 'ontbreekt; CLAUDE.md importeert het';

/** Heeft de tekst buiten een codeblok een regel die alleen `@docs/app.md` is (een import van Claude Code)? @param {string} text */
function importeertAppMd(text) {
  let hek = '';
  return text.split('\n').some((line) => {
    const inCode = hek !== '' || HEK.test(line);
    if (hek !== '') hek = sluitHek(line, hek) ? '' : hek;
    else hek = HEK.exec(line)?.[1] ?? '';
    return !inCode && line.trim() === `@${APP_MD}`;
  });
}

/**
 * Regel 13 (spec app-agentregels): `docs/app.md` is in de template (`onderhoud.repository` in gates.json) byte-gelijk aan
 * `APP_STUB`; een app herschrijft het bestand met `app:init`, dus een templatewijziging gaf in elke app een conflict. Overal:
 * importeert `CLAUDE.md` het bestand, dan is het getrackt. Sleutel `docs:app-md:<…>`.
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function appMdViolations(files, read) {
  /** @param {string} melding @returns {Violation} */
  const fout = (melding) => ({ key: `docs:app-md:${melding}`, message: `${APP_MD}: ${melding}` });
  if (!files.includes(APP_MD))
    return files.includes('CLAUDE.md') && importeertAppMd(read('CLAUDE.md')) ? [fout(APP_MD_ONTBREEKT)] : [];
  const inTemplate =
    files.includes('.claude/gates.json') &&
    veld(veld(JSON.parse(read('.claude/gates.json')), 'onderhoud'), 'repository') !== undefined;
  return inTemplate && read(APP_MD) !== APP_STUB ? [fout(APP_MD_STUB)] : [];
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function identifierViolations(files, read) {
  const scripts = Object.keys(packageScripts(read('package.json')));
  const sources = [
    'AGENTS.md',
    'CLAUDE.md',
    ...files.filter((file) => file.startsWith('.claude/') && file.endsWith('.md')),
  ];
  return sources
    .filter((file) => files.includes(file))
    .flatMap((file) =>
      [...read(file).matchAll(/`([^`\n]+)`/g)].flatMap(([, id = '']) => {
        const script = /^pnpm ([\w:-]+)/.exec(id)?.[1];
        if (script !== undefined && !PNPM_COMMANDS.has(script) && !scripts.includes(script))
          return [
            {
              key: `docs:${file}:script:${script}`,
              message: `${file}: \`pnpm ${script}\` bestaat niet in package.json`,
            },
          ];
        if (!looksLikePath(id) || pathExists(id, files)) return [];
        return [{ key: `docs:${file}:pad:${id}`, message: `${file}: \`${id}\` bestaat niet in de repo` }];
      }),
    );
}

/** @param {string} text */
export function packageScripts(text) {
  /** @type {unknown} */
  const pkg = JSON.parse(text);
  if (
    typeof pkg !== 'object' ||
    pkg === null ||
    !('scripts' in pkg) ||
    typeof pkg.scripts !== 'object' ||
    pkg.scripts === null
  )
    return {};
  return { ...pkg.scripts };
}

/** @param {string} id */
export function looksLikePath(id) {
  if (id.startsWith('/') || /[*<>{}…\s]/.test(id)) return false;
  return /^[\w.#-]*\/[\w.\-/]*$/.test(id) || /^[\w.-]+\.(md|ts|tsx|mjs|js|json|yaml|yml|sql|sh|css|toml)$/.test(id);
}

/**
 * Het pad waarnaar een verwijzing wijst: aliasstap (`#core/…` naar `src/core/…`) en de afsluitende `/` weg.
 * @param {string} id
 */
export function doelPad(id) {
  return id
    .replace(/^#(core|web|shared|api)\//, 'src/$1/')
    .replace(/^#core\//, 'src/core/')
    .replace(/\/$/, '');
}

/**
 * @param {string} id
 * @param {readonly string[]} files
 */
export function pathExists(id, files) {
  const target = doelPad(id);
  return files.some(
    (file) =>
      file === target || file.endsWith(`/${target}`) || file.startsWith(`${target}/`) || file.includes(`/${target}/`),
  );
}

/**
 * @param {string} root
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function linkViolations(root, files, read) {
  return files
    .filter((file) => (file.startsWith('docs/') || file === 'README.md') && file.endsWith('.md'))
    .flatMap((file) =>
      [...read(file).matchAll(/\]\(([^)\s]+)\)/g)].flatMap(([, link = '']) => {
        if (/^(https?:|mailto:|#)/.test(link)) return [];
        const doel = decodeURIComponent(link.split('#')[0] ?? '');
        if (linkDoelen(file, doel).some((target) => existsSync(path.join(root, target)))) return [];
        return [{ key: `docs:${file}:link:${link}`, message: `${file}: link naar ${link} wijst naar niets` }];
      }),
    );
}

/**
 * Waar een relatieve link mag landen. Binnen `docs/adr/` en `archief/` (framework §10) leest een link uit het archief alsof
 * het bestand nog in `docs/adr/` stond, en een ADR-doel in `docs/adr/` lost ook op naar `archief/`. Een spec met een
 * eigenaarstatus mag niet van inhoud wijzigen, dus ook vanuit een spec lost een ADR-doel op naar `archief/`. Zo ook het
 * specarchief (ADR 0080): een link uit `docs/specs/archief/` leest alsof in `docs/specs/`, en een doel `docs/specs/<naam>.md`
 * lost vanuit `docs/adr/**` en `docs/specs/**` ook op naar `docs/specs/archief/`. Elders geldt alleen het letterlijke pad: die
 * links gaan mee naar het nieuwe pad (ADR 0053 punt 4). `docs/template/adr/` en `docs/template/specs/` hebben geen archief
 * (ADR 0089 punt 1): daar geldt het letterlijke pad.
 * @param {string} file @param {string} doel
 */
function linkDoelen(file, doel) {
  const alsSpec = file.startsWith(SPEC_ARCHIEF) ? `docs/specs/${path.posix.basename(file)}` : file;
  const doelen = [
    ...(alsSpec === file ? [] : [path.posix.join(path.posix.dirname(file), doel)]),
    ...adrLinkDoelen(alsSpec, doel),
  ];
  if (!/^docs\/(?:adr|specs)\//.test(file)) return doelen;
  return doelen.flatMap((pad) =>
    /^docs\/specs\/[^/]+\.md$/.test(pad) ? [pad, pad.replace('docs/specs/', SPEC_ARCHIEF)] : [pad],
  );
}

/** De doelen voor het ADR-archief (ADR 0053 punt 4). @param {string} file @param {string} doel */
function adrLinkDoelen(file, doel) {
  const letterlijk = path.posix.join(path.posix.dirname(file), doel);
  if (SPEC_BESTAND.test(file) && /^docs\/adr\/\d{4}-[^/]+\.md$/.test(letterlijk))
    return [letterlijk, letterlijk.replace(ADR_MAP, ARCHIEF)];
  if (path.posix.dirname(file) !== 'docs/adr' && path.posix.dirname(file) !== 'docs/adr/archief') return [letterlijk];
  const alsActief = path.posix.join(ADR_MAP, doel);
  return [
    letterlijk,
    alsActief,
    ...[letterlijk, alsActief].flatMap((pad) =>
      /^docs\/adr\/\d{4}-[^/]+\.md$/.test(pad) ? [pad.replace(ADR_MAP, ARCHIEF)] : [],
    ),
  ];
}

/**
 * ADR 0080 en 0095: een statusregel in `docs/specs/` of `docs/template/specs/` heeft geen `; gevalideerd: <sha>` meer; de vorm is
 * `status: gebouwd`, en een bestaand `# #<PR>` is commentaar.
 * @param {readonly string[]} files @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusvormViolations(files, read) {
  const specs = files.filter((file) => /^docs\/(?:template\/)?specs\/[^/]+\.md$/.test(file));
  return specs.flatMap((file) => {
    const sha = /^status: gebouwd # #(\d+); gevalideerd: (\S+)/m.exec(read(file));
    return sha === null
      ? []
      : [
          {
            key: `docs:${file}:gevalideerd`,
            message: `${file}: statusregel met gevalideerd: ${sha[2] ?? ''}; schrijf status: gebouwd # #${sha[1] ?? ''} (ADR 0080)`,
          },
        ];
  });
}

const TEMPLATE_ADR_MAP = 'docs/template/adr/';
const TEMPLATE_SPEC_MAP = 'docs/template/specs/';

/**
 * Regel 16 (R-CI-06, vervallen-documenten-weg/AC-6): in `docs/template/specs/` en `docs/template/adr/` staat geen document met
 * status `vervallen` of `vervangen door NNNN`; git is de historie. `docs/specs/` en `docs/adr/` (een app) vallen erbuiten.
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function vervallenInTemplateViolations(files, read) {
  const adrs = files.filter((file) => file.startsWith(TEMPLATE_ADR_MAP) && adrNumber(file) !== undefined);
  const specs = files.filter((file) => file.startsWith(TEMPLATE_SPEC_MAP) && SPEC_BESTAND.test(file));
  const vervallenAdr = adrs.filter((file) => {
    const status = ADR_STATUS.exec(read(file))?.[1];
    return status === 'vervallen' || status?.startsWith('vervangen door ') === true;
  });
  const vervallenSpec = specs.filter((file) => SPEC_STATUS.exec(read(file))?.[1] === 'vervallen');
  return [...vervallenAdr, ...vervallenSpec].map((file) => ({
    key: `docs:${file}:vervallen-in-template`,
    message: `${file}: een vervallen of vervangen document staat niet in docs/template/ (R-CI-06); verhuis levende AC's naar een levende spec en verwijder het, git is de historie`,
  }));
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusViolations(files, read) {
  const adrs = files.filter((file) => adrNumber(file) !== undefined);
  const specs = files.filter((file) => SPEC_BESTAND.test(file));
  return [
    ...duplicateAdrNumbers(adrs),
    ...invalidAdrNames(files),
    ...adrKopViolations(adrs, read),
    ...adrs
      .filter((file) => !ADR_STATUS.test(read(file)))
      .map((file) => ({
        key: `docs:${file}:status`,
        message: `${file}: status niet uit voorgesteld | geaccepteerd | vervangen door NNNN | vervallen`,
      })),
    ...specs.flatMap((file) => {
      const text = read(file);
      const status = SPEC_STATUS.exec(text)?.[1];
      if (status === undefined)
        return [
          {
            key: `docs:${file}:status`,
            message: `${file}: status niet uit voorstel | goedgekeurd | gebouwd | vervallen`,
          },
        ];
      return [
        ...specVormViolations(file, text, status),
        ...disciplineViolations({ file, text, status }, files),
        ...(status === 'gebouwd' ? doodPadViolations(file, text, files) : []),
      ];
    }),
  ];
}

/**
 * Hergebruik en UX bij goedgekeurd of gebouwd; zonder die sectie wordt het sjabloon niet getoetst.
 * @param {string} file @param {string} text @param {string} status
 * @returns {Violation[]}
 */
function specVormViolations(file, text, status) {
  const reuse = /^## Hergebruik en UX\n+(?!##)\S/m.test(text);
  if ((status === 'goedgekeurd' || status === 'gebouwd') && !reuse)
    return [
      {
        key: `docs:${file}:hergebruik`,
        message: `${file}: ${status}, maar de sectie "Hergebruik en UX" ontbreekt of is leeg`,
      },
    ];
  return sjabloonViolations(file, text);
}

// Fenced codeblokken worden niet apart behandeld: een `## ` in een codeblok sluit de sectie ook af.
/** De tekst onder `## <kop>…` tot de volgende `## `-kop, of undefined. @param {string} text @param {string} kop */
function sectie(text, kop) {
  const start = new RegExp(`^## ${kop}\\b[^\\n]*$`, 'm').exec(text);
  if (start === null) return undefined;
  const rest = text.slice(start.index + start[0].length);
  const einde = /^## /m.exec(rest);
  return einde === null ? rest : rest.slice(0, einde.index);
}

/**
 * Spec-discipline: `⚠ open` (een vraag zonder aanbeveling) blokkeert goedgekeurd en gebouwd; elk pad in
 * "Kopieer de vorm van" bestaat zolang er nog gebouwd moet worden (voorstel, goedgekeurd).
 * @param {{ file: string, text: string, status: string }} spec @param {readonly string[]} files
 * @returns {Violation[]}
 */
function disciplineViolations({ file, text, status }, files) {
  const open = sectie(text, 'Open vragen') ?? '';
  const vorm = sectie(text, 'Kopieer de vorm van') ?? '';
  const ontbrekend = [...vorm.matchAll(/`([^`\n]+)`/g)]
    .map((match) => (match[1] ?? '').replace(/:\d+(-\d+)?$/, ''))
    .filter(
      (id) => looksLikePath(id) && !files.some((file) => file === doelPad(id) || file.startsWith(`${doelPad(id)}/`)),
    );
  return [
    // Ook `⚠️` (met U+FE0F), hoofdletters en een regel zonder opsommingsteken tellen als open vraag.
    ...((status === 'goedgekeurd' || status === 'gebouwd') && /⚠️?\s*open\b/i.test(open)
      ? [{ key: `docs:${file}:open-vraag`, message: `${file}: ${status}, maar "Open vragen" bevat nog "⚠ open"` }]
      : []),
    ...((status === 'voorstel' || status === 'goedgekeurd') && ontbrekend.length > 0
      ? [
          {
            key: `docs:${file}:vorm`,
            message: `${file}: "Kopieer de vorm van" noemt niet-bestaande paden: ${ontbrekend.join(', ')}`,
          },
        ]
      : []),
  ];
}

// Regel 14: een volledig repopad onder een codemap, met extensie en zonder glob of placeholder; een regelnummer telt niet mee.
const REPOPAD = /^(?:src|scripts|rails|test|e2e|db|deploy|\.claude|\.github)\/[\w.\-/]*\.[a-z]+$/;

// Een nieuwe AC in een gebouwde spec (R-WERK-07): het lijstitem met `(nog niet gebouwd)` achter het id, met vervolgregels
// en ingesprongen sub-bullets; het item eindigt bij een niet-ingesprongen `-` of `#`, of een lege regel.
const NIEUWE_AC = /^- \*\*[^*\n]*AC-\d+\*\* \(nog niet gebouwd\)[^\n]*(?:\n(?![-#]|[ \t]*$)[^\n]*)*/gm;
// Een pad tussen backticks met het merkteken erachter: spaties of tabs, of één regeleinde met inspringing (`WIT`), geen lege regel.
const PAD_MET_MERKTEKEN = new RegExp(`\`([^\`\\n]+)\`(${WIT}\\((?:vervallen|nieuw|voorbeeld)\\))?`, 'g');

/**
 * Regel 14 (leerpunt #738): een gebouwde spec noemt geen repopad dat niet bestaat, tenzij er `(vervallen)`, `(nieuw)` of
 * `(voorbeeld)` achter staat, na witruimte met hooguit één regeleinde (ADR 0095), of het in een nieuwe AC met
 * `(nog niet gebouwd)` staat (R-WERK-07, R-DOC-10).
 * Eén sleutel per pad, zodat de ratchet bestaande treffers in de baseline houdt.
 * @param {string} file @param {string} text @param {readonly string[]} files
 * @returns {Violation[]}
 */
function doodPadViolations(file, text, files) {
  const bestaand = new Set(files);
  const dood = [...text.replace(NIEUWE_AC, '').matchAll(PAD_MET_MERKTEKEN)]
    .filter((match) => match[2] === undefined)
    .map((match) => (match[1] ?? '').replace(/:\d+(-\d+)?$/, ''))
    // Het app-bestand is optioneel en bestaat alleen in een app met eigen padrijen (spec app-padtabel).
    .filter((pad) => REPOPAD.test(pad) && pad !== APP_BESTAND && !bestaand.has(pad));
  return [...new Set(dood)].map((pad) => ({
    key: `docs:${file}:dood-pad:${pad}`,
    message: `${file}: gebouwde spec noemt \`${pad}\`, dat niet bestaat; zet er "(vervallen)", "(nieuw)" of "(voorbeeld)" direct achter (leerpunt #738)`,
  }));
}

const MINI_KOPPEN = ['Doel', 'Rollen en wie wat ziet', 'Routes en foutcodes', 'Acceptatiecriteria', 'Hergebruik en UX'];

/**
 * ADR 0046 punt 13: `sjabloon: mini` is de marker van de mini-spec (`docs/specs/_mini.md`); die heeft vaste koppen.
 * @param {string} file @param {string} text
 * @returns {Violation[]}
 */
function sjabloonViolations(file, text) {
  const waarde = /^sjabloon:[ \t]*(.*?)\s*$/m.exec(text.split(/^---\s*$/m)[1] ?? '')?.[1];
  if (waarde === undefined) return [];
  const key = `docs:${file}:sjabloon`;
  if (waarde !== 'mini') return [{ key, message: `${file}: sjabloon is "${waarde}"; alleen "mini" bestaat` }];
  const ontbreekt = MINI_KOPPEN.filter((kop) => !new RegExp(`^## ${kop}\\s*$`, 'm').test(text));
  return ontbreekt.length === 0
    ? []
    : [{ key, message: `${file}: mini-spec mist de koppen ${ontbreekt.map((kop) => `"${kop}"`).join(', ')}` }];
}

// Testpaden uit .claude/gates.json (`testpaden`): `*.test.*`, `*.spec.*`, `db/tests/**`, `e2e/**`, `test/**`.
export const TESTBESTAND = /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$|^(?:db\/tests|e2e|test)\//;
// Een AC-id als heel woord, met een optioneel voorvoegsel `<naam>/` (groep 1); groep 2 is het id.
const AC_ID = /(?<![\w/-])(?:([\w.-]+)\/)?(AC-\d+)(?![\w-])/g;

/**
 * Regex die `naam` als heel woord vindt: geen woordteken, `/`, `.` of `-` ervoor (dus niet in `andere/mijn/AC-1` of
 * `x.mijn/AC-1`), geen woordteken of `-` erna. @param {string} naam
 */
export function heelWoord(naam) {
  return new RegExp(`(?<![\\w/.-])${naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
}

/**
 * Is `ac` van deze spec gedekt door de tekst van één testbestand?
 * @param {string} tekst
 * @param {{ naam: string, namespace: string | undefined }} spec
 * @param {string} ac
 */
function dekt(tekst, spec, ac) {
  const namen = [spec.naam, ...(spec.namespace === undefined ? [] : [spec.namespace])];
  return namen.some((naam) => heelWoord(`${naam}/${ac}`).test(tekst));
}

// Een vervallen AC (ADR 0095 punt 6): `- **<ns>/AC-n** — Vervallen door ADR <nummer> … Was: …`, direct na het streepje.
const VERVALLEN_AC = /^- \*\*([a-z0-9][\w.-]*)\/(AC-\d+)\*\* — Vervallen door ADR (\d{4})\b/gm;

/**
 * De eigen AC-id's (`AC-n`) die de AC-dekking overslaat omdat ze vervallen zijn door een ADR dat in de ADR-map naast de specmap
 * staat (`docs/template/adr/` voor `docs/template/specs/`, anders `docs/adr/`) en `geaccepteerd` is (gebouwd-zonder-nummer/AC-5).
 * @param {{ file: string, text: string, eigen: ReadonlySet<string | undefined> }} spec
 * @param {readonly string[]} files @param {(file: string) => string} read
 * @returns {Set<string>}
 */
export function vervallenAcs({ file, text, eigen }, files, read) {
  const map = file.startsWith('docs/template/specs/') ? 'docs/template/adr/' : 'docs/adr/';
  const geaccepteerd = (/** @type {string} */ nummer) =>
    files.some(
      (adr) =>
        adr.startsWith(`${map}${nummer}-`) &&
        !adr.slice(map.length).includes('/') &&
        adr.endsWith('.md') &&
        ADR_STATUS.exec(read(adr))?.[1] === 'geaccepteerd',
    );
  return new Set(
    [...text.replaceAll('\r\n', '\n').matchAll(VERVALLEN_AC)]
      .filter(([, naam, , nummer = '']) => eigen.has(naam) && geaccepteerd(nummer))
      .map(([, , id = '']) => id),
  );
}

/**
 * Regel 6: AC-traceerbaarheid van gebouwde specs naar testbestanden.
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function acViolations(files, read) {
  const gebouwd = files
    .filter((file) => SPEC_BESTAND.test(file))
    .map((file) => ({ file, text: read(file) }))
    .filter(({ text }) => SPEC_STATUS.exec(text)?.[1] === 'gebouwd');
  if (gebouwd.length === 0) return [];
  const tests = files.filter((file) => TESTBESTAND.test(file)).map(read);
  return gebouwd.flatMap(({ file, text }) => {
    const spec = { naam: path.basename(file, '.md'), namespace: /^namespace:\s*(\S+)\s*$/m.exec(text)?.[1] };
    const eigen = new Set([spec.naam, spec.namespace]);
    // Een AC met het voorvoegsel van een andere spec (`accounts/AC-42`) is een kruisverwijzing, geen eigen AC.
    // Een AC met de markering `(nog niet gebouwd)` wacht nog op zijn bouw-PR (ADR 0080 punt 4).
    const gemarkeerd = new Set(
      [...acIds(text).gemarkeerd].flatMap((id) => (eigen.has(id.split('/')[0]) ? [id.replace(/^.*\//, '')] : [])),
    );
    // Een vervallen AC (`Vervallen door ADR <nummer>`, ADR geaccepteerd) heeft geen test meer nodig (ADR 0095 punt 6).
    const vervallen = vervallenAcs({ file, text, eigen }, files, read);
    const ids = [...text.matchAll(AC_ID)]
      .filter(([, voor]) => voor === undefined || eigen.has(voor))
      .map(([, , id = '']) => id)
      .filter((id) => !gemarkeerd.has(id) && !vervallen.has(id));
    const acs = [...new Set(ids)].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
    return acs
      .filter((ac) => !tests.some((tekst) => dekt(tekst, spec, ac)))
      .map((ac) => ({
        key: `docs:ac:${spec.naam}:${ac}`,
        message: `${file}: ${ac} heeft geen testbestand met ${spec.namespace ?? spec.naam}/${ac}`,
      }));
  });
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @param {string | null} app de tekst van het getrackte app-bestand, of null
 * @returns {Violation[]}
 */
function mirrorViolations(files, read, app) {
  if (!files.includes('.claude/gates.json')) return [];
  const { ruw, appGlobs } = samen(JSON.parse(read('.claude/gates.json')), app);
  const eigenaars = codeownersViolations(ruw, files.includes(CODEOWNERS) ? read(CODEOWNERS) : null, appGlobs);
  if (!files.includes(CODEOWNERS) || !files.includes('.claude/settings.json')) return eigenaars;
  const lijsten = lijstenVan(ruw);
  const naam = lijsten?.altijdVragen === undefined ? 'voorReview' : 'altijdVragen';
  const ask = new Set(askEditPaths(read('.claude/settings.json')));
  return [
    ...eigenaars,
    ...(lijsten === null ? [] : askViolations(new Set(lijsten.altijdVragen ?? lijsten.voorReview ?? []), naam, ask)),
    ...onderhoudViolations(veld(ruw, 'onderhoud')),
    ...templateViolations(veld(ruw, 'template'), veld(ruw, 'onderhoud')),
  ];
}

const PADEN = '.claude/gates.json: paden.';

/**
 * De geparste gates.json samengevoegd met het app-bestand (spec app-padtabel) en de globs uit het app-bestand. Is het
 * app-bestand ongeldig, dan alleen gates.json: die fout meldt `appViolations`.
 * @param {unknown} gates @param {string | null} appTekst @returns {{ ruw: unknown, appGlobs: string[] }}
 */
function samen(gates, appTekst) {
  if (appTekst === null) return { ruw: gates, appGlobs: [] };
  try {
    /** @type {unknown} */
    const app = JSON.parse(appTekst);
    const ruw = samengevoegd(gates, app);
    return { ruw, appGlobs: Object.keys(object(veld(app, 'paden'))) };
  } catch {
    return { ruw: gates, appGlobs: [] };
  }
}

/** @param {unknown} waarde @returns {waarde is Record<string, unknown>} */
const isObject = (waarde) => typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);

/** @param {unknown} waarde @returns {Record<string, unknown>} */
const object = (waarde) => (isObject(waarde) ? waarde : {});

const APP_MELDING = `${APP_BESTAND}: `;
const APP_TEMPLATE =
  'bestaat in de template zelf (onderhoud.repository staat in .claude/gates.json); app-rijen horen in een app';

/**
 * Het app-bestand (spec app-padtabel, Ontwerp "check-docs, nieuwe regels"): alleen `$comment` en `paden`, `paden` een object,
 * dezelfde rijregels als gates.json, geen altijdVragen, geen besluit agent, geen glob die gates.json al heeft, en niet in de
 * template zelf. Sleutel `docs:gates-app:<…>`.
 * @param {string} gatesTekst @param {string | null} appTekst @returns {Violation[]}
 */
function appViolations(gatesTekst, appTekst) {
  if (appTekst === null) return [];
  /** @param {string} melding @returns {Violation} */
  const fout = (melding) => ({ key: `docs:gates-app:${melding}`, message: `${APP_MELDING}${melding}` });
  /** @type {unknown} */
  const gates = JSON.parse(gatesTekst);
  const inTemplate = veld(veld(gates, 'onderhoud'), 'repository') !== undefined ? [fout(APP_TEMPLATE)] : [];
  /** @type {unknown} */
  let app;
  try {
    app = JSON.parse(appTekst);
  } catch (error) {
    return [...inTemplate, fout(`geen geldige JSON (${error instanceof Error ? error.message : String(error)})`)];
  }
  const vorm = isObject(app) ? Object.keys(app).filter((sleutel) => sleutel !== '$comment' && sleutel !== 'paden') : [];
  const paden = veld(app, 'paden');
  const kop = [...inTemplate, ...vorm.map((sleutel) => fout(`onbekende sleutel ${sleutel}`))];
  if (!isObject(paden)) return [...kop, fout('paden is geen object')];
  const template = Object.keys(templatePaden(gates));
  const sleutels = padenSleutels(appTekst);
  const dubbel = [...new Set(sleutels.filter((sleutel, index) => sleutels.indexOf(sleutel) !== index))];
  return [
    ...kop,
    ...dubbel.map((glob) => fout(`paden.${glob}: dubbele sleutel`)),
    ...Object.entries(paden).flatMap(([glob, rij]) =>
      appRijMeldingen(glob, rij, template.includes(glob)).map((melding) => fout(`paden.${glob}: ${melding}`)),
    ),
  ];
}

/** `paden` van gates.json, of leeg als die onleesbaar is (dat meldt `padenViolations`). @param {unknown} gates */
function templatePaden(gates) {
  try {
    return padenVan(gates) ?? {};
  } catch {
    return {};
  }
}

/**
 * Meldingen voor één app-rij: de rijregels van gates.json zonder de samenhangregel, plus wat alleen de template mag.
 * @param {string} glob @param {unknown} rij @param {boolean} inTemplate @returns {string[]}
 */
function appRijMeldingen(glob, rij, inTemplate) {
  const leesbaar = rijFouten(rij).length === 0;
  return [
    ...(glob.startsWith('!') ? ['een glob begint niet met !'] : []),
    ...rijFouten(rij),
    ...(leesbaar && veld(rij, 'schrijven') === 'altijdVragen'
      ? ['altijdVragen kan alleen in de template (vloer en ask-spiegel); gebruik voorReview met besluit-pr']
      : []),
    ...(leesbaar && veld(rij, 'besluit') === 'agent' ? ['besluit agent kan alleen in de template'] : []),
    ...(inTemplate ? ['staat al in .claude/gates.json; scherp aan met een eigen glob'] : []),
  ];
}

/**
 * De padtabel (spec padtabel, Werking 6, AC-3, AC-4, AC-9 t/m AC-11): de oude vorm is rood (migratiemelding), beide vormen
 * tegelijk of `paden` geen object ook; verder per rij onbekende kolom of waarde, `{}`, `!`-sleutel, dubbele sleutel in de ruwe
 * tekst (`JSON.parse` houdt stil de laatste), de samenhangregels en de vloer (elk VLOER-pad een eigen rij altijdVragen/besluit-pr).
 * @param {string} tekst
 * @returns {Violation[]}
 */
function padenViolations(tekst) {
  /** @type {unknown} */
  const ruw = JSON.parse(tekst);
  /** @type {Record<string, unknown> | null} */
  let paden;
  try {
    paden = padenVan(ruw);
  } catch (error) {
    return [{ key: 'docs:paden:vorm', message: error instanceof Error ? error.message : String(error) }];
  }
  if (paden === null) return [{ key: 'docs:paden:oude-vorm', message: OUDE_VORM_ZONDER_PADEN }];
  const sleutels = padenSleutels(tekst);
  const dubbel = [...new Set(sleutels.filter((sleutel, index) => sleutels.indexOf(sleutel) !== index))];
  const meldingen = [
    ...dubbel.map((glob) => ({ glob, melding: 'dubbele sleutel' })),
    ...Object.entries(paden).flatMap(([glob, rij]) => rijMeldingen(glob, rij).map((melding) => ({ glob, melding }))),
    ...VLOER.filter((glob) => !opVloer(paden[glob])).map((glob) => ({
      glob,
      melding: 'vloer: verwacht altijdVragen en besluit-pr',
    })),
  ];
  return meldingen.map(({ glob, melding }) => ({
    key: `docs:paden:${glob}:${melding}`,
    message: `${PADEN}${glob}: ${melding}`,
  }));
}

/** @param {unknown} rij */
function opVloer(rij) {
  return veld(rij, 'schrijven') === 'altijdVragen' && veld(rij, 'besluit') === 'besluit-pr';
}

/**
 * Meldingen voor één rij: `!`-sleutel, onleesbaar (`rijFouten`) of in strijd met de samenhang.
 * @param {string} glob @param {unknown} rij @returns {string[]}
 */
function rijMeldingen(glob, rij) {
  const fouten = [...(glob.startsWith('!') ? ['een glob begint niet met !'] : []), ...rijFouten(rij)];
  if (rijFouten(rij).length > 0) return fouten;
  const schrijven = String(veld(rij, 'schrijven') ?? 'vrij');
  const besluit = String(veld(rij, 'besluit') ?? 'eigenaar');
  return [
    ...fouten,
    ...(schrijven === 'altijdVragen' && besluit !== 'besluit-pr' ? ['altijdVragen vraagt besluit besluit-pr'] : []),
    ...(SCHRIJVEN.findIndex((niveau) => niveau === schrijven) >= 1 && besluit === 'agent'
      ? [`schrijven ${schrijven} met besluit agent`]
      : []),
  ];
}

/**
 * De sleutels van het object `paden` (direct onder de wortel) zoals ze in de ruwe tekst staan, dubbele incluis.
 * @param {string} tekst @returns {string[]}
 */
export function padenSleutels(tekst) {
  /** @type {string[]} */
  const sleutels = [];
  /** @type {{ sleutel: string | null }[]} */
  const stapel = [];
  for (let index = 0; index < tekst.length; index += 1) {
    const teken = tekst[index];
    if (teken === '{' || teken === '[') stapel.push({ sleutel: null });
    else if (teken === '}' || teken === ']') stapel.pop();
    else if (teken === '"') {
      const { eind, sleutel } = leesString(tekst, index);
      const boven = stapel.at(-1);
      if (boven !== undefined && sleutel !== null) boven.sleutel = sleutel;
      if (sleutel !== null && stapel.length === 2 && stapel[0]?.sleutel === 'paden') sleutels.push(sleutel);
      index = eind;
    }
  }
  return sleutels;
}

/**
 * De string die op `begin` opent: de index van het sluitende `"`, en de inhoud als er een `:` volgt (een sleutel), anders null.
 * @param {string} tekst @param {number} begin
 */
function leesString(tekst, begin) {
  const eind = stringEinde(tekst, begin);
  const dubbelepunt = /\s*:/y;
  dubbelepunt.lastIndex = eind + 1;
  return { eind, sleutel: dubbelepunt.test(tekst) ? String(JSON.parse(tekst.slice(begin, eind + 1))) : null };
}

/** De index van het sluitende `"` van de string die op `begin` opent. @param {string} tekst @param {number} begin */
function stringEinde(tekst, begin) {
  let index = begin + 1;
  while (index < tekst.length && tekst[index] !== '"') index += tekst[index] === '\\' ? 2 : 1;
  return index;
}

/** @param {unknown} ruw @param {string} sleutel */
function veld(ruw, sleutel) {
  return typeof ruw === 'object' && ruw !== null
    ? Object.entries(ruw).find(([naam]) => naam === sleutel)?.[1]
    : undefined;
}

/** De afgeleide lijsten (ADR 0079), of null als de lezer gooit; `padenViolations` meldt die fout. @param {unknown} ruw */
function lijstenVan(ruw) {
  try {
    return afgeleid(ruw);
  } catch {
    return null;
  }
}

/**
 * De Edit-regels in `ask` zijn precies de afgeleide `altijdVragen` (oude vorm zonder die lijst: `voorReview`; ADR 0045 punt 9).
 * @param {ReadonlySet<string>} bron @param {string} naam @param {ReadonlySet<string>} ask
 * @returns {Violation[]}
 */
function askViolations(bron, naam, ask) {
  return [
    ...[...bron]
      .filter((path) => !ask.has(path))
      .map((path) => ({
        key: `docs:spiegel:ask:${path}`,
        message: `${naam} noemt ${path}, \`ask\` in .claude/settings.json niet`,
      })),
    ...[...ask]
      .filter((path) => !bron.has(path))
      .map((path) => ({
        key: `docs:spiegel:voorreview:${path}`,
        message: `\`ask\` noemt ${path}, ${naam} in .claude/gates.json niet`,
      })),
  ];
}

/** `onderhoud` is ontbrekend of precies `{ "repository": "<owner>/<repo>" }` (ADR 0045 punt 8); dezelfde vormcheck als het rolhek. @param {unknown} value @returns {Violation[]} */
function onderhoudViolations(value) {
  try {
    onderhoudVan(value);
    return [];
  } catch (error) {
    return [{ key: 'docs:gates:onderhoud', message: error instanceof Error ? error.message : String(error) }];
  }
}

/**
 * Spec template-repo AC-2: `template` is verplicht en precies `{ "repository": "<owner>/<repo>" }` (dezelfde vormcheck als het
 * rolhek), en `onderhoud.repository` is, als hij er geldig is, gelijk aan `template.repository`.
 * @param {unknown} value @param {unknown} onderhoud @returns {Violation[]}
 */
function templateViolations(value, onderhoud) {
  if (value === undefined) return [{ key: 'docs:gates:template', message: '.claude/gates.json: template ontbreekt' }];
  let template;
  try {
    template = templateVan(value);
  } catch (error) {
    return [{ key: 'docs:gates:template', message: error instanceof Error ? error.message : String(error) }];
  }
  let onderhoudRepo;
  try {
    onderhoudRepo = onderhoudVan(onderhoud)?.repository;
  } catch {
    // De vorm van onderhoud meldt onderhoudViolations al.
    return [];
  }
  if (template === undefined || onderhoudRepo === undefined || onderhoudRepo === template.repository) return [];
  return [
    {
      key: 'docs:gates:template-onderhoud',
      message: `.claude/gates.json: onderhoud.repository (${onderhoudRepo}) verschilt van template.repository (${template.repository})`,
    },
  ];
}

/** De regels van een CODEOWNERS-tekst zonder lege regels en zonder uitlijning. @param {string} tekst */
function codeownersRegels(tekst) {
  return tekst
    .split('\n')
    .map((regel) => regel.trim().replace(/\s+/g, ' '))
    .filter((regel) => regel !== '');
}

/**
 * CODEOWNERS is gelijk aan de afleiding uit de padtabel voor de eerste handle uit `goedkeurders` (ADR 0089, spec
 * templateregime AC-3): regel voor regel, in dezelfde volgorde (het laatste passende patroon wint), uitlijning telt niet.
 * In de oude vorm of met een onleesbare `paden` is er geen afleiding; die fout meldt `padenViolations`. Een ontbrekend
 * bestand en een glob die GitHub anders leest (`codeownersTekst` gooit) zijn ook een melding.
 * @param {unknown} ruw de geparste gates.json, samengevoegd met het app-bestand
 * @param {string | null} tekst de inhoud van CODEOWNERS, of null als het bestand ontbreekt
 * @param {readonly string[]} appGlobs de globs uit het app-bestand (een fout erin noemt `.claude/gates.app.json`)
 * @returns {Violation[]}
 */
function codeownersViolations(ruw, tekst, appGlobs) {
  const key = 'docs:spiegel:codeowners';
  try {
    if (padenVan(ruw) === null) return [];
  } catch {
    return [];
  }
  const eigenaar = eersteGoedkeurder(ruw);
  if (eigenaar === null)
    return [
      { key, message: `.claude/gates.json: goedkeurders is leeg; ${CODEOWNERS} is niet af te leiden uit de padtabel` },
    ];
  if (tekst === null)
    return [{ key, message: `${CODEOWNERS} ontbreekt; genereer het uit de padtabel met \`${HERSTEL}\`` }];
  /** @type {string[]} */
  let verwacht;
  try {
    verwacht = codeownersRegels(codeownersTekst(ruw, eigenaar, appGlobs));
  } catch (error) {
    return [
      { key, message: `${CODEOWNERS} is niet af te leiden: ${error instanceof Error ? error.message : String(error)}` },
    ];
  }
  const staat = codeownersRegels(tekst);
  const index = verwacht.findIndex((regel, nummer) => regel !== staat[nummer]);
  const eerste = index === -1 && staat.length > verwacht.length ? verwacht.length : index;
  if (eerste === -1) return [];
  const verschil = `verwacht "${verwacht[eerste] ?? '(geen regel)'}", er staat "${staat[eerste] ?? '(geen regel)'}"`;
  return [
    {
      key,
      message: `${CODEOWNERS} is niet gelijk aan de afleiding uit de padtabel voor @${eigenaar} (eerste verschil: ${verschil}); herstel met \`${HERSTEL}\``,
    },
  ];
}

/**
 * `merge` (ADR 0069; blijft tot ADR 0089 punt 9): de modus is `eigenaar` of `niet-kritiek`; `pnpm pr:merge`,
 * `pnpm pr:resolve` (ADR 0098) en het rolhek lezen hem; `pnpm pr:log` (ADR 0102) gebruikt de ankertoets zonder de modus.
 * @param {string} text
 * @returns {Violation[]}
 */
export function mergeModusViolations(text) {
  /** @type {unknown} */
  const ruw = JSON.parse(text);
  const modus = typeof ruw === 'object' && ruw !== null && 'merge' in ruw ? ruw.merge : undefined;
  return modus === undefined || modus === 'eigenaar' || modus === 'niet-kritiek'
    ? []
    : [
        {
          key: 'docs:merge',
          message: `.claude/gates.json: merge is ${JSON.stringify(modus)}, niet "eigenaar" of "niet-kritiek"`,
        },
      ];
}

/**
 * `werkmapNegeer` (ADR 0045 punt 23): een lijst paden onder `.claude/`, zonder `..`, waarvan niets getrackt is.
 * @param {readonly string[]} files
 * @param {string} text
 * @returns {Violation[]}
 */
function werkmapNegeerViolations(files, text) {
  /** @type {unknown} */
  const config = JSON.parse(text);
  const lijst =
    typeof config === 'object' && config !== null
      ? Object.entries(config).find(([n]) => n === 'werkmapNegeer')?.[1]
      : undefined;
  if (lijst === undefined) return [];
  const key = 'docs:werkmapNegeer';
  if (!Array.isArray(lijst) || !lijst.every((pad) => typeof pad === 'string'))
    return [{ key, message: '.claude/gates.json: werkmapNegeer moet een lijst met tekst zijn' }];
  return lijst.flatMap((pad) => {
    const buiten = !pad.startsWith('.claude/') || pad === '.claude/' || pad.split('/').includes('..');
    if (buiten) return [{ key: `${key}:${pad}`, message: `werkmapNegeer: ${pad} valt niet onder .claude/` }];
    const getrackt = files.some((file) => (pad.endsWith('/') ? file.startsWith(pad) : file === pad));
    return getrackt ? [{ key: `${key}:${pad}`, message: `werkmapNegeer: ${pad} is getrackt` }] : [];
  });
}

/**
 * De paden uit `Edit(…)` in `permissions.ask`.
 * @param {string} text
 * @returns {string[]}
 */
function askEditPaths(text) {
  /** @type {unknown} */
  const settings = JSON.parse(text);
  const permissions =
    typeof settings === 'object' && settings !== null && 'permissions' in settings ? settings.permissions : undefined;
  const ask = typeof permissions === 'object' && permissions !== null && 'ask' in permissions ? permissions.ask : [];
  return (Array.isArray(ask) ? ask : [])
    .map((entry) => (typeof entry === 'string' ? /^Edit\((.+)\)$/.exec(entry)?.[1] : undefined))
    .filter((entry) => entry !== undefined);
}

// Uitzonderingen op check 5 (besluit eigenaar, 2026-10-12). Architect en tester schrijven bewust in een gate: specs en ADR's
// (status `goedgekeurd` bewaakt check-spec-approval), ook die van de template onder `docs/template/` (spec templateregime
// AC-10; de rest van `docs/template/**` blijft dicht), en testpaden (bestaande tests bewaakt het rolhek). Developer en hoofdsessie
// zijn vrijgesteld: voor hen handelt het rolhek gates af met ask/deny (rails/hooks/lib/rolhek.mjs, decideByRole).
/** @type {Record<string, (config: { testpaden: string[] }) => string[]>} */
const SCHRIJFRECHT_VRIJ = {
  architect: () => ['docs/adr/**', 'docs/specs/**', 'docs/template/adr/**', 'docs/template/specs/**'],
  tester: (config) => config.testpaden,
};
const SCHRIJFRECHT_ALLES = new Set(['developer', 'hoofdsessie']);

/**
 * Check 5: een rol mag niet zonder ask/deny in een gate schrijven. Alleen de bestandsnaam-gates uit `testpaden`
 * (beginnend met `**\/`, zoals `**\/*.test.*`) tellen niet: die overlappen met elke map, ook `docs/reviews/**`, en een
 * bestaand testbestand bewaakt het rolhek (existingTest). Map-gates (`test/**`, `e2e/**`, `db/tests/**`) tellen wel: daar
 * schrijft alleen de tester (SCHRIJFRECHT_VRIJ).
 * Op het samengevoegde object (spec app-padtabel): een app-rij telt mee.
 * @param {string} text
 * @param {string | null} app de tekst van het getrackte app-bestand, of null
 * @returns {Violation[]}
 */
function schrijfrechtViolations(text, app) {
  const raw = samen(JSON.parse(text), app).ruw;
  const entry = (/** @type {string} */ key) =>
    typeof raw === 'object' && raw !== null ? Object.entries(raw).find(([name]) => name === key)?.[1] : undefined;
  const strings = (/** @type {unknown} */ value) => (Array.isArray(value) ? value.map(String) : []);
  const testpaden = strings(entry('testpaden'));
  const naamGates = testpaden.filter((glob) => glob.startsWith('**/'));
  const gates = (lijstenVan(raw)?.gates ?? []).filter((gate) => !naamGates.includes(gate));
  const rollen = entry('schrijfrecht');
  if (typeof rollen !== 'object' || rollen === null) return [];
  return Object.entries(rollen)
    .filter(([rol]) => !SCHRIJFRECHT_ALLES.has(rol))
    .flatMap(([rol, globs]) => {
      const vrij = SCHRIJFRECHT_VRIJ[rol]?.({ testpaden }) ?? [];
      return strings(globs)
        .filter((glob) => !vrij.includes(glob))
        .flatMap((glob) => gates.filter((gate) => globsOverlap(glob, gate)).map((gate) => ({ rol, glob, gate })));
    })
    .map(({ rol, glob, gate }) => ({
      key: `docs:schrijfrecht:${rol}:${glob}:${gate}`,
      message: `.claude/gates.json: schrijfrecht van ${rol} (${glob}) overlapt met gate ${gate}`,
    }));
}

/**
 * Glob als NFA-stappen (zelfde taal als globMatch in rails/hooks/lib/rolhek.mjs): `*`, `**`, `**\/` en `?`.
 * Een stap leest één teken: een letterlijk teken, 'segment' (geen `/`) of 'alles'.
 * @typedef {{ from: number, to: number, read: string | null }} Step
 * @param {string} glob
 * @returns {{ steps: Step[], end: number }}
 */
function globNfa(glob) {
  /** @type {Step[]} */
  const steps = [];
  let state = 0;
  let extra = glob.length + 1;
  for (let index = 0; index < glob.length; index += 1) {
    const next = state + 1;
    if (glob.startsWith('**/', index)) {
      const middle = extra++;
      steps.push({ from: state, to: next, read: null }, { from: state, to: middle, read: 'alles' });
      steps.push({ from: middle, to: middle, read: 'alles' }, { from: middle, to: next, read: '/' });
      index += 2;
    } else if (glob.startsWith('**', index)) {
      steps.push({ from: state, to: next, read: null }, { from: state, to: state, read: 'alles' });
      index += 1;
    } else if (glob[index] === '*') {
      steps.push({ from: state, to: next, read: null }, { from: state, to: state, read: 'segment' });
    } else steps.push({ from: state, to: next, read: glob[index] === '?' ? 'segment' : (glob[index] ?? '') });
    state = next;
  }
  return { steps, end: state };
}

/**
 * Of twee leesstappen hetzelfde teken kunnen lezen.
 * @param {string} a
 * @param {string} b
 */
function readsMeet(a, b) {
  if (a === 'alles' || b === 'alles') return true;
  if (a === 'segment') return b !== '/';
  if (b === 'segment') return a !== '/';
  return a === b;
}

/**
 * Echte overlap: bestaat er een pad dat beide globs matcht (`docs/**` en `docs/framework.md`: ja)? Zoekt in het product
 * van de twee NFA's een weg van begin naar eind.
 * @param {string} left
 * @param {string} right
 */
export function globsOverlap(left, right) {
  const a = globNfa(left);
  const b = globNfa(right);
  const seen = new Set(['0,0']);
  const queue = [[0, 0]];
  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    const [x = 0, y = 0] = item;
    if (x === a.end && y === b.end) return true;
    const moves = [
      ...a.steps.filter((s) => s.from === x && s.read === null).map((s) => [s.to, y]),
      ...b.steps.filter((s) => s.from === y && s.read === null).map((s) => [x, s.to]),
      ...a.steps
        .filter((s) => s.from === x && s.read !== null)
        .flatMap((s) =>
          b.steps
            .filter((t) => t.from === y && t.read !== null && readsMeet(s.read ?? '', t.read))
            .map((t) => [s.to, t.to]),
        ),
    ];
    for (const move of moves) {
      if (!seen.has(move.join(','))) {
        seen.add(move.join(','));
        queue.push(move);
      }
    }
  }
  return false;
}

// Los gedraaid zou dit bestand niets melden en met 0 eindigen, terwijl alleen de ratchet met .kit/baseline.json vergelijkt
// (leerpunt #693). Daarom geen stil groen: verwijs naar de gate.
if (import.meta.main) {
  console.error(
    '✗ check-docs draait alleen via de ratchet (vergelijking met .kit/baseline.json): gebruik `pnpm ratchet`.',
  );
  process.exitCode = 1;
}
