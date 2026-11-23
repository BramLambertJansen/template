// vergeten-gebouwd (spec gebouwd-zonder-nummer AC-15, leerpunt #756): een "let op"-melding van `docsMeldingen` als een
// PR een testregel toevoegt met een AC-id van een spec die nog `goedgekeurd` is (a), of van een AC die in een gebouwde spec
// nog `(nog niet gebouwd)` draagt (b). Nooit een overtreding. Een toegevoegde regel is een `+`-regel uit
// `git diff -M <merge-base>` (werkmap, ook ongecommit) of elke regel van een niet-getrackt testbestand; zonder merge-base
// met origin/main zegt de check niets (ac-toets meldt dat al).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { acIds } from '../../rails/hooks/lib/document-state.mjs';
import { heelWoord, SPEC_BESTAND, SPEC_STATUS, TESTBESTAND } from './check-docs.mjs';

/** @typedef {{ file: string, status: string | undefined, eigen: Set<string>, gemarkeerd: Set<string> }} Spec */
/** @typedef {{ voor: string, ac: string }} Vondst */

// Een AC-id met voorvoegsel; `heelWoord` beslist daarna of het als heel woord in de regel staat.
const KANDIDAAT = /([\w.-]+)\/(AC-\d+)/g;

/** @param {string} root @param {readonly string[]} args @returns {string | null} */
function git(root, args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

/** @param {string} root @param {readonly string[]} args */
const lijst = (root, args) => (git(root, args) ?? '').split('\0').filter((file) => file !== '');

/** @param {string} root @param {string} file */
function lees(root, file) {
  return existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null;
}

/**
 * De toegevoegde regels per testbestand uit `git diff -M --unified=0` tegen de basis (een hernoemd bestand zonder
 * inhoudswijziging heeft geen hunk). @param {string} diff @returns {Map<string, string[]>}
 */
export function toegevoegdeRegels(diff) {
  /** @type {Map<string, string[]>} */
  const regels = new Map();
  let bestand = null;
  let kop = false;
  for (const regel of diff.split('\n')) {
    if (regel.startsWith('diff --git ')) [kop, bestand] = [true, null];
    else if (regel.startsWith('@@')) kop = false;
    else if (kop && regel.startsWith('+++ ')) {
      const doel = regel.slice(4).replace(/\t$/, '');
      bestand = doel.startsWith('b/') && TESTBESTAND.test(doel.slice(2)) ? doel.slice(2) : null;
    } else if (bestand !== null && regel.startsWith('+')) {
      regels.set(bestand, [...(regels.get(bestand) ?? []), regel.slice(1)]);
    }
  }
  return regels;
}

/** @param {string} file @param {string} tekst @returns {Spec} */
function specInfo(file, tekst) {
  const eigen = new Set([path.basename(file, '.md')]);
  const namespace = /^namespace:\s*(\S+)\s*$/m.exec(tekst)?.[1];
  if (namespace !== undefined) eigen.add(namespace);
  const gemarkeerd = new Set(
    [...acIds(tekst).gemarkeerd].filter((id) => eigen.has(id.split('/')[0] ?? '')).map((id) => id.replace(/^.*\//, '')),
  );
  return { file, status: SPEC_STATUS.exec(tekst)?.[1], eigen, gemarkeerd };
}

/** De AC-id's als heel woord in de regels. @param {readonly string[]} regels @returns {Vondst[]} */
export function vondsten(regels) {
  return regels.flatMap((regel) =>
    [...regel.matchAll(KANDIDAAT)]
      .filter(([, voor = '', ac = '']) => heelWoord(`${voor}/${ac}`).test(regel))
      .map(([, voor = '', ac = '']) => ({ voor, ac })),
  );
}

/** Voldoet deze vondst aan (a) of (b)? @param {Spec} spec @param {Vondst} vondst */
function voldoet(spec, { voor, ac }) {
  if (!spec.eigen.has(voor)) return false;
  return spec.status === 'goedgekeurd' || (spec.status === 'gebouwd' && spec.gemarkeerd.has(ac));
}

/** @param {Spec} spec @param {string} testpad @param {string} id */
function melding(spec, testpad, id) {
  return spec.status === 'goedgekeurd'
    ? `let op: ${spec.file} staat op goedgekeurd, maar ${testpad} voegt ${id} toe; maakt deze PR de spec af, zet dan status: gebouwd (R-WERK-08, ADR 0095)`
    : `let op: ${spec.file} markeert ${id} nog met (nog niet gebouwd), maar ${testpad} voegt die AC toe; maakt deze PR de AC af, haal dan het merkteken weg (R-WERK-08, ADR 0095)`;
}

/**
 * Eén melding per spec en testbestand, met de laagste AC die voldoet.
 * @param {readonly Spec[]} specs @param {ReadonlyMap<string, readonly string[]>} perTest @returns {string[]}
 */
export function meldingenVoor(specs, perTest) {
  return [...perTest].flatMap(([testpad, regels]) => {
    const gevonden = vondsten(regels).toSorted((a, b) => Number(a.ac.slice(3)) - Number(b.ac.slice(3)));
    return specs.flatMap((spec) => {
      const eerste = gevonden.find((vondst) => voldoet(spec, vondst));
      return eerste === undefined ? [] : [melding(spec, testpad, `${eerste.voor}/${eerste.ac}`)];
    });
  });
}

/**
 * De meldingen van AC-15 voor de werkmap in `root`; zonder merge-base met origin/main geen.
 * @param {string} root @returns {string[]}
 */
export function vergetenGebouwdMeldingen(root) {
  const basis = git(root, ['merge-base', 'refs/remotes/origin/main', 'HEAD'])?.trim() ?? '';
  if (basis === '') return [];
  // Vaste prefixen: `diff.mnemonicPrefix` of `diff.noprefix` in de gitconfig van de gebruiker veranderen de `+++`-kop.
  const prefix = ['--src-prefix=a/', '--dst-prefix=b/'];
  const diff = git(root, ['diff', '-M', '--unified=0', '--no-color', '--no-ext-diff', ...prefix, basis]) ?? '';
  const perTest = toegevoegdeRegels(diff);
  const los = lijst(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  for (const file of los.filter((pad) => TESTBESTAND.test(pad)))
    perTest.set(file, (lees(root, file) ?? '').split('\n'));
  const specs = [...lijst(root, ['ls-files', '-z']), ...los]
    .filter((file) => SPEC_BESTAND.test(file))
    .flatMap((file) => {
      const tekst = lees(root, file);
      return tekst === null ? [] : [specInfo(file, tekst)];
    });
  return meldingenVoor(specs, perTest);
}

// Los gedraaid zou dit bestand niets melden en met 0 eindigen; alleen de ratchet roept de check aan (leerpunt #752).
if (import.meta.main) {
  console.error('✗ vergeten-gebouwd draait alleen via de ratchet: gebruik `pnpm ratchet`.');
  process.exitCode = 1;
}
