// check:docs-drift (AGENTS.md "Docs in dezelfde PR", framework §8): wijzigt src/ ten opzichte van het afsplitspunt met
// origin/main zonder dat docs/ of CHANGELOG.md meewijzigt, dan volgt een waarschuwing. Nooit een blokkade (exit 0): niet elke
// wijziging raakt gedrag, API of conventies; de reviewer beoordeelt dat. Onleesbare base is ook alleen een waarschuwing.
//
// Alleen in de template (`onderhoud` in .claude/gates.json, spec template-release AC-10): wijzigt een pad buiten docs/ en
// test/ dat geen testbestand en niet gegenereerd is, zonder changelogfragment in docs/template-changelog.d/, dan volgt een
// tweede waarschuwing. Ook die blokkeert nooit; een ontbrekende of ongeldige gates.json telt als app.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FRAGMENT_MAP, isTemplate } from './template-release.mjs';

const BASE = 'origin/main';
const GEGENEREERD = new Set(['src/web/routeTree.gen.ts', 'src/api/db/schema.ts']);
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * De bestaande waarschuwing: src/ wijzigt zonder docs.
 * @param {readonly string[]} paden
 */
function srcWaarschuwing(paden) {
  const code = paden.filter((pad) => pad.startsWith('src/') && !TEST.test(pad) && !GEGENEREERD.has(pad));
  const docs = paden.some((pad) => pad.startsWith('docs/') || pad === 'CHANGELOG.md');
  if (code.length === 0 || docs) return null;
  return `src/ wijzigt (${code.length} bestand${code.length === 1 ? '' : 'en'}) zonder wijziging in docs/ of CHANGELOG.md; raakt dit gedrag, API of conventies, werk dan de doc in deze PR bij`;
}

/**
 * In de template: een wijziging buiten docs/ en test/ zonder changelogfragment.
 * @param {readonly string[]} paden
 */
function fragmentWaarschuwing(paden) {
  const merkbaar = paden.some(
    (pad) => !pad.startsWith('docs/') && !pad.startsWith('test/') && !TEST.test(pad) && !GEGENEREERD.has(pad),
  );
  if (!merkbaar || paden.some((pad) => pad.startsWith(`${FRAGMENT_MAP}/`))) return null;
  return `geen changelogfragment in ${FRAGMENT_MAP}/; voeg er een toe als een app of gebruiker deze wijziging merkt`;
}

/**
 * @param {readonly string[]} paden gewijzigde paden t.o.v. het afsplitspunt
 * @param {{ template?: boolean }} [opties] `template`: de repo is de template zelf; standaard app-gedrag
 * @returns {string | null} de waarschuwing (twee samen met `; `, eerst die over src/), of null als er niets te melden is
 */
export function driftWaarschuwing(paden, { template = false } = {}) {
  const meldingen = [srcWaarschuwing(paden), template ? fragmentWaarschuwing(paden) : null].filter(
    (melding) => melding !== null,
  );
  return meldingen.length === 0 ? null : meldingen.join('; ');
}

/**
 * Adviserend: een ontbrekende, onleesbare of ongeldige `.claude/gates.json` telt als app. Los van het lezen van de base,
 * zodat een kapotte gates.json nooit de melding "origin/main is niet te lezen" geeft.
 * @param {string} root
 */
function templateOfApp(root) {
  try {
    return isTemplate(root);
  } catch {
    return false;
  }
}

/**
 * @param {string} [root]
 * @param {string} [base]
 * @returns {string | null}
 */
export function driftVanRepo(root = '.', base = BASE) {
  const template = templateOfApp(root);
  try {
    const git = (/** @type {string[]} */ args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const afsplitsing = git(['merge-base', base, 'HEAD']).trim();
    return driftWaarschuwing(git(['diff', '--name-only', '-z', afsplitsing]).split('\0').filter(Boolean), { template });
  } catch {
    return `${base} is niet te lezen; docs-drift niet gecontroleerd (git fetch origin main of fetch-depth: 0)`;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const waarschuwing = driftVanRepo();
  if (waarschuwing === null) console.info('✓ check:docs-drift: docs sluiten aan op de wijziging in src/');
  else
    console.warn(
      process.env['GITHUB_ACTIONS'] === 'true' ? `::warning::${waarschuwing}` : `⚠ check:docs-drift: ${waarschuwing}`,
    );
}
