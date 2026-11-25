// Bewaking van de toolchain (spec toolchain-bewaking, R-PROV-04, ADR 0111): meldt als Node, pnpm of TypeScript achterloopt op
// het beleid "hoogste binnen de vertrouwde major", of als de volgende major klaar is. Leest de Node-releases en de
// npm-registry (alleen `GET`); met `--issue` houdt het één issue bij (workflow `.github/workflows/toolchain.yml`).
// Alleen `node:`- en relatieve imports, zonder install. Exitcodes: 0 bij (of alleen een volgende major, of met `--issue` een
// gelukt issue), 1 achterstand, 2 fout (nooit groen zonder gelezen data, AC-8).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { veld } from './leerpunt.mjs';

const DAG = 86_400_000;
/** Een release is oud genoeg vanaf 7 dagen; achterstand telt pas na 14 dagen daarna. */
const WACHT = 7;
const GRENS = 14;
export const NODE_URL = 'https://nodejs.org/dist/index.json';
export const NPM_URL = 'https://registry.npmjs.org/';
export const TITEL = 'Toolchain: achterstand of volgende major';
const BOT = 'github-actions[bot]';
const PER_PAGINA = 100;
const MAX_PAGINAS = 10;
const STABIEL = /^(\d+)\.(\d+)\.(\d+)$/;
const CODENAAM = /^[A-Za-z]+$/;
const DAGVORM = /^\d{4}-\d{2}-\d{2}$/;
const VERGELIJKING = /^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+)$/;

/** @typedef {{ code: 0 | 1 | 2, tekst: string }} Uitslag */
/** @typedef {(bestand: string) => string} Lezer */
/** @typedef {{ node: string, pnpm: string, typescript: string, typescriptEslint: string }} Pins */
/** @typedef {{ versie: string, dag: string }} Release */
/** @typedef {Release & { lts: false | string }} NodeRelease */
/** @typedef {{ releases: Release[], latest: string }} NpmPakket */
/** @typedef {{ latest: string, peerPin: string, peerLatest: string }} Eslint */
/** @typedef {{ node: NodeRelease[], pnpm: NpmPakket, typescript: NpmPakket, eslint: Eslint }} Bronnen */
/** @typedef {{ tool: string, gepind: string, toegestaan: string, sinds: string, dagen: number }} Achterstand */
/** @typedef {{ tool: string, major: number, reden: string }} VolgendeMajor */
/** @typedef {{ achterstand: Achterstand[], volgendeMajor: VolgendeMajor[] }} Oordeel */
/** @typedef {{ op: string, versie: number[] }} Vergelijking */

/** Een fout met een regel uit de spec ("Fouten"); elke fout wordt exitcode 2. */
export class Fout extends Error {}

/** @param {unknown} fout */
function bericht(fout) {
  return fout instanceof Error ? fout.message : String(fout);
}

// --- versies en bereiken ------------------------------------------------------------------------------------------------------

/** De delen van een stabiele versie `x.y.z`, of `null`. @param {string} tekst @returns {number[] | null} */
export function stabiel(tekst) {
  const delen = STABIEL.exec(tekst);
  return delen === null ? null : [Number(delen[1]), Number(delen[2]), Number(delen[3])];
}

