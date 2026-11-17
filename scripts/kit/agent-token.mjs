// node scripts/kit/agent-token.mjs <app-id> [--repo <owner>/<repo>] [--sleutel <pad>] [--uit <pad>] (spec agent-token):
// maakt een installatietoken van hoogstens een uur voor de GitHub App van de agent, alleen voor één repository, en schrijft
// het atomair naar een bestand met modus 600. De eigenaar draait het buiten de sandbox uit de versie op `main`:
//   gh api -H 'Accept: application/vnd.github.raw' 'repos/<o>/<r>/contents/scripts/kit/agent-token.mjs?ref=main' \
//     | node --input-type=module - <app-id>
// Daarom alleen `node:`-imports en geen pad uit import.meta (AC-7, AC-8). Het token en de JWT komen nooit in de uitvoer.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createSign, randomBytes } from 'node:crypto';
import { closeSync, fchmodSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const API = 'https://api.github.com';
const GEBRUIK =
  'Gebruik: node scripts/kit/agent-token.mjs <app-id> [--repo <owner>/<repo>] [--sleutel <pad>] [--uit <pad>]';
const APP_ID = /^[0-9]+$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * '<owner>/<repo>' volgens AC-2: alleen toegestane tekens en geen segment van alleen punten (`.`, `..`), dat het API-pad
 * zou verschuiven.
 * @param {string} repo
 */
const geldigeRepo = (repo) => REPO.test(repo) && repo.split('/').every((segment) => !/^\.+$/.test(segment));
// iat ligt een minuut terug voor klokverschil met GitHub; exp blijft onder de grens van tien minuten.
const TERUG_S = 60;
const VOORUIT_S = 540;

export class AgentTokenError extends Error {}

/** @param {string | Buffer} waarde */
const base64url = (waarde) => Buffer.from(waarde).toString('base64url');

/**
 * De JWT waarmee de App zich bij GitHub meldt (AC-1).
 * @param {string} appId
 * @param {string} privateKeyPem
 * @param {number} nu epoch-milliseconden
 * @returns {string}
 */
export function buildJwt(appId, privateKeyPem, nu) {
  const seconden = Math.floor(nu / 1000);
  const kop = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const lading = base64url(JSON.stringify({ iss: appId, iat: seconden - TERUG_S, exp: seconden + VOORUIT_S }));
  const handtekening = createSign('RSA-SHA256').update(`${kop}.${lading}`).sign(createPrivateKey(privateKeyPem));
  return `${kop}.${lading}.${base64url(handtekening)}`;
}

/**
 * 'owner/repo' uit een GitHub-remote, anders null; dezelfde regels als `repositoryName` in
 * rails/hooks/lib/authority-context.mjs (AC-3, een test vergelijkt beide).
 * @param {string} url
 * @returns {string | null}
 */
export function repoUitRemote(url) {
  const ssh = /^git@github\.com:([\w-]+\/[\w.-]+?)(?:\.git)?$/.exec(url)?.[1];
  if (ssh !== undefined) return ssh;
  try {
    const remote = new URL(url);
    const naam = remote.pathname.replace(/^\//, '').replace(/\.git$/, '');
    const github = remote.hostname === 'github.com' && ['https:', 'ssh:'].includes(remote.protocol);
    return github && /^[\w-]+\/[\w.-]+$/.test(naam) ? naam : null;
  } catch {
    return null;
  }
}

/**
 * Leest de sleutel; weigert een ontbrekend, onleesbaar of te open bestand (AC-6). De inhoud komt nooit in een melding.
 * @param {string} pad
 * @returns {string}
 */
function leesSleutel(pad) {
  const onleesbaar = `sleutel ${pad} ontbreekt of is onleesbaar; geef het pad mee met --sleutel <pad>`;
  let info;
  try {
    info = statSync(pad);
  } catch {
    throw new AgentTokenError(onleesbaar);
  }
  if (!info.isFile()) throw new AgentTokenError(onleesbaar);
  if ((info.mode & 0o077) !== 0) {
    throw new AgentTokenError(`sleutel ${pad} is leesbaar voor groep of anderen; zet de rechten met chmod 600 ${pad}`);
  }
  try {
    return readFileSync(pad, 'utf8');
  } catch {
    throw new AgentTokenError(onleesbaar);
  }
}

/** @param {string} uit */
function controleerUitMap(uit) {
  const map = path.dirname(uit);
  const isMap = statSync(map, { throwIfNoEntry: false })?.isDirectory() === true;
  if (!isMap) throw new AgentTokenError(`map van het uitvoerpad ${uit} bestaat niet; maak hem aan of kies --uit <pad>`);
}

/**
 * @param {string} appId
 * @param {{ pad: string, pem: string, nu: number }} sleutel
 */
function jwtVoor(appId, { pad, pem, nu }) {
  try {
    return buildJwt(appId, pem, nu);
  } catch {
    throw new AgentTokenError(`sleutel ${pad} is geen geldige RSA-sleutel; geef een ander pad mee met --sleutel <pad>`);
  }
}

/**
 * Eén verzoek aan GitHub. Een melding noemt methode, pad en status, nooit de antwoordtekst of de JWT (AC-5).
 * @param {typeof fetch} doeFetch
 * @param {{ methode: 'GET' | 'POST', pad: string, jwt: string, body?: string }} verzoek
 * @returns {Promise<unknown>}
 */
async function vraag(doeFetch, { methode, pad, jwt, body }) {
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${jwt}`,
    'User-Agent': 'agent-token',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let antwoord;
  try {
    antwoord = await doeFetch(`${API}${pad}`, { method: methode, headers, body: body ?? null });
  } catch {
    throw new AgentTokenError(`${methode} ${pad}: geen verbinding met GitHub`);
  }
  if (!antwoord.ok) throw new AgentTokenError(`${methode} ${pad} gaf status ${String(antwoord.status)}`);
  try {
    return await antwoord.json();
  } catch {
    throw new AgentTokenError(`${methode} ${pad} (status ${String(antwoord.status)}): het antwoord is geen JSON`);
  }
}

/**
 * @param {unknown} data
 * @param {string} veld
 * @returns {unknown}
 */
function veldUit(data, veld) {
  return typeof data === 'object' && data !== null
    ? Object.entries(data).find(([sleutel]) => sleutel === veld)?.[1]
    : undefined;
}

/**
 * De rechten van het token als korte tekst, alleen namen en niveaus.
 * @param {unknown} rechten
 * @returns {string}
 */
function rechtenTekst(rechten) {
  if (typeof rechten !== 'object' || rechten === null) return 'onbekend';
  const paren = Object.entries(rechten).filter(([, niveau]) => typeof niveau === 'string');
  return paren.length === 0 ? 'onbekend' : paren.map(([naam, niveau]) => `${naam}=${String(niveau)}`).join(', ');
}

/**
 * Schrijft het token atomair: een nieuw, exclusief aangemaakt tijdelijk bestand met modus 600 in dezelfde map, daarna een
 * hernoeming. Een symlink op het uitvoerpad wordt zelf vervangen; het doel blijft onaangeroerd (AC-4).
 * @param {string} uit
 * @param {string} token
 */
function schrijfAtomair(uit, token) {
  const tijdelijk = path.join(path.dirname(uit), `.${path.basename(uit)}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    const fd = openSync(tijdelijk, 'wx', 0o600);
    try {
      fchmodSync(fd, 0o600);
      writeSync(fd, `${token}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(tijdelijk, uit);
  } catch {
    rmSync(tijdelijk, { force: true });
    throw new AgentTokenError(`kon het token niet naar ${uit} schrijven; kies een ander pad met --uit <pad>`);
  }
}

/**
 * Vraagt de installatie van de App op de repository op, daarna een token voor alleen die repository, en schrijft het
 * naar `uit`. Meldt via `log` alleen repository, pad, vervaltijd en rechten.
 * @param {{ appId: string, repo: string, sleutel: string, uit: string }} opties
 * @param {{ fetch: typeof fetch, nu: number, log: (regel: string) => void }} omgeving
 * @returns {Promise<{ uit: string, verval: string }>}
 */
export async function maakToken({ appId, repo, sleutel, uit }, omgeving) {
  if (!APP_ID.test(appId)) throw new AgentTokenError(`App-ID "${appId}" bestaat niet alleen uit cijfers`);
  if (!geldigeRepo(repo)) throw new AgentTokenError(`repository "${repo}" is geen <owner>/<repo>`);
  const pem = leesSleutel(sleutel);
  controleerUitMap(uit);
  const jwt = jwtVoor(appId, { pad: sleutel, pem, nu: omgeving.nu });
  const installatie = await vraag(omgeving.fetch, { methode: 'GET', pad: `/repos/${repo}/installation`, jwt });
  const id = veldUit(installatie, 'id');
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
    throw new AgentTokenError(`GET /repos/${repo}/installation: het antwoord bevat geen installatie-id`);
  }
  const pad = `/app/installations/${String(id)}/access_tokens`;
  const body = JSON.stringify({ repositories: [repo.slice(repo.indexOf('/') + 1)] });
  const antwoord = await vraag(omgeving.fetch, { methode: 'POST', pad, jwt, body });
  const token = veldUit(antwoord, 'token');
  const verval = veldUit(antwoord, 'expires_at');
  if (typeof token !== 'string' || token === '' || typeof verval !== 'string' || verval === '') {
    throw new AgentTokenError(`POST ${pad}: het antwoord mist token of expires_at`);
  }
  schrijfAtomair(uit, token);
  omgeving.log(`✓ agent-token: token voor ${repo} geschreven naar ${uit}`);
  omgeving.log(`  vervalt: ${verval}`);
  omgeving.log(`  rechten: ${rechtenTekst(veldUit(antwoord, 'permissions'))}`);
  return { uit, verval };
}

/**
 * De argumenten, of null bij verkeerd gebruik (AC-2). Leest niets en doet geen verzoek.
 * @returns {{ appId: string, repo: string | undefined, sleutel: string | undefined, uit: string | undefined } | null}
 */
function leesArgumenten() {
  let gelezen;
  try {
    gelezen = parseArgs({
      allowPositionals: true,
      options: { repo: { type: 'string' }, sleutel: { type: 'string' }, uit: { type: 'string' } },
    });
  } catch {
    return null;
  }
  const { values, positionals } = gelezen;
  const [appId] = positionals;
  if (appId === undefined || positionals.length !== 1 || !APP_ID.test(appId)) return null;
  if (values.repo !== undefined && !geldigeRepo(values.repo)) return null;
  return { appId, repo: values.repo, sleutel: values.sleutel, uit: values.uit };
}

/** @returns {string} `remote.origin.url` van de repo in de huidige map, of '' zonder repo of origin */
function originUrl() {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** @returns {string} 'owner/repo' uit `remote.origin.url` in de huidige map (AC-3) */
function repoUitOrigin() {
  const repo = repoUitRemote(originUrl());
  if (repo === null || !geldigeRepo(repo)) {
    throw new AgentTokenError(
      'geen GitHub-repository in remote.origin.url; geef de repository mee met --repo <owner>/<repo>',
    );
  }
  return repo;
}

/** @returns {string} */
function standaardUit() {
  const uid = process.getuid?.();
  if (uid === undefined) throw new AgentTokenError('geen standaard uitvoerpad op dit systeem; geef --uit <pad> mee');
  return path.join('/tmp', `claude-${String(uid)}`, 'agent-token');
}

async function main() {
  const args = leesArgumenten();
  if (args === null) {
    console.error(GEBRUIK);
    process.exitCode = 2;
    return;
  }
  try {
    const opties = {
      appId: args.appId,
      repo: args.repo ?? repoUitOrigin(),
      sleutel: args.sleutel ?? path.join(homedir(), '.ssh', 'template-agent.pem'),
      uit: args.uit ?? standaardUit(),
    };
    await maakToken(opties, { fetch: globalThis.fetch, nu: Date.now(), log: (regel) => console.info(regel) });
  } catch (error) {
    // Alleen eigen meldingen; een onverwachte fout kan details bevatten, dus alleen de soort (geen stacktrace).
    const melding =
      error instanceof AgentTokenError
        ? error.message
        : `onverwachte fout (${error instanceof Error ? error.name : 'onbekend'})`;
    console.error(`✗ agent-token: ${melding}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
