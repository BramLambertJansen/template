// ac-toets (spec ac-toets, leerpunt #793): een acceptatiecriterium dat tegenover `git merge-base origin/main HEAD` nieuw
// of gewijzigd is, noemt achter `Toets:` een testbestand. Strikt kanaal van `pnpm ratchet`: nooit in .kit/baseline.json.
// Bestaande, ongewijzigde AC's hoeven het veld niet te hebben (besluit eigenaar 2026-11-19).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SPEC_BESTAND, SPEC_STATUS, TESTBESTAND, vervallenAcs } from './check-docs.mjs';
import { leesHernoemingen } from './onderdrukkingen.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {{ id: string, regel: number, tekst: string }} AcItem */

// Een AC-item: `- **<ns>/AC-n**` in kolom 0 plus de vervolgregels tot een regel die met `-` of `#` begint of leeg is,
// dezelfde grens als `NIEUWE_AC` in check-docs.mjs.
const AC_ITEM = /^- \*\*([a-z0-9][\w.-]*)\/(AC-\d+)\*\*[^\n]*(?:\n(?![-#]|[ \t]*$)[^\n]*)*/gm;
// De merktekens van regel 14 tellen niet als wijziging (besluit eigenaar 2026-11-19).
const MERKTEKEN = /\s*\((?:vervallen|nieuw|voorbeeld)\)/g;
// Niet direct na een backtick: `` `Toets:` `` als code in de tekst is geen veld en mag het echte veld niet opslokken.
const TOETS = /(?<!`)Toets:\s+`([^`\n]*)`/g;
const MET_EXTENSIE = /[^/]+\.[a-z0-9]+$/i;
const GEEN_BASIS = 'geen merge-base met origin/main; ac-toets toetst niets';

/** Witruimte wordt één spatie en de merktekens vallen weg (ac-toets/AC-2). @param {string} tekst */
export function normaliseer(tekst) {
  return tekst.replace(MERKTEKEN, '').replace(/\s+/g, ' ').trim();
}

/** Minstens één `Toets:` met een testpad tussen backticks, met extensie en zonder plaatshouder (ac-toets/AC-1). @param {string} tekst */
export function geldigeToets(tekst) {
  return [...tekst.matchAll(TOETS)].some(
    ([, pad = '']) => !pad.includes('<') && TESTBESTAND.test(pad) && MET_EXTENSIE.test(pad),
  );
}

/**
 * De AC-items van de eigen namespace, met regelnummer en genormaliseerde tekst.
 * @param {string} tekst @param {ReadonlySet<string | undefined>} eigen @returns {AcItem[]}
 */
export function acItems(tekst, eigen) {
  const schoon = tekst.replaceAll('\r\n', '\n');
  return [...schoon.matchAll(AC_ITEM)]
    .filter(([, naam]) => eigen.has(naam))
    .map((match) => ({
      id: match[2] ?? '',
      regel: schoon.slice(0, match.index).split('\n').length,
      tekst: normaliseer(match[0]),
    }));
}

/** @param {string} file @param {string} tekst */
function eigenNamen(file, tekst) {
  return new Set([path.basename(file, '.md'), /^namespace:\s*(\S+)\s*$/m.exec(tekst)?.[1]]);
}

/**
 * Overtredingen van één spec: nieuwe of gewijzigde items zonder geldige `Toets:`, behalve vervallen AC's (ac-toets/AC-4).
 * @param {{ file: string, nu: string, toen: { file: string, tekst: string } | null }} spec
 * @param {ReadonlySet<string>} vervallen
 * @returns {Violation[]}
 */
export function specViolations({ file, nu, toen }, vervallen) {
  if (SPEC_STATUS.exec(nu)?.[1] === 'vervallen') return [];
  const oud = new Set(
    toen === null ? [] : acItems(toen.tekst, eigenNamen(toen.file, toen.tekst)).map((item) => item.tekst),
  );
  return acItems(nu, eigenNamen(file, nu))
    .filter((item) => !vervallen.has(item.id) && !oud.has(item.tekst) && !geldigeToets(item.tekst))
    .map((item) => ({
      key: `docs:ac-toets:${file}:${String(item.regel)}:${item.id}`,
      message: `${file}:${String(item.regel)}: ${item.id} is nieuw of gewijzigd en noemt geen testbestand; eindig het item met Toets: \`<testbestand>\` (spec ac-toets)`,
    }));
}

/** @param {string} root @param {readonly string[]} args @returns {string | null} */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** @param {string} root */
function basisVan(root) {
  const basis = git(root, ['merge-base', 'refs/remotes/origin/main', 'HEAD'])?.trim();
  return basis === undefined || basis === '' ? null : basis;
}

/** @param {string} root @param {string} file */
function lees(root, file) {
  return existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null;
}

/**
 * Strikt kanaal van `pnpm ratchet` (ac-toets/AC-1 t/m AC-5): getrackte specs in de werkmap tegenover de merge-base, met
 * hernoemingen volgens `git diff -M`; zonder basis in CI rood (`GITHUB_ACTIONS`), lokaal niets (de melding staat apart).
 * @param {string} root @param {boolean} inCi @returns {Violation[]}
 */
export function acToetsUitGit(root, inCi) {
  const basis = basisVan(root);
  if (basis === null)
    return inCi ? [{ key: 'docs:ac-toets:geen-basis', message: `${GEEN_BASIS} (ac-toets/AC-5)` }] : [];
  const getrackt = (git(root, ['ls-files', '-z']) ?? '').split('\0').filter((file) => file !== '');
  const status = git(root, ['diff', '-M', '--name-status', '-z', basis]);
  const hernoemd = leesHernoemingen(status ?? '');
  // Alleen specs die tegenover de basis veranderd zijn (een ongewijzigde spec heeft geen nieuwe AC); faalt git, dan
  // toetst de check alles in plaats van stil groen te zijn.
  const gewijzigd = status === null ? null : new Set(status.split('\0'));
  const read = (/** @type {string} */ file) => lees(root, file) ?? '';
  return getrackt
    .filter(
      (file) => SPEC_BESTAND.test(file) && (gewijzigd === null || gewijzigd.has(file)) && lees(root, file) !== null,
    )
    .flatMap((file) => {
      const nu = read(file);
      const oudPad = hernoemd.get(file) ?? file;
      const oudeTekst = git(root, ['show', `${basis}:${oudPad}`]);
      const toen = oudeTekst === null ? null : { file: oudPad, tekst: oudeTekst };
      const vervallen = vervallenAcs({ file, text: nu, eigen: eigenNamen(file, nu) }, getrackt, read);
      return specViolations({ file, nu, toen }, vervallen);
    });
}

/** De "let op"-regel zonder merge-base (ac-toets/AC-5). @param {string} root @returns {string[]} */
export function acToetsMeldingen(root) {
  return basisVan(root) === null ? [`let op: ${GEEN_BASIS}`] : [];
}

// Los gedraaid zou dit bestand niets melden en met 0 eindigen; alleen de ratchet roept de check aan (leerpunt #752).
if (import.meta.main) {
  console.error('✗ ac-toets draait alleen via de ratchet: gebruik `pnpm ratchet`.');
  process.exitCode = 1;
}
