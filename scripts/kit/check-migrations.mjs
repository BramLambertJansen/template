// check:migrations (AGENTS.md "Wijzig nooit een gecommitte migratie", framework §10, spec template-update): ten opzichte van
// het punt waar de branch van origin/main afsplitste mag een migratie alleen bijkomen; wijzigen, verwijderen of hernoemen
// faalt. Elke naam is `<14 cijfers>_<naam>.sql` en elk versienummer komt één keer voor (dbmate-tijdstempels).
// Volgorde: een toegevoegde migratie is strikt later dan de nieuwste versie op het afsplitspunt, anders draait ze in productie
// na een nieuwere en op een verse database ervoor. Staat HEAD op origin/main, dan is "bestaand" de eerste ouder van HEAD
// (controle achteraf op elke commit op main; zonder ouder geen vergelijking). Uitzondering, alleen in een app (geen
// `onderhoud.repository` in `.claude/gates.json`): een oudere migratie die met dezelfde naam en inhoud in de template staat
// (lokaal refs/remotes/template/main; ontbreekt die, dan haalt de CLI-ingang de template op van `template.repository` in
// `origin/main:.claude/gates.json`, spec template-repo). Is origin/main of een benodigde template niet te lezen, dan faalt
// de check: onleesbaar telt als fout.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { templateUrl } from './check-core.mjs';

export const DIR = 'db/migrations';
export const BASE = 'refs/remotes/origin/main';
export const NAAM = /^(\d{14})_[a-z0-9_]+\.sql$/;
const TEMPLATE_REF = 'refs/remotes/template/main';
const OPGEHAALDE_REF = 'refs/check-migrations/template';

/** @typedef {{ status: string, pad: string }} Wijziging */
/** @typedef {{ fouten: string[], templateOntbreekt: boolean }} Oordeel `templateOntbreekt`: de template-ref was nodig en is niet te lezen. */
/** @typedef {{ bestaand: string, opMain: boolean, templateRef: string }} Vergelijking `bestaand`: de commit met de bestaande migraties. */

/**
 * @param {readonly Wijziging[]} wijzigingen uit `git diff --name-status --no-renames <afsplitsing>` op db/migrations
 * @param {readonly string[]} bestanden de namen in db/migrations nu
 * @returns {string[]}
 */
export function migratieRegels(wijzigingen, bestanden) {
  const gewijzigd = wijzigingen
    .filter(({ status }) => status !== 'A')
    .map(
      ({ status, pad }) =>
        `${pad}: ${status === 'D' ? 'verwijderd' : 'gewijzigd'}; maak een nieuwe migratie (expand/contract)`,
    );
  const sql = bestanden.filter((naam) => naam.endsWith('.sql'));
  const naamFouten = sql
    .filter((naam) => !NAAM.test(naam))
    .map((naam) => `${DIR}/${naam}: naam is niet <14 cijfers>_<naam>.sql (dbmate new <naam>)`);
  const versies = sql.map((naam) => NAAM.exec(naam)?.[1]).filter((versie) => versie !== undefined);
  const dubbel = [...new Set(versies.filter((versie, i) => versies.indexOf(versie) !== i))].map(
    (versie) => `versie ${versie} komt meer dan één keer voor`,
  );
  return [...gewijzigd, ...naamFouten, ...dubbel];
}

/**
 * @param {string} root
 * @param {readonly string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Als `git`, maar undefined als het commando faalt (een ref of pad dat niet bestaat).
 * @param {string} root
 * @param {readonly string[]} args
 */
function gitOf(root, args) {
  try {
    return git(root, args).trim();
  } catch {
    return undefined;
  }
}

/**
 * @param {string} root
 * @param {string} commit
 * @returns {Wijziging[]} de wijzigingen in db/migrations van `commit` naar de werkmap
 */
function wijzigingenSinds(root, commit) {
  const velden = git(root, ['diff', '--name-status', '-z', '--no-renames', commit, '--', DIR]).split('\0');
  /** @type {Wijziging[]} */
  const wijzigingen = [];
  for (let i = 0; i + 1 < velden.length; i += 2)
    wijzigingen.push({ status: velden[i] ?? '', pad: velden[i + 1] ?? '' });
  return wijzigingen;
}

