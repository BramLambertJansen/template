// Schaduwmodus met tijdgrens (spec schaduwmodus, ADR 0106): een nieuwe controle mag hoogstens 14 dagen alleen loggen. Ze
// staat dan in `.kit/schaduw.json`. Twee strikte kanalen van `pnpm ratchet`: `schaduw-register` (het schema en de
// vergelijking met `git merge-base origin/main HEAD`) en `schaduw-termijn` (de commitdatum van HEAD tegen `eind`, en de
// uitvoerders uit de map `schaduw` van de ratchet). Plus twee meldingenkanalen: `schaduw-termijn` ("loopt af") en `schaduw`
// (de treffers). In een app (`.claude/gates.json` zonder `onderhoud`) doet alles niets en draaien de uitvoerders niet; een
// onleesbare of ongeldige gates.json laat de check gooien (`isTemplate`). Een repo zonder gates.json heeft geen `onderhoud`
// en geldt als app, zoals in check-docs (`files.includes('.claude/gates.json')`).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isTemplate } from './template-release.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {Record<string, unknown>} Regel */
/** @typedef {Record<string, () => Promise<unknown>>} Uitvoerders */
/** @typedef {{ treffers: string[] } | null} Uitkomst null: draaide niet volledig */

export const REGISTER = '.kit/schaduw.json';
const SPEC_MAP = 'docs/template/specs/';
const NAAM = /^[a-z][a-z0-9-]{0,63}$/;
const RID = /^R-[A-Z]+-\d{2}$/;
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAG = 24 * 60 * 60 * 1000;
const MAX_DAGEN = 14;
const WAARSCHUW_DAGEN = 3;
const SOORTEN = new Set(['hook', 'check', 'lintregel']);
const VELDEN = ['naam', 'soort', 'spec', 'rids', 'start', 'eind', 'drempel', 'aangepast'];
const DREMPELS = ['hard', 'aanpassen', 'verwijderen'];
const GEEN_BASIS =
  'geen merge-base met origin/main; schaduw-register vergelijkt aangepast, start, eind en drempel niet';

/**
 * Wat nooit in schaduw mag (ADR 0106 punt 2): elk id met een van de voorvoegsels, plus de losse ids. Bij twijfel hoort een
 * id erbij.
 */
export const ALTIJD_HARD = Object.freeze({
  voorvoegsels: Object.freeze(['R-AUTH-', 'R-ROL-']),
  ids: Object.freeze([
    'R-WERK-09',
    'R-CODE-03',
    'R-TEST-02',
    'R-TEST-03',
    'R-TEST-04',
    'R-DB-01',
    'R-DB-05',
    'R-DB-09',
    'R-CODE-08',
    'R-SEC-01',
    'R-SEC-02',
    'R-SEC-03',
    'R-SEC-04',
    'R-SEC-05',
    'R-SEC-06',
    'R-SEC-08',
    'R-LAAG-08',
    'R-CI-01',
    'R-CI-07',
    'R-REPO-02',
    'R-PRINC-04',
  ]),
});

/** De template: gates.json met `onderhoud`; zonder gates.json geen template, onleesbaar of ongeldig gooit. @param {string} root */
function inTemplate(root) {
  return existsSync(path.join(root, '.claude/gates.json')) && isTemplate(root);
}

/** @param {string} rid */
export function altijdHard(rid) {
  return ALTIJD_HARD.ids.includes(rid) || ALTIJD_HARD.voorvoegsels.some((voorvoegsel) => rid.startsWith(voorvoegsel));
}

