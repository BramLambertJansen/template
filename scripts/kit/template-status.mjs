// template:status (spec template-release, ADR 0093 punt 7): de stand van een app of van de template tegenover de
// templatereleases. Alleen-lezend en adviserend: geen fetch, geen netwerk, geen schrijfactie in werkmap of .git; het leest de
// werkmap en lokale refs. Exit 0 als het iets kan melden (ook bij achterstand), 1 als de template-ref of .claude/gates.json
// niet te lezen is of `onderhoud` een ongeldige vorm heeft.
//  - In een app: TEMPLATE_VERSION uit de werkmap, de releases uit refs/remotes/template/main:docs/template-changelog.md en
//    de lokale tags refs/tags/template-v*. Tags `v*` leest het niet (die kunnen van de app zelf zijn).
//  - In de template: TEMPLATE_VERSION, of de tag lokaal bestaat en hoeveel fragmenten op een release wachten.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CHANGELOG,
  FRAGMENT_MAP,
  fragmentNamen,
  isTemplate,
  releasesUit,
  UPDATE_KOP,
  vergelijkVersies,
  VERSIE_BESTAND,
  versieUit,
} from './template-release.mjs';

const TEMPLATE_REF = 'refs/remotes/template/main';
const TAG = 'template-v';
const REF_ONLEESBAAR = `${TEMPLATE_REF} is niet te lezen; haal de template op met git fetch --no-tags template main`;

/** @typedef {import('./template-release.mjs').Release} Release */

/**
 * Een leescommando van git; undefined als het faalt (een ref of pad dat niet bestaat, of geen git-repo).
 * @param {string} root
 * @param {readonly string[]} args
 */
function gitOf(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return undefined;
  }
}

/**
 * De versies waarvan `template-v<versie>` lokaal bestaat.
 * @param {string} root
 * @returns {Set<string>}
 */
function lokaleTags(root) {
  const namen = gitOf(root, ['for-each-ref', '--format=%(refname:strip=2)', `refs/tags/${TAG}*`]) ?? '';
  return new Set(
    namen
      .split('\n')
      .filter(Boolean)
      .map((naam) => naam.slice(TAG.length)),
  );
}

/**
 * Bevat HEAD templatecommits die in geen lokale releasetag zitten? Een geannoteerde tag telt als zijn commit.
 * @param {string} root
 * @param {ReadonlySet<string>} tags
 */
function commitsBuitenRelease(root, tags) {
  const bases = (gitOf(root, ['merge-base', '--all', 'HEAD', TEMPLATE_REF]) ?? '').split('\n').filter(Boolean);
  if (bases.length === 0) return false;
  const releases = [...tags].map((versie) => `refs/tags/${TAG}${versie}`);
  const aantal = gitOf(root, ['rev-list', '--count', ...bases, '--not', ...releases]);
  return aantal !== undefined && aantal !== '0';
}

/**
 * De waarschuwingen in een app: een release zonder lokale tag, en templatecommits na de eigen release buiten een release.
 * @param {string} root
 * @param {string} versie de TEMPLATE_VERSION van de app
 * @param {readonly Release[]} releases de releases vanaf de versie van de app, oplopend
 * @returns {string[]}
 */
function waarschuwingen(root, versie, releases) {
  const tags = lokaleTags(root);
  const zonderTag = releases
    .filter((release) => !tags.has(release.versie))
    .map(
      (release) =>
        `Let op: release ${release.versie} staat in de wijzigingenlijst van template/main, maar de tag ${TAG}${release.versie} ontbreekt lokaal; haal de tags op (stap 1 van "Een template-update binnenhalen") of wacht op de tag van de eigenaar.`,
    );
  // Zonder de tag van de eigen versie is niet te berekenen wat "na haar release" is.
  if (!tags.has(versie) || !commitsBuitenRelease(root, tags)) return zonderTag;
  return [
    ...zonderTag,
    `Let op: deze app bevat templatecommits na ${TAG}${versie} die in geen release zitten; hun notities staan nog niet in een release.`,
  ];
}

/**
 * @param {readonly Release[]} open de openstaande releases, oplopend
 * @returns {string[]}
 */
function openstaand(open) {
  if (open.length === 0) return ['Bijgewerkt: geen openstaande releases.'];
  return [
    `Openstaande releases: ${open.map((release) => release.versie).join(', ')}`,
    '',
    ...open.flatMap(({ versie, notities }) =>
      notities.length === 0
        ? [`Bij een update naar ${versie}: geen notities.`]
        : [`Bij een update naar ${versie}:`, ...notities.map((notitie) => `- ${notitie}`)],
    ),
  ];
}

/**
 * @param {string} root
 * @param {string} versie de TEMPLATE_VERSION van de app
 * @returns {string[]} de regels van de uitvoer
 */
function appStatus(root, versie) {
  const changelog = gitOf(root, ['show', `${TEMPLATE_REF}:${CHANGELOG}`]);
  if (changelog === undefined) throw new Error(REF_ONLEESBAAR);
  const releases = releasesUit(changelog);
  const oplopend = releases.toSorted((a, b) => vergelijkVersies(a.versie, b.versie));
  const nieuwste = oplopend.at(-1);
  const open = oplopend.filter((release) => vergelijkVersies(release.versie, versie) > 0);
  const vanafEigen = oplopend.filter((release) => vergelijkVersies(release.versie, versie) >= 0);
  const letOp = waarschuwingen(root, versie, vanafEigen);
  return [
    `Templateversie van deze app: ${versie}`,
    ...(nieuwste === undefined
      ? []
      : [`Nieuwste release: ${nieuwste.versie} (${TAG}${nieuwste.versie}, ${nieuwste.datum})`]),
    ...openstaand(open),
    ...(letOp.length === 0 ? [] : ['', ...letOp]),
  ];
}

/**
 * @param {string} root
 * @param {string} versie de TEMPLATE_VERSION van de template
 * @returns {string[]} de regels van de uitvoer
 */
function templateStatus(root, versie) {
  const tag = `${TAG}${versie}`;
  const aanwezig = gitOf(root, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]) !== undefined;
  const fragmenten = fragmentNamen(root).map((naam) => readFileSync(path.join(root, FRAGMENT_MAP, naam), 'utf8'));
  const metNotitie = fragmenten.filter((tekst) => tekst.split('\n').includes(UPDATE_KOP)).length;
  return [
    `Templateversie: ${versie}`,
    aanwezig
      ? `Tag: ${tag} (lokaal aanwezig)`
      : `Tag: ${tag} ontbreekt lokaal; de eigenaar tagt de squash-commit van de release-PR op main.`,
    `Wachtend op een release: ${String(fragmenten.length)} fragmenten, waarvan ${String(metNotitie)} met "Bij een update".`,
  ];
}

/**
 * @param {string} [root]
 * @returns {string[]} de regels van de uitvoer; gooit bij een onleesbare template-ref of gates.json
 */
export function templateStand(root = '.') {
  const template = isTemplate(root);
  const versie = versieUit(readFileSync(path.join(root, VERSIE_BESTAND), 'utf8'));
  return template ? templateStatus(root, versie) : appStatus(root, versie);
}

if (import.meta.main) {
  try {
    console.info(templateStand().join('\n'));
  } catch (error) {
    console.error(`✗ template:status: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