/**
 * De template zelf heeft `onderhoud.repository` in `.claude/gates.json` (`pnpm app:init` haalt die regel weg). Een
 * onleesbaar bestand telt als template: dan geldt de uitzondering niet.
 * @param {string} root
 */
function isTemplate(root) {
  try {
    /** @type {unknown} */
    const ruw = JSON.parse(readFileSync(path.join(root, '.claude/gates.json'), 'utf8'));
    const onderhoud = typeof ruw === 'object' && ruw !== null && 'onderhoud' in ruw ? ruw.onderhoud : undefined;
    return (
      typeof onderhoud === 'object' &&
      onderhoud !== null &&
      'repository' in onderhoud &&
      typeof onderhoud.repository === 'string'
    );
  } catch {
    return true;
  }
}

/**
 * @param {string} root
 * @param {string} commit
 * @returns {string | undefined} de nieuwste migratieversie in `commit`, undefined als er geen is
 */
function nieuwsteVersie(root, commit) {
  const versies = git(root, ['ls-tree', '-z', '--name-only', commit, '--', `${DIR}/`])
    .split('\0')
    .map((pad) => NAAM.exec(path.posix.basename(pad))?.[1])
    .filter((versie) => versie !== undefined);
  return versies.toSorted().at(-1);
}

/**
 * Staat de migratie met dezelfde naam en inhoud in de template-ref?
 * @param {string} root
 * @param {string} templateRef
 * @param {string} pad
 */
function inTemplate(root, templateRef, pad) {
  const blob = gitOf(root, ['rev-parse', '--verify', '--quiet', `${templateRef}:${pad}`]);
  return blob !== undefined && blob === gitOf(root, ['hash-object', '--', pad]);
}

/**
 * De selectie van de volgorderegel, zonder de uitzondering voor een templatemigratie: de toegevoegde migraties die niet
 * later zijn dan de nieuwste versie in `bestaand`. Ook gebruikt door migratie-volgorde.mjs (de tweede bouw van check:snapshot).
 * @param {string} root
 * @param {string} bestaand de commit met de bestaande migraties
 * @returns {{ nieuwste: string | undefined, ouder: string[], toegevoegd: string[] }} paden; `toegevoegd` is elke toegevoegde
 *   migratie, `ouder` het deel dat niet later is dan `nieuwste`; beide leeg als `bestaand` geen migraties heeft
 */
export function ouderToegevoegd(root, bestaand) {
  const nieuwste = nieuwsteVersie(root, bestaand);
  if (nieuwste === undefined) return { nieuwste, ouder: [], toegevoegd: [] };
  const toegevoegd = wijzigingenSinds(root, bestaand)
    .filter(({ status }) => status === 'A')
    .map(({ pad }) => pad);
  const ouder = toegevoegd.filter((pad) => (NAAM.exec(path.posix.basename(pad))?.[1] ?? '99999999999999') <= nieuwste);
  return { nieuwste, ouder, toegevoegd };
}

/**
 * De volgorderegel: elke toegevoegde migratie is strikt later dan de nieuwste versie in `bestaand`.
 * @param {string} root
 * @param {Vergelijking} vergelijking
 * @returns {Oordeel}
 */
function volgorde(root, { bestaand, opMain, templateRef }) {
  const { nieuwste, ouder: geselecteerd } = ouderToegevoegd(root, bestaand);
  if (nieuwste === undefined) return { fouten: [], templateOntbreekt: false };
  const herstel = opMain
    ? 'hernoemen kan op main niet meer, herstel met een nieuwe migratie'
    : 'geef je eigen, nog niet gemergde migratie een nieuw tijdstempel (hernoem het bestand)';
  let ouder = geselecteerd;
  if (ouder.length > 0 && !isTemplate(root)) {
    if (gitOf(root, ['rev-parse', '--verify', '--quiet', `${templateRef}^{commit}`]) === undefined) {
      const fout = `${templateRef} is niet te lezen, dus niet te zien of ${ouder.join(', ')} (niet later dan de nieuwste bestaande versie ${nieuwste}) ongewijzigd uit de template komt; haal de template op (git fetch template main), of: ${herstel}`;
      return { fouten: [fout], templateOntbreekt: true };
    }
    ouder = ouder.filter((pad) => !inTemplate(root, templateRef, pad));
  }
  const fouten = ouder.map(
    (pad) => `${pad}: de versie is niet later dan de nieuwste bestaande versie ${nieuwste}; ${herstel}`,
  );
  return { fouten, templateOntbreekt: false };
}

