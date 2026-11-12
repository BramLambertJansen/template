// CODEOWNERS uit de padtabel (ADR 0089 punt 2, spec templateregime AC-3): `.github/CODEOWNERS` is gegenereerd uit `paden` in
// `.claude/gates.json`. GitHub laat het laatste passende patroon winnen, de padtabel de strengste rij; daarom eerst
// `* @<eigenaar>`, dan elke glob met besluit `agent` zonder eigenaar, dan elke glob met een ander besluit met de eigenaar.
// Een pad heeft zo precies dan geen eigenaar als de padtabel het besluit `agent` geeft. Het besluit per rij komt uit
// `rijNiveau` (rails/hooks/lib/padtabel.mjs): een rij met alleen `schrijven` telt als `eigenaar`, een onleesbare als het strengste.
// check-docs eist dat het bestand gelijk is aan `codeownersTekst` voor de eerste handle uit `goedkeurders`.
// Gebruik: node scripts/kit/codeowners.mjs [--schrijf]   (zonder optie: de tekst op stdout; --schrijf: naar .github/CODEOWNERS)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUDE_VORM_ZONDER_PADEN, padenVan, rijNiveau } from '../../rails/hooks/lib/padtabel.mjs';

export const CODEOWNERS = '.github/CODEOWNERS';
export const HERSTEL = 'node scripts/kit/codeowners.mjs --schrijf';

const KOP = [
  '# Gegenereerd uit de padtabel `paden` in .claude/gates.json (ADR 0089, scripts/kit/codeowners.mjs); bewerk dit bestand niet.',
  '# Het laatste passende patroon wint: eerst alles van de eigenaar, dan de paden met besluit `agent` zonder eigenaar, dan elk',
  '# pad met een ander besluit weer met de eigenaar. De eigenaar is de eerste handle uit `goedkeurders`.',
  `# Bijwerken na een wijziging van de padtabel of de handle: ${HERSTEL}`,
];

/**
 * Waarom GitHub een glob anders leest dan de padtabel (`globMatch`), of null. Zo'n glob komt niet in CODEOWNERS: het
 * bestand zou dan iets anders beschermen dan de padtabel zegt.
 * @param {string} glob
 * @returns {string | null}
 */
function afwijkendeVorm(glob) {
  if (glob.split('/').some((segment) => segment.includes('**') && segment !== '**'))
    return '`**` midden in een segment';
  if (/[[\]]/.test(glob)) return '`[` of `]` (GitHub kent geen tekenklassen)';
  if (/\s/.test(glob)) return 'een spatie (scheidt in CODEOWNERS het patroon van de eigenaar)';
  return glob.startsWith('#') ? '`#` vooraan (commentaar in CODEOWNERS)' : null;
}

/**
 * Een glob uit de padtabel als CODEOWNERS-patroon: `**\/…` blijft zoals het is (elke diepte), `X/**` wordt de map `/X/`,
 * al het andere krijgt een `/` vooraan (alleen vanaf de root, zoals de padtabel).
 * Gooit bij een vorm die GitHub anders leest (`afwijkendeVorm`).
 * @param {string} glob
 */
function patroon(glob) {
  const reden = afwijkendeVorm(glob);
  if (reden !== null)
    throw new Error(
      `.claude/gates.json: paden.${glob}: ${reden} leest GitHub anders dan de padtabel; kies een andere glob`,
    );
  if (glob.startsWith('**/')) return glob;
  return glob.endsWith('/**') ? `/${glob.slice(0, -2)}` : `/${glob}`;
}

/**
 * De eerste handle uit `goedkeurders`, zonder `@`; null als die ontbreekt.
 * @param {unknown} gates de geparste gates.json
 * @returns {string | null}
 */
export function eersteGoedkeurder(gates) {
  const lijst =
    typeof gates === 'object' && gates !== null ? Object.entries(gates).find(([k]) => k === 'goedkeurders')?.[1] : null;
  const eerste = Array.isArray(lijst) ? lijst.find(() => true) : undefined;
  return typeof eerste === 'string' && eerste.replace(/^@/, '') !== '' ? eerste.replace(/^@/, '') : null;
}

/**
 * De tekst van `.github/CODEOWNERS` voor een padtabel. Gooit in de oude vorm (zonder `paden`) en zoals `padenVan`.
 * @param {unknown} gates de geparste gates.json
 * @param {string} eigenaar de handle, zonder `@`
 * @returns {string}
 */