/** @param {number[]} a @param {number[]} b */
function vergelijkDelen(a, b) {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** Vergelijkt twee stabiele versies. @param {string} a @param {string} b */
export function vergelijk(a, b) {
  return vergelijkDelen(stabiel(a) ?? [], stabiel(b) ?? []);
}

/** @param {string} versie */
function major(versie) {
  return stabiel(versie)?.[0] ?? -1;
}

/** `^` en `~` met de semver-betekenis, als twee vergelijkingen. @param {string} op @param {number[]} v @returns {Vergelijking[]} */
function uitgeschreven(op, v) {
  const [x = 0, y = 0, z = 0] = v;
  if (op === '~')
    return [
      { op: '>=', versie: v },
      { op: '<', versie: [x, y + 1, 0] },
    ];
  if (op !== '^') return [{ op: op === '' ? '=' : op, versie: v }];
  const tot = x > 0 ? [x + 1, 0, 0] : y > 0 ? [0, y + 1, 0] : [0, 0, z + 1];
  return [
    { op: '>=', versie: v },
    { op: '<', versie: tot },
  ];
}

/**
 * Een bereik in de toegestane vorm (spec, "Bereiken"): alternatieven met `||`, binnen een alternatief vergelijkingen met één
 * spatie als "en". Elke andere vorm gooit `onbekende waarde: <bereik>`.
 * @param {string} bereik @returns {Vergelijking[][]}
 */
export function leesBereik(bereik) {
  const onbekend = new Fout(`onbekende waarde: ${bereik}`);
  return bereik.split('||').map((alternatief) => {
    const delen = alternatief.trim().split(' ');
    return delen.flatMap((deel) => {
      const match = VERGELIJKING.exec(deel);
      const versie = stabiel(match?.[2] ?? '');
      if (match === null || versie === null) throw onbekend;
      return uitgeschreven(match[1] ?? '', versie);
    });
  });
}

/** @param {number[]} v @param {Vergelijking} vergelijking */
function voldoet(v, { op, versie }) {
  const verschil = vergelijkDelen(v, versie);
  if (op === '>=') return verschil >= 0;
  if (op === '<=') return verschil <= 0;
  if (op === '>') return verschil > 0;
  if (op === '<') return verschil < 0;
  return verschil === 0;
}

/** Valt de stabiele versie binnen het bereik? @param {string} versie @param {Vergelijking[][]} bereik */
export function binnen(versie, bereik) {
  const v = stabiel(versie);
  return v !== null && bereik.some((alternatief) => alternatief.every((deel) => voldoet(v, deel)));
}

// --- dagen ------------------------------------------------------------------------------------------------------------------

/** @param {string} dag `JJJJ-MM-DD` @returns {number} dagnummer sinds 1970-01-01, UTC */
function dagnummer(dag) {
  return Date.parse(`${dag}T00:00:00Z`) / DAG;
}

/** @param {number} nummer */
function dagtekst(nummer) {
  return new Date(nummer * DAG).toISOString().slice(0, 10);
}

/** @param {number} nu */
export function dagVan(nu) {
  return dagtekst(Math.floor(nu / DAG));
}

/** @param {string} dag */
function geldigeDag(dag) {
  return DAGVORM.test(dag) && !Number.isNaN(dagnummer(dag));
}

// --- pins -------------------------------------------------------------------------------------------------------------------

/** @param {Lezer} lees @param {string} bestand */
function lezen(lees, bestand) {
  try {
    return lees(bestand);
  } catch (fout) {
    throw new Fout(`${bestand}: niet te lezen (${bericht(fout)})`);
  }
}

/** @param {string} bestand @param {string} naam @param {unknown} waarde */
function pin(bestand, naam, waarde) {
  if (typeof waarde !== 'string' || waarde === '') throw new Fout(`${bestand}: ${naam} ontbreekt`);
  if (stabiel(waarde) === null) throw new Fout(`${bestand}: ${naam} ${waarde} is geen versie x.y.z`);
  return waarde;
}

/** @param {string} regel */
function zonderAanhalingstekens(regel) {
  return regel.replace(/^(['"])(.*)\1$/, '$2');
}

const LOCKPAD = ['importers', '.', 'devDependencies', 'typescript'];

/**
 * De opgeloste TypeScript-versie in `pnpm-lock.yaml`: `version:` onder `importers:` › `.:` › `devDependencies:` ›
 * `typescript:`. Een vaste, kleine lezer op inspringing (twee spaties per niveau), zonder YAML-dependency; `null` als hij
 * ontbreekt. Een lockfile met meer documenten (`---`) telt het eerste document dat hem heeft.
 * @param {string} tekst @returns {string | null}
 */
export function lockTypescript(tekst) {
  let diepte = 0;
  for (const regel of tekst.split(/\r?\n/)) {
    const inhoud = regel.trim();
    if (inhoud === '' || inhoud.startsWith('#')) continue;
    const inspring = regel.length - regel.trimStart().length;
    if (inspring < diepte * 2) diepte = Math.floor(inspring / 2);
    if (inspring !== diepte * 2) continue;
    if (diepte === LOCKPAD.length && inhoud.startsWith('version:'))
      return zonderAanhalingstekens(inhoud.slice('version:'.length).trim());
    if (
      diepte < LOCKPAD.length &&
      inhoud.endsWith(':') &&
      zonderAanhalingstekens(inhoud.slice(0, -1)) === LOCKPAD[diepte]
    )
      diepte++;
  }
  return null;
}

/** @param {Lezer} lees @returns {Pins} */
export function leesPins(lees) {
  const mise = /^node\s*=\s*(["'])(.*?)\1/m.exec(lezen(lees, 'mise.toml'))?.[2];
  /** @type {unknown} */
  let pakket;
  try {
    pakket = JSON.parse(lezen(lees, 'package.json'));
  } catch (fout) {
    throw fout instanceof Fout ? fout : new Fout(`package.json: geen geldige JSON (${bericht(fout)})`);
  }
  const manager = veld(pakket, 'packageManager');
  const pnpm = typeof manager === 'string' && manager.startsWith('pnpm@') ? manager.slice('pnpm@'.length) : undefined;
  return {
    node: pin('mise.toml', 'node', mise),
    pnpm: pin('package.json', 'packageManager pnpm@', pnpm),
    typescriptEslint: pin(
      'package.json',
      'devDependencies.typescript-eslint',
      veld(veld(pakket, 'devDependencies'), 'typescript-eslint'),
    ),
    typescript: pin(
      'pnpm-lock.yaml',
      'importers › . › devDependencies › typescript › version',
      lockTypescript(lezen(lees, 'pnpm-lock.yaml')),
    ),
  };
}

// --- bronnen ----------------------------------------------------------------------------------------------------------------

/** @param {string} url @param {typeof globalThis.fetch} fetch @returns {Promise<unknown>} */
async function haalJson(url, fetch) {
  /** @type {Response} */
  let antwoord;
  try {
    antwoord = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
  } catch (fout) {
    throw new Fout(`Bron: ${url}: ${bericht(fout)}`);
  }
  if (!antwoord.ok) throw new Fout(`Bron: ${url}: HTTP ${String(antwoord.status)}`);
  try {
    return await antwoord.json();
  } catch (fout) {
    throw new Fout(`Bron: ${url}: ${bericht(fout)}`);
  }
}

/** De Node-releases uit `index.json` (de `v` valt weg). @param {unknown} data @returns {NodeRelease[]} */
export function leesNode(data) {
  if (!Array.isArray(data)) throw new Fout(`Bron: ${NODE_URL}: antwoord is geen lijst`);
  return data.map((release) => {
    const version = veld(release, 'version');
    const date = veld(release, 'date');
    const lts = veld(release, 'lts');
    if (typeof version !== 'string' || !version.startsWith('v')) throw new Fout(`Bron: ${NODE_URL}: version ontbreekt`);
    if (typeof date !== 'string' || !geldigeDag(date)) throw new Fout(`Bron: ${NODE_URL}: date ontbreekt`);
    if (lts !== false && typeof lts !== 'string') throw new Fout(`Bron: ${NODE_URL}: lts ontbreekt`);
    return { versie: version.slice(1), dag: date, lts };
  });
}

/** Een npm-pakket: de stabiele versies met hun releasedag uit `time`, en `dist-tags.latest`. @param {unknown} data @param {string} url @returns {NpmPakket} */
export function leesNpm(data, url) {
  const time = veld(data, 'time');
  const latest = veld(veld(data, 'dist-tags'), 'latest');
  if (typeof time !== 'object' || time === null || Array.isArray(time)) throw new Fout(`Bron: ${url}: time ontbreekt`);
  if (typeof latest !== 'string' || latest === '') throw new Fout(`Bron: ${url}: dist-tags.latest ontbreekt`);
  const releases = Object.entries(time)
    .filter(([versie]) => stabiel(versie) !== null)
    .map(([versie, tijd]) => {
      const dag = typeof tijd === 'string' ? tijd.slice(0, 10) : '';
      if (!geldigeDag(dag)) throw new Fout(`Bron: ${url}: time.${versie} ontbreekt`);
      return { versie, dag };
    });
  return { releases, latest };
}

/** `versions.<v>.peerDependencies.typescript` van typescript-eslint. @param {unknown} data @param {string} url @param {string} versie */
function peer(data, url, versie) {
  const bereik = veld(veld(veld(veld(data, 'versions'), versie), 'peerDependencies'), 'typescript');
  if (typeof bereik !== 'string' || bereik === '')
    throw new Fout(`Bron: ${url}: versions.${versie}.peerDependencies.typescript ontbreekt`);
  return bereik;
}

/** @param {typeof globalThis.fetch} fetch @param {Pins} pins @returns {Promise<Bronnen>} */
export async function haalBronnen(fetch, pins) {
  const node = leesNode(await haalJson(NODE_URL, fetch));
  const pnpm = leesNpm(await haalJson(`${NPM_URL}pnpm`, fetch), `${NPM_URL}pnpm`);
  const typescript = leesNpm(await haalJson(`${NPM_URL}typescript`, fetch), `${NPM_URL}typescript`);
  const url = `${NPM_URL}typescript-eslint`;
  const data = await haalJson(url, fetch);
  const { latest } = leesNpm(data, url);
  const eslint = { latest, peerPin: peer(data, url, pins.typescriptEslint), peerLatest: peer(data, url, latest) };
  return { node, pnpm, typescript, eslint };
}

// --- beoordeling (puur) -----------------------------------------------------------------------------------------------------

/** Een waarde in de uitvoer moet een stabiele versie zijn (spec, "Waarden in de uitvoer"). @param {string} versie */
function uitvoerVersie(versie) {
  if (stabiel(versie) === null) throw new Fout(`onbekende waarde: ${versie}`);
  return versie;
}

/**
 * Achterstand van één tool: de opvolgers zijn de stabiele versies in de major van de pin, nieuwer dan de pin en oud genoeg.
 * @param {{ tool: string, gepind: string, releases: Release[] }} tool @param {number} vandaag @returns {Achterstand[]}
 */
function achterstandVan({ tool, gepind, releases }, vandaag) {
  const opvolgers = releases
    .filter(({ versie }) => major(versie) === major(gepind) && vergelijk(versie, gepind) > 0)
    .filter(({ dag }) => dagnummer(dag) + WACHT <= vandaag)
    .toSorted((a, b) => vergelijk(a.versie, b.versie));
  const eerste = opvolgers[0];
  const nieuwste = opvolgers.at(-1);
  if (eerste === undefined || nieuwste === undefined) return [];
  const sinds = dagnummer(eerste.dag) + WACHT;
  const dagen = vandaag - sinds;
  if (dagen <= GRENS) return [];
  return [{ tool, gepind, toegestaan: uitvoerVersie(nieuwste.versie), sinds: dagtekst(sinds), dagen }];
}

/** Node: de hoogste major boven de pin met een LTS-release. @param {string} gepind @param {NodeRelease[]} releases @returns {VolgendeMajor[]} */
function nodeMajor(gepind, releases) {
  const top = releases
    .filter(({ versie, lts }) => lts !== false && stabiel(versie) !== null && major(versie) > major(gepind))
    .toSorted((a, b) => vergelijk(b.versie, a.versie))[0];
  if (top === undefined || top.lts === false) return [];
  if (!CODENAAM.test(top.lts)) throw new Fout(`onbekende waarde: ${top.lts}`);
  return [{ tool: 'Node', major: major(top.versie), reden: `LTS ${top.lts}` }];
}

/** pnpm: de major van `latest` is hoger dan die van de pin. @param {string} gepind @param {NpmPakket} pnpm @returns {VolgendeMajor[]} */
function pnpmMajor(gepind, pnpm) {
  const latest = uitvoerVersie(pnpm.latest);
  if (major(latest) <= major(gepind)) return [];
  return [{ tool: 'pnpm', major: major(latest), reden: `latest is ${latest}` }];
}

/** TypeScript: de nieuwste typescript-eslint staat `<major+1>.0.0` toe en die major heeft een stabiele versie. @param {string} gepind @param {Bronnen} bronnen @returns {VolgendeMajor[]} */
function typescriptMajor(gepind, { typescript, eslint }) {
  const volgende = major(gepind) + 1;
  const latest = uitvoerVersie(eslint.latest);
  if (!binnen(`${String(volgende)}.0.0`, leesBereik(eslint.peerLatest))) return [];
  if (!typescript.releases.some(({ versie }) => major(versie) === volgende)) return [];
  return [
    {
      tool: 'TypeScript',
      major: volgende,
      reden: `typescript-eslint ${latest} staat typescript ${eslint.peerLatest} toe`,
    },
  ];
}

/**
 * De beoordeling (puur) over de pins, de bronnen en `nu`.
 * @param {{ pins: Pins, bronnen: Bronnen, nu: number }} invoer @returns {Oordeel}
 */
export function beoordeel({ pins, bronnen, nu }) {
  const vandaag = Math.floor(nu / DAG);
  const peer = leesBereik(bronnen.eslint.peerPin);
  leesBereik(bronnen.eslint.peerLatest);
  const tools = [
    { tool: 'Node', gepind: pins.node, releases: bronnen.node },
    { tool: 'pnpm', gepind: pins.pnpm, releases: bronnen.pnpm.releases },
    {
      tool: 'TypeScript',
      gepind: pins.typescript,
      releases: bronnen.typescript.releases.filter(({ versie }) => binnen(versie, peer)),
    },
  ];
  return {
    achterstand: tools.flatMap((tool) => achterstandVan(tool, vandaag)),
    volgendeMajor: [
      ...nodeMajor(pins.node, bronnen.node),
      ...pnpmMajor(pins.pnpm, bronnen.pnpm),
      ...typescriptMajor(pins.typescript, bronnen),
    ],
  };
}

/** De meldingen, één regel elk: eerst achterstand, dan de volgende major. @param {Oordeel} oordeel @returns {string[]} */
export function meldingen({ achterstand, volgendeMajor }) {
  return [
    ...achterstand.map(
      (a) =>
        `achterstand: ${a.tool} ${a.gepind}, toegestaan ${a.toegestaan}, achter sinds ${a.sinds} (${String(a.dagen)} dagen)`,
    ),
    ...volgendeMajor.map((v) => `volgende major klaar: ${v.tool} ${String(v.major)} (${v.reden})`),
  ];
}

/** De meldingen met de afsluitregel en de exitcode zonder `--issue`. @param {Oordeel} oordeel @param {Pins} pins @returns {Uitslag} */
export function rapport(oordeel, pins) {
  const regels = meldingen(oordeel);
  const n = String(regels.length);
  if (oordeel.achterstand.length > 0)
    return {
      code: 1,
      tekst: [
        ...regels,
        `Toolchain loopt achter: ${n} melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.`,
      ].join('\n'),
    };
  if (regels.length > 0)
    return {
      code: 0,
      tekst: [
        ...regels,
        `Toolchain bij, volgende major klaar: ${n} melding(en). Start de major met de majorchecklist (R-PROV-04).`,
      ].join('\n'),
    };
  return { code: 0, tekst: `Toolchain bij: Node ${pins.node}, pnpm ${pins.pnpm}, TypeScript ${pins.typescript}.` };
}

// --- issue ------------------------------------------------------------------------------------------------------------------

/** @param {string[]} regels @param {string} dag */
export function issueBody(regels, dag) {
  return [...regels.map((regel) => `- ${regel}`), '', `Bijgewerkt door de workflow toolchain op ${dag}.`].join('\n');
}

/** De meldingen in een issuebody (de lijstregels). @param {string} body */
export function meldingenIn(body) {
  return body
    .split(/\r?\n/)
    .filter((regel) => regel.startsWith('- '))
    .map((regel) => regel.slice(2));
}

/** @typedef {{ token: string, repo: string, fetch: typeof globalThis.fetch }} GitHub */

/**
 * Eén aanroep naar de GitHub-API; elke fout gooit `GitHub-API: <pad>: …`.
 * @param {string} pad @param {GitHub} github @param {{ method?: string, body?: unknown }} [opties] @returns {Promise<unknown>}
 */
async function api(pad, { token, fetch }, opties = {}) {
  try {
    const antwoord = await fetch(`https://api.github.com/${pad}`, {
      method: opties.method ?? 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      ...(opties.body === undefined ? {} : { body: JSON.stringify(opties.body) }),
    });
    if (!antwoord.ok) throw new Fout(`GitHub-API: ${pad}: HTTP ${String(antwoord.status)}`);
    return antwoord.status === 204 ? null : await antwoord.json();
  } catch (fout) {
    throw fout instanceof Fout ? fout : new Fout(`GitHub-API: ${pad}: ${bericht(fout)}`);
  }
}

/** Het oudste open issue van de workflow met de vaste titel, hooguit 10 pagina's van 100. @param {GitHub} github */
async function openIssue(github) {
  const pad = `repos/${github.repo}/issues?state=open&creator=${encodeURIComponent(BOT)}`;
  /** @type {unknown[]} */
  const alle = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const deel = await api(`${pad}&per_page=${String(PER_PAGINA)}&page=${String(pagina)}`, github);
    if (!Array.isArray(deel)) throw new Fout(`GitHub-API: ${pad}: antwoord is geen lijst`);
    alle.push(...deel);
    if (deel.length < PER_PAGINA)
      return alle
        .filter((issue) => veld(issue, 'pull_request') === undefined && veld(issue, 'title') === TITEL)
        .filter((issue) => veld(veld(issue, 'user'), 'login') === BOT)
        .map((issue) => ({ nummer: Number(veld(issue, 'number')), body: String(veld(issue, 'body') ?? '') }))
        .toSorted((a, b) => a.nummer - b.nummer)[0];
  }
  throw new Fout(`GitHub-API: ${pad}: meer dan ${String(MAX_PAGINAS)} pagina's`);
}

/**
 * Houdt het ene issue bij (AC-9) en geeft de regel over het issue terug.
 * @param {string[]} regels de meldingen @param {string} dag @param {GitHub} github @returns {Promise<string>}
 */
export async function schrijfIssue(regels, dag, github) {
  const issues = `repos/${github.repo}/issues`;
  const open = await openIssue(github);
  if (open === undefined && regels.length === 0) return 'Geen issue nodig.';
  if (open === undefined) {
    const nieuw = await api(issues, github, { method: 'POST', body: { title: TITEL, body: issueBody(regels, dag) } });
    const nummer = veld(nieuw, 'number');
    if (typeof nummer !== 'number') throw new Fout(`GitHub-API: ${issues}: number ontbreekt`);
    return `Issue #${String(nummer)} aangemaakt.`;
  }
  const issue = `${issues}/${String(open.nummer)}`;
  if (regels.length === 0) {
    const sluit = `Geen melding meer op ${dag}: de toolchain volgt het beleid.`;
    await api(`${issue}/comments`, github, { method: 'POST', body: { body: sluit } });
    await api(issue, github, { method: 'PATCH', body: { state: 'closed' } });
    return `Issue #${String(open.nummer)} gesloten.`;
  }
  if (meldingenIn(open.body).join('\n') === regels.join('\n')) return `Issue #${String(open.nummer)} ongewijzigd.`;
  await api(issue, github, { method: 'PATCH', body: { body: issueBody(regels, dag) } });
  const comment = `De meldingen zijn veranderd op ${dag}; zie de beschrijving.`;
  await api(`${issue}/comments`, github, { method: 'POST', body: { body: comment } });
  return `Issue #${String(open.nummer)} bijgewerkt.`;
}

// --- de hele check ----------------------------------------------------------------------------------------------------------

/** @param {string[]} args */
function leesOpties(args) {
  const onbekend = args.find((arg) => arg !== '--json' && arg !== '--issue');
  if (onbekend !== undefined) throw new Fout(`onbekende waarde: ${onbekend}`);
  return { json: args.includes('--json'), issue: args.includes('--issue') };
}

/** @param {Record<string, string | undefined>} env */
function githubEnv(env) {
  for (const naam of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'])
    if ((env[naam] ?? '') === '') throw new Fout(`${naam} ontbreekt`);
  return { token: env['GITHUB_TOKEN'] ?? '', repo: env['GITHUB_REPOSITORY'] ?? '' };
}

/**
 * De hele check: pins lezen, bronnen ophalen, beoordelen en met `--issue` het issue bijhouden. Elke fout is exitcode 2,
 * met `--json` als `{ "fout": … }`.
 * @param {{ args: string[], env: Record<string, string | undefined>, fetch: typeof globalThis.fetch, nu: number, lees: Lezer }} omgeving
 * @returns {Promise<Uitslag>}
 */
export async function draai({ args, env, fetch, nu, lees }) {
  let json = args.includes('--json');
  try {
    const opties = leesOpties(args);
    json = opties.json;
    const github = opties.issue ? { ...githubEnv(env), fetch } : null;
    const pins = leesPins(lees);
    const oordeel = beoordeel({ pins, bronnen: await haalBronnen(fetch, pins), nu });
    const uitslag = rapport(oordeel, pins);
    const tekst = json ? JSON.stringify(oordeel) : uitslag.tekst;
    if (github === null) return { code: uitslag.code, tekst };
    const regel = await schrijfIssue(meldingen(oordeel), dagVan(nu), github).catch((/** @type {unknown} */ fout) => {
      throw new Fout(json ? bericht(fout) : `${uitslag.tekst}\n${bericht(fout)}`);
    });
    return { code: 0, tekst: json ? tekst : `${tekst}\n${regel}` };
  } catch (fout) {
    // Elke fout is exitcode 2, ook een onverwachte: nooit groen en nooit verward met achterstand (AC-8).
    return { code: 2, tekst: json ? JSON.stringify({ fout: bericht(fout) }) : bericht(fout) };
  }
}

async function main() {
  const root = path.join(import.meta.dirname, '..', '..');
  const args = process.argv.slice(2);
  const uitslag = await draai({
    args,
    env: process.env,
    fetch: globalThis.fetch,
    nu: Date.now(),
    lees: (bestand) => readFileSync(path.join(root, bestand), 'utf8'),
  });
  if (uitslag.code === 0 || args.includes('--json')) console.log(uitslag.tekst);
  else console.error(uitslag.tekst);
  process.exitCode = uitslag.code;
}

if (import.meta.main) await main();