/**
 * Waarmee de werkmap vergeleken wordt. Ook gebruikt door migratie-volgorde.mjs.
 * @param {string} root
 * @param {string} base
 * @returns {{ afsplitsing: string, bestaand: string | undefined, opMain: boolean } | undefined} undefined: `base` is niet
 *   te lezen. `bestaand`: de commit met de bestaande migraties; undefined op main bij een eerste commit zonder ouder.
 */
export function vergelijkingspunt(root, base) {
  const afsplitsing = gitOf(root, ['merge-base', base, 'HEAD']);
  if (afsplitsing === undefined) return undefined;
  // Op main zelf (HEAD is de base): wat de laatste commit toevoegde, moet later zijn dan wat zijn eerste ouder al had.
  const opMain =
    gitOf(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === gitOf(root, ['rev-parse', 'HEAD']);
  const bestaand = opMain ? gitOf(root, ['rev-parse', '--verify', '--quiet', 'HEAD^1^{commit}']) : afsplitsing;
  return { afsplitsing, bestaand, opMain };
}

/** @param {string} base */
export function baseOnleesbaar(base) {
  return `${base.replace(/^refs\/remotes\//, '')} is niet te lezen; haal hem op (git fetch origin main) of gebruik in CI fetch-depth: 0`;
}

/**
 * @param {string} [root]
 * @param {string} [base]
 * @param {string} [templateRef] de ref van de template; alleen gelezen in een app met een oudere toegevoegde migratie
 * @returns {Oordeel}
 */
export function migratieOordeel(root = '.', base = BASE, templateRef = TEMPLATE_REF) {
  const punt = vergelijkingspunt(root, base);
  if (punt === undefined) return { fouten: [baseOnleesbaar(base)], templateOntbreekt: false };
  const { afsplitsing, bestaand, opMain } = punt;
  const regels = migratieRegels(wijzigingenSinds(root, afsplitsing), readdirSync(path.join(root, DIR)));
  if (bestaand === undefined) return { fouten: regels, templateOntbreekt: false };
  const { fouten, templateOntbreekt } = volgorde(root, { bestaand, opMain, templateRef });
  return { fouten: [...regels, ...fouten], templateOntbreekt };
}

/**
 * @param {string} [root]
 * @param {string} [base]
 * @param {string} [templateRef]
 * @returns {string[]}
 */
export function migratieFouten(root = '.', base = BASE, templateRef = TEMPLATE_REF) {
  return migratieOordeel(root, base, templateRef).fouten;
}

/**
 * De template-URL uit `origin/main:.claude/gates.json` (spec template-repo AC-8), niet uit de werkmap: die komt van de PR.
 * Ontbrekend, onleesbaar of ongeldig: undefined.
 */
function vertrouwdeTemplateUrl() {
  const gates = gitOf('.', ['show', `${BASE}:.claude/gates.json`]);
  if (gates === undefined) return undefined;
  try {
    return templateUrl(gates);
  } catch {
    return undefined;
  }
}

/** De CLI-ingang: alleen als de lokale template-ref nodig is en ontbreekt (zoals in CI), de template zelf ophalen. */
function main() {
  let { fouten, templateOntbreekt } = migratieOordeel();
  if (templateOntbreekt) {
    const url = vertrouwdeTemplateUrl();
    if (url === undefined) {
      fouten = [...fouten, `template.repository ontbreekt of is ongeldig in origin/main:.claude/gates.json`];
    } else {
      try {
        git('.', ['fetch', '--no-tags', '--quiet', url, `+refs/heads/main:${OPGEHAALDE_REF}`]);
        ({ fouten } = migratieOordeel('.', BASE, OPGEHAALDE_REF));
      } catch {
        fouten = [...fouten, `${url} is niet op te halen (privé of onbereikbaar)`];
      }
    }
  }
  if (fouten.length > 0) {
    console.error(`✗ check:migrations\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
    process.exit(1);
  }
  console.info(
    `✓ check:migrations: geen gewijzigde of verwijderde migraties ten opzichte van origin/main, versies uniek, nieuwe migraties later dan de bestaande`,
  );
}

if (import.meta.main) main();
