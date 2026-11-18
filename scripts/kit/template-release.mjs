// template:release (spec template-release, ADR 0094): voegt de changelogfragmenten in docs/template-changelog.d/ samen tot
// een releasesectie direct onder het [Unreleased]-blok van docs/template-changelog.md, zet TEMPLATE_VERSION op de nieuwe
// versie en verwijdert de verwerkte fragmenten. Alleen in de template (`onderhoud` in .claude/gates.json). Het script
// commit, pusht en tagt niet: de hoofdsessie maakt de release-PR, de eigenaar tagt de squash-commit als `template-vx.y.z`.
// Gebruik: `pnpm template:release <x.y.z> [--datum JJJJ-MM-DD]`. Bij een fout: exit 1 en geen bestand gewijzigd.
//
// Dit bestand is ook de ene ontleding van releasekoppen (`releasesUit`) en van fragmenten (`fragmentFout`, `leesFragment`)
// voor check-docs, check:docs-drift en template:status. Importeren doet niets; de CLI draait alleen als het script zelf
// wordt aangeroepen.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { onderhoudVan } from '../../rails/hooks/lib/padtabel.mjs';

export const CHANGELOG = 'docs/template-changelog.md';
export const FRAGMENT_MAP = 'docs/template-changelog.d';
export const VERSIE_BESTAND = 'src/core/shared/template-version.ts';
export const UPDATE_KOP = '### Bij een update';
const GATES = '.claude/gates.json';
const LEESMIJ = 'README.md';
const FRAGMENT_NAAM = /^[a-z0-9][a-z0-9-]*\.md$/;
const RELEASEKOP = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSIE_REGEL = /(export const TEMPLATE_VERSION = ')([^']*)(')/;
const VOORWERK = /^---\nsoort:[ \t]*([^\n]*)\n---(?:\n|$)/;
/** De soorten van een fragment met hun subkop in een release, in de vaste volgorde. */
const SOORTEN = new Map([
  ['toegevoegd', '### Toegevoegd'],
  ['gewijzigd', '### Gewijzigd'],
  ['opgelost', '### Opgelost'],
  ['verwijderd', '### Verwijderd'],
  ['documentatie', '### Documentatie'],
]);

/** @typedef {{ versie: string, datum: string, notities: string[] }} Release */
/** @typedef {{ soort: string, items: string[], notities: string[] }} Fragment `items` en `notities`: de regels van elk lijstitem. */
/** @typedef {{ naam: string, fragment: Fragment }} BenoemdFragment */

/**
 * De lijstitems in een blok regels, elk als tekst zonder `- `; een ingesprongen vervolgregel hoort bij hetzelfde item.
 * @param {readonly string[]} regels
 * @returns {string[]}
 */
function lijstitems(regels) {
  /** @type {string[]} */
  const items = [];
  for (const regel of regels) {
    if (regel.startsWith('- ')) items.push(regel.slice(2).trim());
    else if (/^\s+\S/.test(regel) && items.length > 0) items[items.length - 1] += ` ${regel.trim()}`;
  }
  return items;
}

/**
 * De lijstitems onder `### Bij een update` in de regels van één release.
 * @param {readonly string[]} sectie
 */
function notitiesVan(sectie) {
  const begin = sectie.indexOf(UPDATE_KOP);
  if (begin === -1) return [];
  const rest = sectie.slice(begin + 1);
  const einde = rest.findIndex((regel) => regel.startsWith('#'));
  return lijstitems(einde === -1 ? rest : rest.slice(0, einde));
}

/**
 * De releases onder `## [Unreleased]` op volgorde van de lijst (nieuwste eerst). Gooit als de koppen niet de afgesproken
 * vorm hebben (release-versie/AC-1).
 * @param {string} changelog de tekst van docs/template-changelog.md
 * @returns {Release[]}
 */
export function releasesUit(changelog) {
  const regels = changelog.split('\n');
  const koppen = regels.flatMap((regel, index) => (regel.startsWith('## ') ? [{ regel, index }] : []));
  if (koppen[0]?.regel !== '## [Unreleased]') throw new Error('de eerste kop is niet "## [Unreleased]"');
  const releases = koppen.slice(1);
  if (releases.length === 0) throw new Error('geen releasekop onder "## [Unreleased]"');
  return releases.map(({ regel, index }, nummer) => {
    const [, versie, datum] = RELEASEKOP.exec(regel) ?? [];
    if (versie === undefined || datum === undefined)
      throw new Error(`releasekop zonder de vorm "## [x.y.z] - JJJJ-MM-DD": ${regel}`);
    return { versie, datum, notities: notitiesVan(regels.slice(index + 1, releases[nummer + 1]?.index)) };
  });
}

/**
 * @param {string} versie `x.y.z`
 * @returns {number[]}
 */
function delen(versie) {
  return versie.split('.').map(Number);
}

/**
 * Vergelijkt twee versies `x.y.z`: negatief als `a` lager is dan `b`, 0 bij gelijk, positief als `a` hoger is.
 * @param {string} a
 * @param {string} b
 */
export function vergelijkVersies(a, b) {
  const links = delen(a);
  const rechts = delen(b);
  const verschil = [0, 1, 2].map((i) => (links[i] ?? 0) - (rechts[i] ?? 0)).find((v) => v !== 0);
  return verschil ?? 0;
}

/**
 * De template zelf heeft `onderhoud.repository` in `.claude/gates.json`; een app niet. Gooit als het bestand niet te lezen
 * of geen JSON is, of als `onderhoud` een ongeldige vorm heeft (de melding van `onderhoudVan`).
 * @param {string} root
 * @returns {boolean}
 */
export function isTemplate(root) {
  /** @type {unknown} */
  let ruw;
  try {
    ruw = JSON.parse(readFileSync(path.join(root, GATES), 'utf8'));
  } catch (error) {
    throw new Error(`${GATES} is niet te lezen: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  const onderhoud =
    typeof ruw === 'object' && ruw !== null
      ? Object.entries(ruw).find(([naam]) => naam === 'onderhoud')?.[1]
      : undefined;
  return onderhoudVan(onderhoud) !== undefined;
}

/**
 * De versie in de regel `export const TEMPLATE_VERSION = '…'`.
 * @param {string} tekst de tekst van src/core/shared/template-version.ts
 * @returns {string}
 */
export function versieUit(tekst) {
  const versie = VERSIE_REGEL.exec(tekst)?.[2];
  if (versie === undefined || !SEMVER.test(versie))
    throw new Error(`${VERSIE_BESTAND}: geen regel "export const TEMPLATE_VERSION = '<x.y.z>'"`);
  return versie;
}

/**
 * De bestandsnamen van de fragmenten in docs/template-changelog.d/, op volgorde van naam; README.md is geen fragment.
 * @param {string} root
 * @returns {string[]}
 */
export function fragmentNamen(root) {
  const map = path.join(root, FRAGMENT_MAP);
  if (!existsSync(map)) return [];
  return readdirSync(map)
    .filter((naam) => naam !== LEESMIJ)
    .toSorted();
}

/**
 * Splitst de regels na de front matter in het deel vóór en het deel onder `### Bij een update`.
 * @param {string} tekst
 * @returns {{ soort: string, voor: string[], onder: string[] | null }}
 */
function splits(tekst) {
  const voorwerk = VOORWERK.exec(tekst);
  const regels = (voorwerk === null ? tekst : tekst.slice(voorwerk[0].length)).split('\n');
  const kop = regels.indexOf(UPDATE_KOP);
  return {
    soort: voorwerk?.[1]?.trim() ?? '',
    voor: kop === -1 ? regels : regels.slice(0, kop),
    onder: kop === -1 ? null : regels.slice(kop + 1),
  };
}

/**
 * De regels van elk lijstitem in een blok, met de vervolgregels zoals ze er staan.
 * @param {readonly string[]} regels
 * @returns {string[]}
 */
function itemBlokken(regels) {
  /** @type {string[]} */
  const items = [];
  for (const regel of regels) {
    if (regel.startsWith('- ')) items.push(regel.trimEnd());
    else if (regel.trim() !== '' && items.length > 0) items[items.length - 1] += `\n${regel.trimEnd()}`;
  }
  return items;
}

/**
 * De eerste regel in een blok die geen lijstitem, vervolgregel of lege regel is.
 * @param {readonly string[]} regels
 */
function losseRegel(regels) {
  let inItem = false;
  for (const regel of regels) {
    if (regel.startsWith('- ')) inItem = true;
    else if (regel.trim() === '') continue;
    else if (!inItem || !/^\s/.test(regel)) return regel.trim();
  }
  return undefined;
}

/**
 * Waarom een fragment ongeldig is (spec template-release AC-1), of null als het geldig is. Eén reden per fragment: de eerste.
 * @param {string} naam de bestandsnaam binnen docs/template-changelog.d/
 * @param {string} tekst
 * @returns {string | null}
 */
export function fragmentFout(naam, tekst) {
  if (!FRAGMENT_NAAM.test(naam))
    return `de naam voldoet niet aan ${FRAGMENT_NAAM.source}: de branchnaam in kleine letters, elk ander teken een "-"`;
  const { soort, voor, onder } = splits(tekst);
  if (!SOORTEN.has(soort))
    return `de front matter heeft geen geldige soort (${soort === '' ? 'ontbreekt' : `"${soort}"`}); kies uit ${[...SOORTEN.keys()].join(', ')}`;
  const kop = [...voor, ...(onder ?? [])].find((regel) => /^#{1,6}(\s|$)/.test(regel));
  if (kop !== undefined) return `de kop "${kop.trim()}" mag niet; de enige toegestane kop is één keer "${UPDATE_KOP}"`;
  const los = losseRegel(voor);
  if (los !== undefined) return `"${los}" is geen lijstitem; een fragment bestaat uit lijstitems ("- …")`;
  if (itemBlokken(voor).length === 0) return `geen lijstitem ("- …") na de front matter`;
  if (onder === null) return null;
  const losOnder = losseRegel(onder);
  if (losOnder !== undefined || itemBlokken(onder).length === 0)
    return `"${UPDATE_KOP}" zonder lijstitem ("- …") eronder`;
  return null;
}

/**
 * Een geldig fragment ontleed; toets eerst met `fragmentFout`.
 * @param {string} tekst
 * @returns {Fragment}
 */
export function leesFragment(tekst) {
  const { soort, voor, onder } = splits(tekst);
  return { soort, items: itemBlokken(voor), notities: itemBlokken(onder ?? []) };
}

/**
 * De releasesectie uit de fragmenten: subkoppen in de vaste volgorde, lege weggelaten, items op volgorde van bestandsnaam.
 * @param {{ versie: string, datum: string }} release
 * @param {readonly BenoemdFragment[]} fragmenten op volgorde van bestandsnaam
 * @returns {string}
 */
export function releaseSectie({ versie, datum }, fragmenten) {
  const blokken = [...SOORTEN].map(([soort, kop]) => ({
    kop,
    items: fragmenten.filter(({ fragment }) => fragment.soort === soort).flatMap(({ fragment }) => fragment.items),
  }));
  blokken.push({ kop: UPDATE_KOP, items: fragmenten.flatMap(({ fragment }) => fragment.notities) });
  const tekst = blokken
    .filter(({ items }) => items.length > 0)
    .map(({ kop, items }) => `${kop}\n\n${items.join('\n')}\n`);
  return [`## [${versie}] - ${datum}\n`, ...tekst].join('\n');
}

/**
 * @param {readonly string[]} argv de argumenten na de scriptnaam
 * @returns {{ versie: string, datum: string }}
 */
function argumenten(argv) {
  const [versie, optie, waarde, ...rest] = argv;
  if (versie === undefined || !SEMVER.test(versie))
    throw new Error(
      `de versie "${versie ?? ''}" is geen semver x.y.z; gebruik: pnpm template:release <x.y.z> [--datum JJJJ-MM-DD]`,
    );
  if (optie === undefined) return { versie, datum: vandaag() };
  if (optie !== '--datum' || rest.length > 0)
    throw new Error(`onbekend argument "${rest[0] ?? optie}"; de enige optie is --datum`);
  if (waarde === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(waarde) || Number.isNaN(Date.parse(waarde)))
    throw new Error(`de datum "${waarde ?? ''}" heeft niet de vorm JJJJ-MM-DD`);
  return { versie, datum: waarde };
}

/** De datum van vandaag als JJJJ-MM-DD, in de lokale tijdzone. */
function vandaag() {
  const nu = new Date();
  const twee = (/** @type {number} */ getal) => String(getal).padStart(2, '0');
  return `${String(nu.getFullYear())}-${twee(nu.getMonth() + 1)}-${twee(nu.getDate())}`;
}

/**
 * De geldige fragmenten in de map; gooit bij geen fragmenten of bij het eerste ongeldige fragment.
 * @param {string} root
 * @returns {BenoemdFragment[]}
 */
function leesFragmenten(root) {
  const namen = fragmentNamen(root);
  if (namen.length === 0) throw new Error(`geen fragmenten in ${FRAGMENT_MAP}/; er is niets om uit te brengen`);
  return namen.map((naam) => {
    const tekst = readFileSync(path.join(root, FRAGMENT_MAP, naam), 'utf8');
    const fout = fragmentFout(naam, tekst);
    if (fout !== null) throw new Error(`${FRAGMENT_MAP}/${naam}: ${fout}`);
    return { naam, fragment: leesFragment(tekst) };
  });
}

/**
 * De versieregel van OV-1: hoger dan de huidige versie, en geen patch bij een release met een "Bij een update"-notitie.
 * @param {string} versie
 * @param {string} huidig
 * @param {readonly BenoemdFragment[]} fragmenten
 */
function toetsVersie(versie, huidig, fragmenten) {
  if (vergelijkVersies(versie, huidig) <= 0)
    throw new Error(`de versie ${versie} is niet hoger dan TEMPLATE_VERSION ${huidig}`);
  const metNotitie = fragmenten.filter(({ fragment }) => fragment.notities.length > 0).map(({ naam }) => naam);
  const [major, minor] = delen(versie);
  const [huidigMajor, huidigMinor] = delen(huidig);
  if (metNotitie.length > 0 && major === huidigMajor && minor === huidigMinor)
    throw new Error(
      `${versie} verhoogt alleen het patchnummer, maar ${metNotitie.join(', ')} heeft een "Bij een update"; verhoog het minornummer (ADR 0094 punt 3)`,
    );
}

/**
 * Stelt de release samen en schrijft pas als alles klopt: de wijzigingenlijst, TEMPLATE_VERSION en het weghalen van de fragmenten.
 * @param {string} root
 * @param {readonly string[]} argv
 * @returns {string} de regel voor de uitvoer
 */
export function brengUit(root, argv) {
  const { versie, datum } = argumenten(argv);
  if (!isTemplate(root)) throw new Error(`alleen in de template: ${GATES} heeft geen onderhoud (dit is een app)`);
  const versieTekst = readFileSync(path.join(root, VERSIE_BESTAND), 'utf8');
  const fragmenten = leesFragmenten(root);
  toetsVersie(versie, versieUit(versieTekst), fragmenten);
  const changelog = readFileSync(path.join(root, CHANGELOG), 'utf8');
  releasesUit(changelog);
  const regels = changelog.split('\n');
  const eerste = regels.findIndex((regel) => RELEASEKOP.test(regel));
  const voor = regels.slice(0, eerste).join('\n');
  const nieuw = `${voor}\n${releaseSectie({ versie, datum }, fragmenten)}\n${regels.slice(eerste).join('\n')}`;
  writeFileSync(path.join(root, CHANGELOG), nieuw);
  writeFileSync(path.join(root, VERSIE_BESTAND), versieTekst.replace(VERSIE_REGEL, `$1${versie}$3`));
  for (const { naam } of fragmenten) rmSync(path.join(root, FRAGMENT_MAP, naam));
  return `✓ template:release: ${versie} (${datum}) uit ${String(fragmenten.length)} fragment${fragmenten.length === 1 ? '' : 'en'}; controleer de diff, maak de release-PR en laat de eigenaar na de merge template-v${versie} taggen`;
}

if (import.meta.main) {
  try {
    console.info(brengUit('.', process.argv.slice(2)));
  } catch (error) {
    console.error(`✗ template:release: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
