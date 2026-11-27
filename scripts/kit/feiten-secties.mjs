// De secties van scripts/kit/feiten.mjs, zonder CLI. `specs`, `adr` en `fase` zijn pure functies over een lezer
// (meting-stuurt/AC-5): feiten.mjs leest de werkmap, `pnpm leespad` ook de basis via `git show`. De secties uit code
// (gates, migraties, routes, permissies, foutcodes, koppelingen, componenten, tokens) lezen altijd de werkmap; TypeScript en
// de catalogus laden pas bij hun eigen sectie (test/scripts/feiten-lazy.test.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dekkingVanSpec } from '../../rails/hooks/lib/ac-dekking.mjs';
import { boomWerkmap } from './ac-dekking.mjs';
import { gates } from './gates.mjs';
import {
  adrOverzicht,
  componentenTekst,
  faseOverzicht,
  koppelingenOverzicht,
  perMap,
  specsOverzicht,
  tokenOverzicht,
  tokensTekst,
} from './feiten-tekst.mjs';

/** @typedef {import('../../rails/hooks/lib/ac-dekking.mjs').Boom} Boom */
/** @typedef {import('../../rails/hooks/lib/ac-dekking.mjs').Dekking} Dekking */
/**
 * `boom` (optioneel, lui): de testbestanden, specs en ADR's voor de AC-dekking; alleen de sectie `specs` vraagt hem op.
 * @typedef {{ lees: (pad: string) => string | null, lijst: (map: string) => readonly string[], boom?: () => Boom }} Lezer
 */
/** @typedef {{ json: unknown, kop?: string, inhoud: unknown }} Result */

const CATALOGUS = '/design-system';
const STYLES = 'src/core/web/styles';
const THEME = 'src/web/styles/theme.css';

/** De secties die uit bestanden komen en dus per lezer verschillen. */
export const LEZER_SECTIES = /** @type {const} */ (['specs', 'adr', 'fase']);

/** @param {string} pad */
function readOrNull(pad) {
  return existsSync(pad) ? readFileSync(pad, 'utf8') : null;
}

/** De werkmap als lezer. @type {Lezer} */
export const werkmap = {
  lees: readOrNull,
  lijst: (map) => (existsSync(map) ? readdirSync(map) : []),
  boom: () => boomWerkmap('.'),
};

/** ADR- of specbestanden van een map, gesorteerd. @param {Lezer} lezer @param {string} dir */
export function markdownFiles(lezer, dir) {
  return lezer
    .lijst(dir)
    .filter(
      (name) => /^\d{4}-.+\.md$/.test(name) || (dir.endsWith('specs') && name.endsWith('.md') && !name.startsWith('_')),
    )
    .sort();
}

/** De mappen van de app en van de template (ADR 0089 punt 1), app eerst. */
export const ADR_MAPPEN = /** @type {const} */ (['docs/adr', 'docs/template/adr']);
export const SPEC_MAPPEN = /** @type {const} */ (['docs/specs', 'docs/template/specs']);

/** @typedef {Readonly<Record<string, readonly string[]>>} Gereserveerd nummers per ADR-map (`docs/adr/`, `docs/template/adr/`) */

/** @typedef {(root: string, args: string[]) => string | null} GitText */

const ONLEESBAAR = 'ADR-geschiedenis niet leesbaar; haal de Git-geschiedenis op';

/** Uitvoer van git, of een fout als git die niet geeft. @param {GitText} gitText @param {string} root @param {string[]} args */
function gitOfFout(gitText, root, args) {
  const text = gitText(root, args);
  if (text === null) throw new Error(ONLEESBAAR);
  return text;
}

