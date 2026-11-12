// De secties van scripts/kit/feiten.mjs, zonder CLI. `specs`, `adr` en `fase` zijn pure functies over een lezer
// (meting-stuurt/AC-5): feiten.mjs leest de werkmap, `pnpm leespad` ook de basis via `git show`. De secties uit code
// (gates, migraties, routes, permissies, foutcodes, koppelingen, componenten, tokens) lezen altijd de werkmap; TypeScript en
// de catalogus laden pas bij hun eigen sectie (test/scripts/feiten-lazy.test.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/** @typedef {{ lees: (pad: string) => string | null, lijst: (map: string) => readonly string[] }} Lezer */
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

// Alleen bij de ADR-sectie: nummers uit archief en bekende geschiedenis blijven gereserveerd, zonder fictieve lijstrijen.
// Altijd uit de Git-geschiedenis van de werkmap, per map (ADR 0089 punt 6): een pad telt in de map waarin het stond.
/** @returns {Promise<Gereserveerd>} */
export async function gereserveerdeAdrNummers() {
  const [{ gitText }, { adrMap, adrNumber }] = await Promise.all([
    import('../../rails/hooks/lib/authority-context.mjs'),
    import('./adr-numbers.mjs'),
  ]);
  const root = process.cwd();
  const refs = gitText(root, ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/main']);
  if (refs === null) throw new Error('ADR-geschiedenis niet leesbaar; haal de Git-geschiedenis op');
  const main = refs.split('\n').includes('refs/remotes/origin/main') ? ['refs/remotes/origin/main'] : [];
  const history = gitText(root, [
    'log',
    'HEAD',
    ...main,
    '--full-history',
    '--no-renames',
    '--format=',
    '--name-only',
    '-z',
    '--',
    ...ADR_MAPPEN,
  ]);
  if (history === null) throw new Error('ADR-geschiedenis niet leesbaar; haal de Git-geschiedenis op');
  const archive = markdownFiles(werkmap, 'docs/adr/archief').map((file) => `docs/adr/archief/${file}`);
  const paths = [...history.split('\0').map((file) => file.replace(/^\n+/, '')), ...archive];
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

/** De specs van één map. @param {Lezer} lezer @param {string} [map] */
export function specs(lezer, map = 'docs/specs') {
  return markdownFiles(lezer, map).map((file) => {
    const status = /^status:\s*(\S+)/m.exec(lezer.lees(`${map}/${file}`) ?? '')?.[1] ?? 'onbekend';
    return { spec: file, status };
  });
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
 * `volgende` (het vrije ADR-nummer per map) komt van de aanroeper: uit de Git-geschiedenis van de werkmap, ook als de lezer
 * de basis is.
 * @param {Lezer} lezer @param {{ alle: boolean, gereserveerd?: Gereserveerd, volgende?: string }} opties
 * @returns {Record<(typeof LEZER_SECTIES)[number], () => unknown>}
 */
export function lezerSecties(lezer, { alle, gereserveerd = {}, volgende }) {
  const alleSpecs = () => SPEC_MAPPEN.flatMap((dir) => specs(lezer, dir));
  return {
    specs: () =>
      perMap(
        SPEC_MAPPEN.map((dir) => ({ map: `${dir}/`, overzicht: specsOverzicht(specs(lezer, dir), alle, `${dir}/`) })),
      ),
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
  const { ROLES } = await import('../../src/core/shared/can.ts');
  return permissions.names.map((permission) => ({
    permissie: permission,
    rollen:
      ROLES.filter((role) => permissions.can({ role, sessionStrength: 'mfa' }, permission)).join(', ') || '(geen)',
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
];