export function codeownersTekst(gates, eigenaar) {
  const paden = padenVan(gates);
  if (paden === null) throw new Error(OUDE_VORM_ZONDER_PADEN);
  const rijen = Object.entries(paden).map(([glob, rij]) => ({
    patroon: patroon(glob),
    besluit: rijNiveau(rij).besluit,
  }));
  const breedte = Math.max(1, ...rijen.map((rij) => rij.patroon.length));
  /** @param {string} tekst */
  const metEigenaar = (tekst) => `${tekst.padEnd(breedte)} @${eigenaar}`;
  return [
    ...KOP,
    metEigenaar('*'),
    ...rijen.filter((rij) => rij.besluit === 'agent').map((rij) => rij.patroon),
    ...rijen.filter((rij) => rij.besluit !== 'agent').map((rij) => metEigenaar(rij.patroon)),
    '',
  ].join('\n');
}

/**
 * Eén segment van een patroon als regex-bron: `*` nul of meer tekens binnen het segment, `?` één teken.
 * @param {string} segment
 */
function segmentBron(segment) {
  return [...segment]
    .map((teken) => {
      if (teken === '*') return '[^/]*';
      return teken === '?' ? '[^/]' : teken.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

/**
 * De segmenten van een patroon als regex-bron. `**` als heel segment is nul of meer mappen: vooraan `(?:.*\/)?`, achteraan
 * alles eronder, ertussen `/(?:.*\/)?`.
 * @param {readonly string[]} delen
 */
function delenBron(delen) {
  return delen
    .map((deel, index) => {
      const laatste = index === delen.length - 1;
      if (deel !== '**') return segmentBron(deel) + (laatste ? '' : '/');
      return laatste ? '.*' : '(?:.*/)?';
    })
    .join('');
}

/**
 * De matchregels van CODEOWNERS (gitignore-achtig): een patroon zonder `/` (behalve aan het eind) geldt op elke diepte, met
 * een `/` vooraan of ertussen alleen vanaf de root; een `/` aan het eind is een map en dekt alles eronder; een patroon dat
 * een map raakt, dekt ook alles eronder, behalve als het op `/*` eindigt (alleen de bestanden direct in die map).
 * @param {string} ruw het patroon zoals het in CODEOWNERS staat
 * @returns {RegExp}
 */
function patroonRegex(ruw) {
  const map = ruw.endsWith('/');
  const zonderEind = map ? ruw.slice(0, -1) : ruw;
  const verankerd = zonderEind.includes('/');
  const delen = zonderEind.replace(/^\//, '').split('/');
  const direct = !map && delen.length > 1 && delen.at(-1) === '*';
  const eronder = direct ? '' : `(?:/.*)${map ? '' : '?'}`;
  return new RegExp(`^${verankerd ? '' : '(?:.*/)?'}${delenBron(delen)}${eronder}$`);
}

/**
 * De eigenaar van een pad volgens een CODEOWNERS-tekst: het laatste passende patroon wint; een patroon zonder eigenaar
 * heft een eerder patroon op. Commentaar en lege regels tellen niet.
 * @param {string} tekst de inhoud van CODEOWNERS
 * @param {string} pad relatief pad vanaf de root, met `/`
 * @returns {string | null} de eigenaars van de winnende regel (zoals ze er staan, met `@`), of null
 */
export function eigenaarVan(tekst, pad) {
  const regels = tekst
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel !== '' && !regel.startsWith('#'))
    .map((regel) => regel.split(/\s+/));
  const winnaar = regels.findLast(([eerste = '']) => patroonRegex(eerste).test(pad));
  const rest = winnaar === undefined ? [] : winnaar.slice(1);
  const commentaar = rest.findIndex((deel) => deel.startsWith('#'));
  const eigenaars = commentaar === -1 ? rest : rest.slice(0, commentaar);
  return eigenaars.length === 0 ? null : eigenaars.join(' ');
}

function main() {
  const root = path.join(import.meta.dirname, '../..');
  /** @type {unknown} */
  const gates = JSON.parse(readFileSync(path.join(root, '.claude/gates.json'), 'utf8'));
  const eigenaar = eersteGoedkeurder(gates);
  if (eigenaar === null) throw new Error('.claude/gates.json: goedkeurders is leeg; zonder handle geen CODEOWNERS');
  const tekst = codeownersTekst(gates, eigenaar);
  if (!process.argv.includes('--schrijf')) {
    process.stdout.write(tekst);
    return;
  }
  writeFileSync(path.join(root, CODEOWNERS), tekst);
  console.log(`✓ ${CODEOWNERS} geschreven voor @${eigenaar}`);
}

if (import.meta.main) main();