/** ADR-paden uit de geschiedenis van HEAD en, als die er is, `origin/main`. @param {GitText} gitText @param {string} root */
function adrPadenUitGeschiedenis(gitText, root) {
  const refs = gitOfFout(gitText, root, ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/main']);
  const main = refs.split('\n').includes('refs/remotes/origin/main') ? ['refs/remotes/origin/main'] : [];
  const args = ['log', 'HEAD', ...main, '--full-history', '--no-renames', '--format=', '--name-only', '-z'];
  const history = gitOfFout(gitText, root, [...args, '--', ...ADR_MAPPEN]);
  return history.split('\0').map((file) => file.replace(/^\n+/, ''));
}

/**
 * ADR-paden op de tip van elke `refs/remotes/origin/*`: een open PR-branch reserveert zijn nummer al. Alleen wat
 * `git fetch origin` het laatst ophaalde; geen netwerk.
 * @param {GitText} gitText @param {string} root
 */
function adrPadenOpRemoteBranches(gitText, root) {
  const refs = gitOfFout(gitText, root, ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/']);
  return refs
    .split('\n')
    .filter((ref) => ref !== '')
    .flatMap((ref) =>
      gitOfFout(gitText, root, ['ls-tree', '-r', '--name-only', '-z', ref, '--', ...ADR_MAPPEN]).split('\0'),
    );
}

/** De namen in een map, of niets als de map ontbreekt of onleesbaar is. @param {string} dir */
function namenIn(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * ADR-paden in de ADR-mappen van elke werkmap uit `git worktree list`, ook niet-gecommitte bestanden; een werkmap
 * waarvan de map niet meer bestaat, levert niets.
 * @param {GitText} gitText @param {string} root
 */
function adrPadenInWerkmappen(gitText, root) {
  const lijst = gitOfFout(gitText, root, ['worktree', 'list', '--porcelain', '-z']);
  const werkmappen = lijst
    .split('\0')
    .filter((regel) => regel.startsWith('worktree '))
    .map((regel) => regel.slice('worktree '.length));
  const mappen = [...ADR_MAPPEN, 'docs/adr/archief'];
  return werkmappen.flatMap((dir) => mappen.flatMap((map) => namenIn(`${dir}/${map}`).map((naam) => `${map}/${naam}`)));
}

// Alleen bij de ADR-sectie: nummers die elders al in gebruik zijn, blijven gereserveerd, zonder fictieve lijstrijen. Per
// map (ADR 0089 punt 6): een pad telt in de map waarin het stond. Bronnen: de geschiedenis van HEAD en `origin/main`, de
// tip van elke remote branch en de ADR-mappen van elke werkmap (met het archief en niet-gecommitte bestanden).
/** @returns {Promise<Gereserveerd>} */
export async function gereserveerdeAdrNummers() {
  const [{ gitText }, { adrMap, adrNumber }] = await Promise.all([
    import('../../rails/hooks/lib/authority-context.mjs'),
    import('./adr-numbers.mjs'),
  ]);
  const root = process.cwd();
  const paths = [
    ...adrPadenUitGeschiedenis(gitText, root),
    ...adrPadenOpRemoteBranches(gitText, root),
    ...adrPadenInWerkmappen(gitText, root),
  ];
  /** @type {Record<string, string[]>} */
  const uit = {};
  for (const file of paths) {
    const [map, nummer] = [adrMap(file), adrNumber(file)];
    if (map === undefined || nummer === undefined) continue;
    const lijst = (uit[map] ??= []);
    if (!lijst.includes(nummer)) lijst.push(nummer);
  }
  return uit;
}

/** De ADR's van één map. @param {Lezer} lezer @param {string} [map] */
export function adrs(lezer, map = 'docs/adr') {
  return markdownFiles(lezer, map).map((file) => {
    const text = lezer.lees(`${map}/${file}`) ?? '';
    const status =
      /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m.exec(text)?.[1] ?? 'onbekend';
    return { nummer: file.slice(0, 4), titel: /^# \d{4} — (.+)$/m.exec(text)?.[1] ?? file, status };
  });
}

const LEGE_BOOM = { bestanden: [], lees: () => null };

/**
 * De statuskolom (gebouwd-zonder-nummer/AC-25): `gebouwd`, `deels <n>/<m>` of de eigenaarstatus.
 * @param {Dekking} dekking @param {string} ruw de status zoals hij in de spec staat
 */
function statusKolom({ stand, eigenaar, gebouwd, levend }, ruw) {
  if (stand === 'gebouwd') return 'gebouwd';
  if (stand === 'deels') return `deels ${String(gebouwd.length)}/${String(levend.length)}`;
  return eigenaar ?? ruw;
}

/**
 * De specs van één map met hun afgeleide stand (ADR 0104): `{ spec, status, stand, gebouwd, levend }`, `gebouwd` en `levend`
 * als aantallen. De boom komt uit `lezer.boom` (lui); een lezer zonder boom geeft elke spec lege `gebouwd`.
 * @param {Lezer} lezer @param {string} [map]
 */
export function specs(lezer, map = 'docs/specs') {
  const namen = markdownFiles(lezer, map);
  const boom = namen.length === 0 ? LEGE_BOOM : (lezer.boom?.() ?? LEGE_BOOM);
  return namen.map((file) => {
    const pad = `${map}/${file}`;
    const text = lezer.lees(pad) ?? '';
    const ruw = /^status:\s*(\S+)/m.exec(text)?.[1] ?? 'onbekend';
    const dekking = dekkingVanSpec({ file: pad, text }, boom);
    return {
      spec: file,
      status: statusKolom(dekking, ruw),
      stand: dekking.stand,
      gebouwd: dekking.gebouwd.length,
      levend: dekking.levend.length,
    };
  });
}

/** Een lezer die zijn boom één keer opvraagt, ook over meerdere specmappen. @param {Lezer} lezer @returns {Lezer} */
function eenBoom(lezer) {
  const { boom } = lezer;
  if (boom === undefined) return lezer;
  /** @type {Boom | undefined} */
  let cache;
  return { ...lezer, boom: () => (cache ??= boom()) };
}

/**
 * De ADR-sectie: per map een lijst en een telregel, en één regel `volgende` met het vrije nummer per map.
 * @param {Lezer} lezer @param {{ alle: boolean, gereserveerd: Gereserveerd, volgende?: string | undefined }} opties
 */
function adrSectie(lezer, { alle, gereserveerd, volgende }) {
  const delen = ADR_MAPPEN.map((dir) => {
    const map = `${dir}/`;
    const { volgende: vrij, ...overzicht } = adrOverzicht(adrs(lezer, dir), alle, gereserveerd[map] ?? []);
    return { map, overzicht, vrij };
  });
  return {
    ...perMap(delen),
    volgende: volgende ?? delen.map(({ map, vrij }) => `${vrij} (${map})`).join(' · '),
  };
}

/**
 * `specs`, `adr` en `fase` over een lezer; `specs` en `adr` tonen een lijst per map, app eerst (templateregime/AC-11).
 * `volgende` (het vrije ADR-nummer per map) komt van de aanroeper: uit de Git-geschiedenis van de werkmap, de tips van
 * `refs/remotes/origin/*` en de andere werkmappen (`gereserveerdeAdrNummers`), ook als de lezer de basis is.
 * @param {Lezer} lezer @param {{ alle: boolean, gereserveerd?: Gereserveerd, volgende?: string }} opties
 * @returns {Record<(typeof LEZER_SECTIES)[number], () => unknown>}
 */
export function lezerSecties(lezer, { alle, gereserveerd = {}, volgende }) {
  // De AC-dekking alleen in de sectie `specs` (ADR 0104): `fase` leest de specs zonder boom.
  const zonderBoom = { lees: lezer.lees, lijst: lezer.lijst };
  const alleSpecs = () => SPEC_MAPPEN.flatMap((dir) => specs(zonderBoom, dir));
  return {
    specs: () => {
      const metBoom = eenBoom(lezer);
      return perMap(
        SPEC_MAPPEN.map((dir) => ({ map: `${dir}/`, overzicht: specsOverzicht(specs(metBoom, dir), alle, `${dir}/`) })),
      );
    },
    adr: () => adrSectie(lezer, { alle, gereserveerd, volgende }),
    fase: () =>
      faseOverzicht({
        roadmap: lezer.lees('docs/roadmap.md'),
        dod: lezer.lees('docs/dod.md'),
        specs: alleSpecs(),
        alle,
      }),
  };
}

function migrations() {
  const versions = readdirSync('db/migrations')
    .map((name) => /^(\d{14})_.+\.sql$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .sort();
  const last = versions.at(-1) ?? null;
  return { laatste: last, volgende: `tijdstempel > ${last ?? '0'} (dbmate new <naam>)` };
}

// Routes, permissies en foutcodes rechtstreeks uit de bron (Node draait TypeScript zonder build); geen kopie in proza.
async function routes() {
  const { contracts } = await import('../../src/shared/contracts/index.ts');
  return contracts.map((contract) => ({
    route: `${contract.method} /api${contract.path}`,
    permissie: contract.permission,
    bron: 'src/shared/contracts/ (handler: src/api/routes/)',
  }));
}

async function permissies() {
  const { permissions } = await import('../../src/shared/permissions.ts');
  return permissions.names.map((permission) => ({
    permissie: permission,
    rollen:
      permissions.roles.names
        .filter((role) => permissions.can({ role, sessionStrength: 'mfa' }, permission))
        .join(', ') || '(geen)',
  }));
}

// Tokens alleen uit de CSS (spec semantische-tokens, 3c): geen Tailwind-, TypeScript- of catalogusimport.
function tokens() {
  const paden = { semantic: `${STYLES}/semantic.css`, components: `${STYLES}/components.css`, theme: THEME };
  const css = {
    semantic: readFileSync(paden.semantic, 'utf8'),
    components: readFileSync(paden.components, 'utf8'),
    index: readFileSync(`${STYLES}/index.css`, 'utf8'),
    theme: readOrNull(THEME),
  };
  return tokenOverzicht(css, paden);
}

async function foutcodes() {
  const { errors } = await import('../../src/shared/errors.ts');
  return { codes: errors.codes.join(', '), teksten: 'src/web/copy/errors.ts', nieuw: 'src/shared/errors.ts' };
}

/**
 * JSON en tekst zijn gelijk, behalve waar een sectie een eigen tekstvorm heeft (componenten).
 * @param {() => unknown} load
 * @returns {() => Promise<Result>}
 */
export function plain(load) {
  return async () => {
    const data = await load();
    return { json: data, inhoud: data };
  };
}

/** De secties uit code; ze lezen altijd de werkmap. @type {Record<string, () => Promise<Result> | Result>} */
export const codeSecties = {
  gates: plain(() =>
    gates.map(({ script, bewaakt, snel }) => ({ script: `pnpm ${script}`, soort: snel ? 'snel' : 'traag', bewaakt })),
  ),
  migraties: plain(migrations),
  routes: plain(routes),
  permissies: plain(permissies),
  foutcodes: plain(foutcodes),
  // Register van de app en de kenmerkcatalogus uit core (spec koppeling-agentlaag); beide bijwerkingvrij.
  koppelingen: async () => {
    const { integrations } = await import('../../src/api/integrations/index.ts');
    const { integrationTraitCatalog } = await import('../../src/core/api/integrations/index.ts');
    return koppelingenOverzicht(integrations.defs, integrationTraitCatalog());
  },
  componenten: async () => {
    const { componenten } = await import('./catalogus.mjs');
    const lijst = componenten();
    return {
      json: { catalogus: CATALOGUS, lijst },
      kop: `catalogus ${CATALOGUS}; publiek = export uit src/web/ui, intern = alleen binnen de kit`,
      inhoud: componentenTekst(lijst),
    };
  },
  tokens: () => {
    const groepen = tokens();
    return {
      json: groepen,
      kop: `klasse · standaard (licht) · donker · app (${THEME}) · bron; onbekend = niet in semantic.css`,
      inhoud: tokensTekst(groepen),
    };
  },
};

/** De volgorde van de secties zonder sectienaam (alles), zoals feiten.mjs die altijd toonde. */
export const VOLGORDE = [
  'gates',
  'adr',
  'specs',
  'migraties',
  'routes',
  'permissies',
  'foutcodes',
  'koppelingen',
  'componenten',
  'tokens',
  'fase',
  'recepten',
  'besluiten',
];
