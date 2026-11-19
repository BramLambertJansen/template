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
// plan vóór de eerste `set local role`. Alleen regels die in code beginnen tellen (niet in tekst, dollar-quote of
// commentaar); een `plan(` of rol midden in een regel (format, execute) telt niet. Strikt in `pnpm ratchet`: komt nooit in
// de baseline.
const PGTAP_MELDING =
  'pgTAP-vorm (R-TEST-05): na `begin;` eerst `set search_path = tap, public;`, en `select plan(<n>);` vóór de eerste `set local role`; geen no_plan().';
const SEARCH_PATH = /^set\s+search_path\s*=\s*tap\s*,\s*public\s*;/i;
const PLAN = /^select\s+plan\s*\(/i;
const NO_PLAN = /^select\s+no_plan\s*\(/i;
const ROL = /^set\s+local\s+role\b/i;

// Een kleine SQL-scanner volgens de tokenisatie van Postgres, met status die over regels doorloopt: `--`-commentaar (rest
// van de regel), `/* … */` (genest), tekst '…' met '', E'…' met \' en \\, een naam "…" met "", en dollar-quotes
// `$tag$ … $tag$` (tag leeg of een identifier; sluit alleen met dezelfde tag). Binnen tekst, naam, dollar-quote of
// commentaar is alles tekst. Een `$` of `E` direct na een identifierteken hoort bij die identifier (`a$$`, `somE'`).
/** @typedef {'code' | 'tekst' | 'etekst' | 'naam' | 'dollar' | 'blok'} ScanModus */
/** @typedef {{ modus: ScanModus, tag: string, diepte: number }} ScanStatus */

const IDENT_TEKEN = /[\p{L}\p{N}_$]/u;
const DOLLAR_TAG = /^\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/u;

/**
 * Of positie `i` los staat van een voorafgaande identifier.
 * @param {string} regel
 * @param {number} i
 */
function losstaand(regel, i) {
  return i === 0 || !IDENT_TEKEN.test(regel.charAt(i - 1));
}

/**
 * Een stap in code: opent commentaar, tekst, naam of dollar-quote, of schuift één teken op.
 * @param {string} regel
 * @param {number} i
 * @param {ScanStatus} s
 * @returns {number} de volgende positie
 */
function stapCode(regel, i, s) {
  const teken = regel.charAt(i);
  if (regel.startsWith('--', i)) return regel.length;
  if (regel.startsWith('/*', i)) {
    s.modus = 'blok';
    s.diepte = 1;
    return i + 2;
  }
  if (teken === "'") s.modus = 'tekst';
  else if (teken === '"') s.modus = 'naam';
  else if ((teken === 'E' || teken === 'e') && regel.charAt(i + 1) === "'" && losstaand(regel, i)) {
    s.modus = 'etekst';
    return i + 2;
  } else if (teken === '$' && losstaand(regel, i)) return opentDollar(regel, i, s);
  return i + 1;
}

/**
 * Opent een dollar-quote als op `i` een `$tag$` staat.
 * @param {string} regel
 * @param {number} i
 * @param {ScanStatus} s
 * @returns {number}
 */
function opentDollar(regel, i, s) {
  const tag = DOLLAR_TAG.exec(regel.slice(i));
  if (tag === null) return i + 1;
  s.modus = 'dollar';
  s.tag = tag[0];
  return i + tag[0].length;
}

/**
 * Een stap in tekst, E-tekst of naam: een verdubbeld afsluitteken blijft erin, een enkel sluit; in E-tekst slaat `\` het
 * volgende teken over (ook een regeleinde).
 * @param {string} regel
 * @param {number} i
 * @param {ScanStatus} s
 * @returns {number}
 */
function stapQuote(regel, i, s) {
  const sluit = s.modus === 'naam' ? '"' : "'";
  const teken = regel.charAt(i);
  if (s.modus === 'etekst' && teken === '\\') return i + 2;
  if (teken !== sluit) return i + 1;
  if (regel.charAt(i + 1) === sluit) return i + 2;
  s.modus = 'code';
  return i + 1;
}

/**
 * Een stap in een dollar-quote: alleen dezelfde tag sluit.
 * @param {string} regel
 * @param {number} i
 * @param {ScanStatus} s
 * @returns {number}
 */
function stapDollar(regel, i, s) {
  const einde = regel.indexOf(s.tag, i);
  if (einde === -1) return regel.length;
  s.modus = 'code';
  return einde + s.tag.length;
}

/**
 * Een stap in `/* … *\/`-commentaar, genest zoals in Postgres.
 * @param {string} regel
 * @param {number} i
 * @param {ScanStatus} s
 * @returns {number}
 */
function stapBlok(regel, i, s) {
  if (regel.startsWith('/*', i)) s.diepte += 1;
  else if (regel.startsWith('*/', i)) s.diepte -= 1;
  else return i + 1;
  if (s.diepte === 0) s.modus = 'code';
  return i + 2;
}

/** @type {Record<ScanModus, (regel: string, i: number, s: ScanStatus) => number>} */
const STAPPEN = {
  code: stapCode,
  tekst: stapQuote,
  etekst: stapQuote,
  naam: stapQuote,
  dollar: stapDollar,
  blok: stapBlok,
};

/**
 * Scant één regel en werkt de status bij.
 * @param {string} regel
 * @param {ScanStatus} s
 */
function scanRegel(regel, s) {
  let i = 0;
  while (i < regel.length) i = STAPPEN[s.modus](regel, i, s);
}

/**
 * Of een regel die in code begint als statement telt: niet leeg, geen commentaar, geen psql-metaregel, geen `begin;`.
 * @param {string} regel
 */
function isStatementRegel(regel) {
  return (
    regel !== '' &&
    !regel.startsWith('--') &&
    !regel.startsWith('/*') &&
    !regel.startsWith('\\') &&
    !/^begin\s*;/i.test(regel)
  );
}

/**
 * De regels van een pgTAP-bestand die als statement tellen: regels die (na witruimte) in code beginnen, dus niet in
 * tekst, een naam, een dollar-quote of commentaar, zonder lege regels, commentaarregels, psql-metaregels en `begin;`.
 * Een psql-metaregel (`\set …`) leest psql zelf tot het regeleinde; de scanner slaat hem over.
 * @param {string} tekst
 * @returns {string[]}
 */
function pgTapStatements(tekst) {
  /** @type {string[]} */
  const regels = [];
  /** @type {ScanStatus} */
  const status = { modus: 'code', tag: '', diepte: 0 };
  for (const ruw of tekst.split('\n')) {
    const regel = ruw.trim();
    const inCode = status.modus === 'code';
    if (inCode && isStatementRegel(regel)) regels.push(regel);
    if (!(inCode && regel.startsWith('\\'))) scanRegel(regel, status);
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