/** @param {unknown} value @returns {value is Regel} */
function isRegel(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Dagen sinds 1970 in UTC voor `JJJJ-MM-DD`, of null als het geen geldige datum is. @param {unknown} value */
function dagnummer(value) {
  const match = typeof value === 'string' ? DATUM.exec(value) : null;
  if (match === null) return null;
  const [jaar, maand, dag] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(jaar, maand - 1, dag);
  const terug = new Date(ms);
  return terug.getUTCFullYear() === jaar && terug.getUTCMonth() === maand - 1 && terug.getUTCDate() === dag
    ? ms / DAG
    : null;
}

/** @param {unknown} value */
function geldigeDrempel(value) {
  if (!isRegel(value)) return false;
  const sleutels = Object.keys(value);
  return (
    sleutels.length === DREMPELS.length &&
    DREMPELS.every((naam) => typeof value[naam] === 'string' && value[naam] !== '')
  );
}

/** @type {Record<string, (value: unknown) => boolean>} */
const VORM = {
  naam: (value) => typeof value === 'string' && NAAM.test(value),
  soort: (value) => typeof value === 'string' && SOORTEN.has(value),
  spec: (value) => typeof value === 'string' && value !== '',
  rids: (value) =>
    Array.isArray(value) && value.length > 0 && value.every((rid) => typeof rid === 'string' && RID.test(rid)),
  start: (value) => dagnummer(value) !== null,
  eind: (value) => dagnummer(value) !== null,
  drempel: geldigeDrempel,
  aangepast: (value) => value === 0 || value === 1,
};

/** @param {string} root @param {readonly string[]} args @returns {string | null} */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** @param {string} root */
function basisVan(root) {
  const basis = git(root, ['merge-base', 'refs/remotes/origin/main', 'HEAD'])?.trim();
  return basis === undefined || basis === '' ? null : basis;
}

/** @param {string} tekst @returns {unknown[] | null} */
function lijstUit(tekst) {
  try {
    /** @type {unknown} */
    const waarde = JSON.parse(tekst);
    return Array.isArray(waarde) ? waarde : null;
  } catch {
    return null;
  }
}

/** Het register in de werkmap: de lijst, of `ontbreekt` / `geen-lijst`. @param {string} root */
function leesRegister(root) {
  const bestand = path.join(root, REGISTER);
  if (!existsSync(bestand)) return { fout: 'ontbreekt', regels: [] };
  const regels = lijstUit(readFileSync(bestand, 'utf8'));
  return regels === null ? { fout: 'geen-lijst', regels: [] } : { fout: null, regels };
}

/** @param {string} naam @param {string} reden @param {string} message @returns {Violation} */
function fout(naam, reden, message) {
  return { key: `${naam}:${reden}`, message: `${naam}: ${message}` };
}

/** Velden die ontbreken, de vorm missen of onbekend zijn. @param {Regel} regel @param {string} naam */
function veldFouten(regel, naam) {
  const vorm = VELDEN.filter((veld) => !(VORM[veld]?.(regel[veld]) ?? false)).map((veld) =>
    fout(naam, `veld ${veld}`, `veld ${veld} ontbreekt of heeft niet de vorm uit de spec schaduwmodus`),
  );
  const onbekend = Object.keys(regel)
    .filter((veld) => !VELDEN.includes(veld))
    .map((veld) => fout(naam, `onbekend veld ${veld}`, `onbekend veld ${veld}`));
  return [...vorm, ...onbekend];
}

/** De termijn van 14 dagen (ADR 0106 punt 3). @param {Regel} regel @param {string} naam @returns {Violation[]} */
function termijnFouten(regel, naam) {
  const [start, eind] = [dagnummer(regel['start']), dagnummer(regel['eind'])];
  if (start === null || eind === null) return [];
  const tekst = `einddatum ${String(regel['eind'])}`;
  if (eind < start) return [fout(naam, 'eind voor start', `${tekst} ligt vóór de start ${String(regel['start'])}`)];
  if (eind - start > MAX_DAGEN)
    return [
      fout(naam, 'termijn', `${tekst} ligt meer dan 14 dagen na de start ${String(regel['start'])} (ADR 0106 punt 3)`),
    ];
  return [];
}

/**
 * Een bestaand `.md`-bestand onder de specmap, al genormaliseerd zodat `..` de mapcontrole niet omzeilt (B-8).
 * @param {string} root @param {string} spec
 */
function geldigeSpec(root, spec) {
  if (path.posix.normalize(spec) !== spec || !spec.startsWith(SPEC_MAP) || !spec.endsWith('.md')) return false;
  const bestand = path.join(root, spec);
  return existsSync(bestand) && statSync(bestand).isFile();
}

/** @param {string} root @param {Regel} regel @param {string} naam @returns {Violation[]} */
function inhoudFouten(root, regel, naam) {
  const spec = regel['spec'];
  const specFout =
    typeof spec === 'string' && spec !== '' && !geldigeSpec(root, spec)
      ? [fout(naam, 'spec', `spec ${spec} bestaat niet`)]
      : [];
  const rids = Array.isArray(regel['rids']) ? regel['rids'] : [];
  const hard = rids
    .filter((rid) => typeof rid === 'string' && altijdHard(rid))
    .map((rid) =>
      fout(
        naam,
        `altijd hard ${String(rid)}`,
        `${String(rid)} moet altijd meteen hard zijn (ADR 0106 punt 2); deze controle kan niet in schaduw`,
      ),
    );
  return [...specFout, ...termijnFouten(regel, naam), ...hard];
}

/** @param {unknown} regel @param {number} index */
function naamVan(regel, index) {
  const naam = isRegel(regel) ? regel['naam'] : undefined;
  return typeof naam === 'string' && NAAM.test(naam) ? naam : `#${String(index)}`;
}

/** Schemafouten per regel; `geldig` zijn de regels zonder fout. @param {string} root @param {readonly unknown[]} regels */
function schemaFouten(root, regels) {
  /** @type {Violation[]} */
  const fouten = [];
  /** @type {Map<string, Regel>} */
  const geldig = new Map();
  const gezien = new Set();
  regels.forEach((ruw, index) => {
    const naam = naamVan(ruw, index);
    const regel = isRegel(ruw) ? ruw : {};
    const eigen = [...veldFouten(regel, naam), ...inhoudFouten(root, regel, naam)];
    if (gezien.has(naam)) eigen.push(fout(naam, 'dubbel', 'staat twee keer in het register'));
    gezien.add(naam);
    fouten.push(...eigen);
    if (eigen.length === 0) geldig.set(naam, regel);
  });
  return { fouten, geldig };
}

/** @param {unknown} a @param {unknown} b */
function zelfdeDrempel(a, b) {
  return isRegel(a) && isRegel(b) && DREMPELS.every((naam) => a[naam] === b[naam]);
}

/**
 * De vier merge-base-regels (ADR 0106 punten 5 en 6, B-7); ze sluiten elkaar uit, dus hooguit één reden.
 * @param {Regel} nu @param {Regel} toen @returns {string | null}
 */
function basisReden(nu, toen) {
  const [aangepast, eerder] = [nu['aangepast'], toen['aangepast']];
  const drempelGelijk = zelfdeDrempel(nu['drempel'], toen['drempel']);
  if (eerder === 1) {
    const anders = nu['start'] !== toen['start'] || nu['eind'] !== toen['eind'] || !drempelGelijk;
    return anders || aangepast !== 1 ? 'al aangepast' : null;
  }
  if (eerder !== 0) return null;
  if (aangepast === 1) return drempelGelijk ? 'zelfde drempel' : null;
  if (!drempelGelijk) return 'drempel zonder aanpassing';
  return String(nu['eind']) > String(toen['eind']) ? 'verlengd' : null;
}

const BASIS_MELDING = new Map([
  ['al aangepast', 'al een keer aangepast; het besluit is nu hard of verwijderd (ADR 0106 punt 6)'],
  ['zelfde drempel', 'aangepast zonder andere drempel; een aanpassing wijzigt de drempel (ADR 0106 punt 6)'],
  [
    'drempel zonder aanpassing',
    'drempel anders dan op de merge-base zonder dat aangepast is opgehoogd; een aanpassing hoogt aangepast op (ADR 0106 punt 6)',
  ],
  [
    'verlengd',
    'einddatum later dan op de merge-base zonder dat aangepast is opgehoogd; verlengen met dezelfde controle en drempel kan niet (ADR 0106 punt 5)',
  ],
]);

/** De registerregels op de basis per naam (de eerste bij een dubbele naam). @param {string} root @param {string} basis */
function basisRegels(root, basis) {
  const regels = lijstUit(git(root, ['show', `${basis}:${REGISTER}`]) ?? '') ?? [];
  /** @type {Map<string, Regel>} */
  const perNaam = new Map();
  for (const regel of regels)
    if (isRegel(regel) && typeof regel['naam'] === 'string' && !perNaam.has(regel['naam']))
      perNaam.set(regel['naam'], regel);
  return perNaam;
}

/** @param {string} root @param {Map<string, Regel>} geldig @param {boolean} ci @returns {Violation[]} */
function basisFouten(root, geldig, ci) {
  const basis = basisVan(root);
  if (basis === null) return ci ? [{ key: 'merge-base', message: `${GEEN_BASIS} (spec schaduwmodus)` }] : [];
  const toen = basisRegels(root, basis);
  return [...geldig].flatMap(([naam, regel]) => {
    const oud = toen.get(naam);
    const reden = oud === undefined ? null : basisReden(regel, oud);
    return reden === null ? [] : [fout(naam, reden, BASIS_MELDING.get(reden) ?? reden)];
  });
}

/**
 * Strikt kanaal `schaduw-register`: het schema van `.kit/schaduw.json` en de vergelijking met de merge-base. Zonder basis
 * lokaal niets en in CI rood, zoals ac-toets.
 * @param {string} root @param {{ ci: boolean }} opties @returns {Violation[]}
 */
export function registerViolations(root, { ci }) {
  if (!inTemplate(root)) return [];
  const { fout: leesfout, regels } = leesRegister(root);
  if (leesfout === 'ontbreekt')
    return [{ key: `${REGISTER}:ontbreekt`, message: `${REGISTER} ontbreekt; een leeg register is []` }];
  if (leesfout !== null) return [{ key: `${REGISTER}:geen-lijst`, message: `${REGISTER} is geen JSON-lijst` }];
  const { fouten, geldig } = schemaFouten(root, regels);
  return [...fouten, ...basisFouten(root, geldig, ci)];
}

// --- termijn en uitvoerders --------------------------------------------------------------------------------------------

/** Uitkomst per uitvoerdersmap en naam: elke uitvoerder draait één keer per proces. @type {WeakMap<object, Map<string, Promise<Uitkomst>>>} */
const geheugen = new WeakMap();

/** Precies `{ treffers: string[] }`; al het andere (ook `{ overgeslagen }`) is een skip (B-5). @param {unknown} value @returns {Uitkomst} */
function uitkomstVan(value) {
  if (!isRegel(value) || Object.keys(value).length !== 1) return null;
  const treffers = value['treffers'];
  return Array.isArray(treffers) && treffers.every((treffer) => typeof treffer === 'string') ? { treffers } : null;
}

/** @param {Uitvoerders} uitvoerders @param {string} naam @returns {Promise<Uitkomst>} */
function draai(uitvoerders, naam) {
  const perNaam = geheugen.get(uitvoerders) ?? new Map();
  geheugen.set(uitvoerders, perNaam);
  const bekend = perNaam.get(naam);
  if (bekend !== undefined) return bekend;
  const uitvoerder = uitvoerders[naam];
  const uitkomst =
    typeof uitvoerder === 'function'
      ? Promise.resolve()
          .then(() => uitvoerder())
          .then(uitkomstVan, () => null)
      : Promise.resolve(null);
  perNaam.set(naam, uitkomst);
  return uitkomst;
}

/**
 * De registerregels met een geldige naam, voor de termijn, de meldingen en de uitvoerders; bij een dubbele naam alleen de
 * eerste (B-10; `schaduw-register` meldt de dubbele naam).
 * @param {string} root @returns {Regel[]}
 */
function regelsMetNaam(root) {
  /** @type {Map<string, Regel>} */
  const perNaam = new Map();
  for (const regel of leesRegister(root).regels) {
    const naam = isRegel(regel) ? regel['naam'] : undefined;
    if (isRegel(regel) && typeof naam === 'string' && NAAM.test(naam) && !perNaam.has(naam)) perNaam.set(naam, regel);
  }
  return [...perNaam.values()];
}

/** De datum van de committer van HEAD als dagnummer, of null. @param {string} root */
function commitDag(root) {
  const datum = (git(root, ['log', '-1', '--format=%cI']) ?? '').trim().slice(0, 10);
  const dag = dagnummer(datum);
  return dag === null ? null : { datum, dag };
}

/** @param {Uitvoerders} uitvoerders @param {string} naam */
function heeftUitvoerder(uitvoerders, naam) {
  return Object.hasOwn(uitvoerders, naam);
}

/** @param {Uitvoerders} uitvoerders @param {Regel} regel @returns {Promise<Violation[]>} */
async function uitvoerderFouten(uitvoerders, regel) {
  const naam = String(regel['naam']);
  if (!heeftUitvoerder(uitvoerders, naam))
    return regel['soort'] === 'check' || regel['soort'] === 'lintregel'
      ? [fout(naam, 'geen uitvoerder', `geen uitvoerder ${naam} in de map schaduw van de ratchet`)]
      : [];
  return (await draai(uitvoerders, naam)) === null
    ? [
        fout(
          naam,
          'niet volledig',
          'draaide niet volledig; een controle in schaduw draait altijd, nooit als skip (ADR 0106 punt 4)',
        ),
      ]
    : [];
}

/** @param {readonly Regel[]} regels @param {{ datum: string, dag: number }} head @returns {Violation[]} */
function verlopen(regels, head) {
  return regels
    .filter((regel) => {
      const eind = dagnummer(regel['eind']);
      return eind !== null && head.dag > eind;
    })
    .map((regel) => ({
      key: String(regel['naam']),
      message: `de schaduwperiode liep af op ${String(regel['eind'])} (commitdatum HEAD ${head.datum}); leg het besluit voor: hard, aangepast of verwijderd (ADR 0106 punt 6)`,
    }));
}

/**
 * Strikt kanaal `schaduw-termijn`: een verlopen einddatum (commitdatum van HEAD, nooit de klok), een check of lintregel
 * zonder (volledige) uitvoerder en een uitvoerder zonder registerregel.
 * @param {string} root @param {Uitvoerders} uitvoerders @returns {Promise<Violation[]>}
 */
export async function termijnViolations(root, uitvoerders) {
  if (!inTemplate(root)) return [];
  const regels = regelsMetNaam(root);
  const head = commitDag(root);
  const datumFout =
    head === null
      ? [{ key: 'geen commitdatum van HEAD', message: 'git log -1 gaf geen datum; de termijn is niet te toetsen' }]
      : verlopen(regels, head);
  const namen = new Set(regels.map((regel) => String(regel['naam'])));
  const spoken = Object.keys(uitvoerders)
    .filter((naam) => !namen.has(naam))
    .map((naam) => ({ key: `schaduw:${naam}`, message: `staat niet in ${REGISTER}` }));
  const perRegel = await Promise.all(regels.map((regel) => uitvoerderFouten(uitvoerders, regel)));
  return [...datumFout, ...perRegel.flat(), ...spoken];
}

/**
 * Meldingen `schaduw-termijn`: `<naam> loopt af op <eind> (nog <n> dagen)` als `eind − 3 ≤ datum ≤ eind`.
 * De uitvoerders zijn hier niet nodig; de ratchet geeft ze wel mee, net als aan de andere twee.
 * @param {string} root @returns {Promise<string[]>}
 */
export function termijnMeldingen(root) {
  if (!inTemplate(root)) return Promise.resolve([]);
  const head = commitDag(root);
  if (head === null) return Promise.resolve([]);
  const regels = regelsMetNaam(root).flatMap((regel) => {
    const eind = dagnummer(regel['eind']);
    if (eind === null || head.dag > eind || eind - head.dag > WAARSCHUW_DAGEN) return [];
    const n = String(eind - head.dag);
    return [
      `${String(regel['naam'])} loopt af op ${String(regel['eind'])} (nog ${n} dagen); leg vóór die datum het besluit voor`,
    ];
  });
  return Promise.resolve(regels);
}

/**
 * Meldingen `schaduw`: per treffer van een uitvoerder de regel `<naam>: <treffer>`.
 * @param {string} root @param {Uitvoerders} uitvoerders @returns {Promise<string[]>}
 */
export async function trefferMeldingen(root, uitvoerders) {
  if (!inTemplate(root)) return [];
  const namen = regelsMetNaam(root)
    .map((regel) => String(regel['naam']))
    .filter((naam) => heeftUitvoerder(uitvoerders, naam));
  const uitkomsten = await Promise.all(namen.map((naam) => draai(uitvoerders, naam)));
  return namen.flatMap((naam, i) => (uitkomsten[i]?.treffers ?? []).map((treffer) => `${naam}: ${treffer}`));
}

// Los gedraaid zou dit bestand niets melden en met 0 eindigen; alleen de ratchet roept de checks aan (leerpunt #752).
if (import.meta.main) {
  console.error('✗ schaduw draait alleen via de ratchet (kanalen strikt en meldingen): gebruik `pnpm ratchet`.');
  process.exitCode = 1;
}
