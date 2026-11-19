// check-policies (AGENTS.md "elke policy een pgTAP-test op naam", framework §6): elke RLS-policy in de database heeft in
// db/tests/*.sql een assert waarvan de beschrijving met de policynaam begint ('<naam>: …'). De lijst policies komt uit
// pg_policies van de gemigreerde test-database (test/datapad/policies.int.test.ts, in pnpm test:db).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Policies zonder assert die hun naam noemt.
 * @param {readonly string[]} policies
 * @param {readonly string[]} testSources de tekst van de pgTAP-bestanden
 * @returns {string[]}
 */
export function policiesZonderTest(policies, testSources) {
  return policies.filter((name) => !testSources.some((source) => source.includes(`'${name}: `)));
}

/**
 * De pgTAP-bestanden met hun naam.
 * @param {string} [root]
 * @returns {{ naam: string, tekst: string }[]}
 */
function pgTapBestanden(root = '.') {
  const dir = path.join(root, 'db/tests');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => ({ naam: file, tekst: readFileSync(path.join(dir, file), 'utf8') }));
}

/** @param {string} [root] */
export function pgTapBronnen(root = '.') {
  return pgTapBestanden(root).map(({ tekst }) => tekst);
}

// pgTAP-vorm (R-TEST-05, spec proza-checks AC-10 tot AC-12): na `begin;` en psql-metaregels eerst de search_path, en de
// plan vóór de eerste `set local role`. Alleen regels buiten een `$$`-blok en buiten commentaar tellen; een `plan(` of rol
// midden in een regel (format, execute) telt niet. Strikt in `pnpm ratchet`: komt nooit in de baseline.
const PGTAP_MELDING =
  'pgTAP-vorm (R-TEST-05): na `begin;` eerst `set search_path = tap, public;`, en `select plan(<n>);` vóór de eerste `set local role`; geen no_plan().';
const SEARCH_PATH = /^set\s+search_path\s*=\s*tap\s*,\s*public\s*;/i;
const PLAN = /^select\s+plan\s*\(/i;
const NO_PLAN = /^select\s+no_plan\s*\(/i;
const ROL = /^set\s+local\s+role\b/i;

/**
 * De regels van een pgTAP-bestand die als statement tellen: zonder lege regels, commentaar, psql-metaregels, `begin;` en
 * zonder de binnenkant van een `$$`-blok (de regel die het blok opent telt wel).
 * @param {string} tekst
 * @returns {string[]}
 */
function pgTapStatements(tekst) {
  /** @type {string[]} */
  const regels = [];
  let inBlok = false;
  for (const ruw of tekst.split('\n')) {
    const regel = ruw.trim();
    const wissel = (regel.split('$$').length - 1) % 2 === 1;
    if (!inBlok && regel !== '' && !regel.startsWith('--') && !regel.startsWith('\\') && !/^begin\s*;/i.test(regel))
      regels.push(regel);
    if (wissel) inBlok = !inBlok;
  }
  return regels;
}

/**
 * De eerste reden waarom een pgTAP-bestand niet de vorm van R-TEST-05 heeft, of null.
 * @param {string} tekst
 * @returns {string | null}
 */
function pgTapVormReden(tekst) {
  const regels = pgTapStatements(tekst);
  if (!SEARCH_PATH.test(regels[0] ?? '')) return 'search_path';
  if (regels.some((regel) => NO_PLAN.test(regel))) return 'no_plan';
  const plan = regels.findIndex((regel) => PLAN.test(regel));
  if (plan === -1) return 'plan ontbreekt';
  const rol = regels.findIndex((regel) => ROL.test(regel));
  return rol !== -1 && rol < plan ? 'plan na set local role' : null;
}

/**
 * Overtredingen van de pgTAP-vorm in `<root>/db/tests/*.sql`; zonder die map geen.
 * @param {string} root
 * @returns {{ key: string, message: string }[]}
 */
export function pgTapVormViolations(root) {
  if (!existsSync(path.join(root, 'db/tests'))) return [];
  return pgTapBestanden(root).flatMap(({ naam, tekst }) => {
    const reden = pgTapVormReden(tekst);
    return reden === null ? [] : [{ key: `db/tests/${naam}: ${reden}`, message: PGTAP_MELDING }];
  });
}
