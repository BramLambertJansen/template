// Tests voor scripts/kit/agent-token.mjs (spec docs/template/specs/agent-token.md, AC-1 t/m AC-8), geschreven vóór de bouw.
// Geen netwerk: de functies krijgen een nep-`fetch` en een vaste `nu`; de ingang draait via spawnSync met een voorlader
// (`node --import <nep-fetch.mjs>`) die `globalThis.fetch` vervangt en elk verzoek vastlegt.
//
// De interface die de developer bouwt (zo klein mogelijk, alleen `node:`-imports, ingang achter `import.meta.main`):
//
//   export function buildJwt(appId: string, privateKeyPem: string, nu: number): string
//     nu = epoch-milliseconden (zoals Date.now()); iat = floor(nu / 1000) - 60, exp = floor(nu / 1000) + 540; RS256.
//   export function repoUitRemote(url: string): string | null
//     'owner/repo' uit een GitHub-remote, anders null; dezelfde uitkomst als `repositoryName` (authority-context.mjs).
//   export async function maakToken(
//     opties: { appId: string; repo: string /* 'owner/repo' */; sleutel: string; uit: string },
//     omgeving: { fetch: typeof fetch; nu: number; log: (regel: string) => void },
//   ): Promise<unknown>
//     leest en controleert de sleutel, vraagt GET https://api.github.com/repos/<o>/<r>/installation en daarna
//     POST https://api.github.com/app/installations/<id>/access_tokens met body {"repositories":["<r>"]} (beide met
//     `Authorization: Bearer <jwt>`), schrijft het token atomair naar `uit` (modus 600) en meldt via `log` alleen pad en
//     vervaltijd. Bij elke fout gooit het een Error met een Nederlandse melding zonder token, JWT, antwoordtekst of stack.
//   De ingang (`import.meta.main`) valideert de argumenten (exit 2 + gebruiksregel), leest anders `remote.origin.url`
//   via `git config` in de huidige map, roept maakToken aan en meldt fouten met exit 1.
//
// Dat de tester scripts/kit/agent-token.mjs niet mag schrijven (rolhek), is de reden dat de module dynamisch wordt geladen:
// ontbreekt het bestand, dan falen de tests op een assertie met een duidelijke melding in plaats van op een importfout.
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { repositoryName } from '../../rails/hooks/lib/authority-context.mjs';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { expectAbsent } from '../support/absence.ts';

interface Opties {
  appId: string;
  repo: string;
  sleutel: string;
  uit: string;
}
interface Omgeving {
  fetch: typeof fetch;
  nu: number;
  log: (regel: string) => void;
}
interface AgentTokenModule {
  buildJwt: (appId: string, privateKeyPem: string, nu: number) => string;
  repoUitRemote: (url: string) => string | null;
  maakToken: (opties: Opties, omgeving: Omgeving) => Promise<unknown>;
}

const SCRIPT = path.join(import.meta.dirname, '../../scripts/kit/agent-token.mjs');
const MIST = 'scripts/kit/agent-token.mjs bestaat niet: de developer bouwt het (spec agent-token)';

async function laad(): Promise<AgentTokenModule> {
  if (existsSync(SCRIPT))
    return unsafeCast(await import(pathToFileURL(SCRIPT).href), 'dynamische import; de vorm staat in AgentTokenModule');
  return {
    buildJwt: () => expect.fail(MIST),
    repoUitRemote: () => expect.fail(MIST),
    maakToken: () => Promise.resolve().then(() => expect.fail(MIST)),
  };
}
const { buildJwt, repoUitRemote, maakToken } = await laad();

const sleutelPaar = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const ANDER_PAAR = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const APP_ID = '123456';
const NU = 1_700_000_000_999; // ms; 999 ms om "hele seconden" af te dwingen
const NU_S = 1_700_000_000;
const TOKEN = 'ghs_TOKENGEHEIM0123456789';
const VERVAL = '2026-11-17T12:00:00Z';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-token-'));
  dirs.push(dir);
  return dir;
}

function schrijfSleutel(dir: string, modus = 0o600): string {
  const bestand = path.join(dir, 'sleutel.pem');
  writeFileSync(bestand, sleutelPaar.privateKey, { mode: modus });
  chmodSync(bestand, modus);
  return bestand;
}

interface Opzet {
  dir: string;
  sleutel: string;
  uitDir: string;
  uit: string;
}
function opzet(): Opzet {
  const dir = tmp();
  const uitDir = path.join(dir, 'uit');
  mkdirSync(uitDir);
  return { dir, sleutel: schrijfSleutel(dir), uitDir, uit: path.join(uitDir, 'agent-token') };
}

function modus(bestand: string): number {
  return statSync(bestand).mode & 0o777;
}

// --- JWT ---------------------------------------------------------------------------------------------------------------

function ontleed(jwt: string): { kop: unknown; lading: unknown; ondertekend: string; handtekening: string } {
  const delen = jwt.split('.');
  expect(delen).toHaveLength(3);
  const [kop = '', lading = '', handtekening = ''] = delen;
  const json = (deel: string): unknown => JSON.parse(Buffer.from(deel, 'base64url').toString('utf8'));
  return { kop: json(kop), lading: json(lading), ondertekend: `${kop}.${lading}`, handtekening };
}

function verifieert(jwt: string, publiek: string): boolean {
  const { ondertekend, handtekening } = ontleed(jwt);
  return createVerify('RSA-SHA256')
    .update(ondertekend)
    .verify(createPublicKey(publiek), Buffer.from(handtekening, 'base64url'));
}

// --- nep-fetch voor de functies ------------------------------------------------------------------------------------------

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}
function nepFetch(handler: (call: Call, nummer: number) => Response | Promise<Response>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const nep: typeof fetch = async (input, init) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : String(input)),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
    };
    calls.push(call);
    return await handler(call, calls.length);
  };
  return { fetch: nep, calls };
}

function goed(call: Call): Response {
  if (call.url.pathname.endsWith('/installation')) return Response.json({ id: 42 });
  return Response.json({ token: TOKEN, expires_at: VERVAL, permissions: { contents: 'write' } }, { status: 201 });
}

function jwtUit(call: Call): string {
  const kop = call.headers.get('authorization') ?? '';
  expect(kop).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  return kop.replace('Bearer ', '');
}

async function foutmelding(belofte: Promise<unknown>): Promise<string> {
  try {
    await belofte;
  } catch (error) {
    if (error instanceof Error && error.message.includes(MIST)) throw error;
    return error instanceof Error ? error.message : String(error);
  }
  return expect.fail('verwacht een fout, maar maakToken slaagde');
}

/** Een melding of uitvoer bevat geen stacktrace. */
function zonderStack(tekst: string): void {
  expectAbsent(tekst, /\n\s+at \S/, {
    recognizes: ['Error: x\n    at fout (/pad/bestand.mjs:1:1)', 'x\n at y'],
    allows: ['Bij het aanvragen'],
  });
}

function omgeving(nep: typeof fetch, log: string[] = []): Omgeving {
  return { fetch: nep, nu: NU, log: (regel) => void log.push(regel) };
}

function opties(o: Opzet, extra: Partial<Opties> = {}): Opties {
  return { appId: APP_ID, repo: 'o/r', sleutel: o.sleutel, uit: o.uit, ...extra };
}

// --- de ingang via spawnSync met nep-fetch als voorlader -----------------------------------------------------------------

const VOORLADER = `import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, init = {}) => {
  const regel = { methode: init.method ?? 'GET', url: String(url), headers: Object.fromEntries(new Headers(init.headers)), body: typeof init.body === 'string' ? init.body : null };
  appendFileSync(process.env.FAKE_CALLS, JSON.stringify(regel) + '\\n');
  const modus = process.env.FAKE_MODE ?? 'ok';
  if (modus === 'net') throw new TypeError('fetch failed SECRET-NET');
  if (modus === 'deny') return new Response('SECRET-BODY', { status: 401 });
  if (String(url).endsWith('/installation')) return Response.json({ id: 42 });
  return Response.json({ token: process.env.FAKE_TOKEN, expires_at: '${VERVAL}', permissions: { contents: 'write' } }, { status: 201 });
};
`;

const AanroepSchema = z.object({
  methode: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});

interface Uitslag {
  status: number | null;
  stdout: string;
  stderr: string;
  alles: string;
  calls: z.infer<typeof AanroepSchema>[];
}
interface Draai {
  args: string[];
  cwd?: string;
  home?: string;
  modus?: 'ok' | 'deny' | 'net';
  stdin?: boolean;
}

function draai(opdracht: Draai): Uitslag {
  expect(existsSync(SCRIPT), MIST).toBe(true);
  const dir = tmp();
  const voorlader = path.join(dir, 'nep-fetch.mjs');
  const aanroepen = path.join(dir, 'aanroepen.jsonl');
  writeFileSync(voorlader, VOORLADER);
  const uitvoering = opdracht.stdin === true ? ['--input-type=module', '-'] : [SCRIPT];
  const resultaat = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(voorlader).href, ...uitvoering, ...opdracht.args],
    {
      cwd: opdracht.cwd ?? dir,
      input: opdracht.stdin === true ? readFileSync(SCRIPT, 'utf8') : undefined,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: opdracht.home ?? dir,
        FAKE_CALLS: aanroepen,
        FAKE_MODE: opdracht.modus ?? 'ok',
        FAKE_TOKEN: TOKEN,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  );
  const calls = existsSync(aanroepen)
    ? readFileSync(aanroepen, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((regel) => AanroepSchema.parse(JSON.parse(regel)))
    : [];
  return {
    status: resultaat.status,
    stdout: resultaat.stdout,
    stderr: resultaat.stderr,
    alles: resultaat.stdout + resultaat.stderr,
    calls,
  };
}

function gitRepo(origin: string | null): string {
  const dir = tmp();
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  expect(spawnSync('git', ['init', '-q', dir], { env }).status).toBe(0);
  if (origin !== null) expect(spawnSync('git', ['remote', 'add', 'origin', origin], { cwd: dir, env }).status).toBe(0);
  return dir;
}

// =====================================================================================================================
// AC-1: de JWT
// =====================================================================================================================

describe('agent-token/AC-1: JWT voor de App', () => {
  test('agent-token/AC-1: kop, iss, iat en exp in hele seconden, handtekening verifieert', () => {
    const jwt = buildJwt(APP_ID, sleutelPaar.privateKey, NU);
    const { kop, lading } = ontleed(jwt);
    expect(kop).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(lading).toEqual({ iss: APP_ID, iat: NU_S - 60, exp: NU_S + 540 });
    expect(verifieert(jwt, sleutelPaar.publicKey)).toBe(true);
  });

  test('agent-token/AC-1: iss is een string, iat en exp zijn gehele getallen, exp blijft onder 10 minuten', () => {
    const { lading } = ontleed(buildJwt('7', sleutelPaar.privateKey, NU));
    const parsed = z.object({ iss: z.string(), iat: z.number().int(), exp: z.number().int() }).parse(lading);
    expect(parsed.iss).toBe('7');
    expect(parsed.exp - NU_S).toBeLessThan(600);
    expect(parsed.exp - parsed.iat).toBe(600);
  });

  test('agent-token/AC-1: base64url zonder opvulling en een handtekening die bij een andere sleutel niet verifieert', () => {
    const jwt = buildJwt(APP_ID, sleutelPaar.privateKey, NU);
    expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifieert(jwt, ANDER_PAAR.publicKey)).toBe(false);
  });

  test('agent-token/AC-1: de tijd komt uit het argument, niet uit de klok', () => {
    const later = ontleed(buildJwt(APP_ID, sleutelPaar.privateKey, NU + 3_600_000)).lading;
    expect(later).toEqual({ iss: APP_ID, iat: NU_S - 60 + 3600, exp: NU_S + 540 + 3600 });
  });
});

// =====================================================================================================================
// AC-2: argumenten
// =====================================================================================================================

describe('agent-token/AC-2: ongeldige argumenten geven exit 2 zonder sleutel te lezen of verzoek te doen', () => {
  const ONTBREKEND = '/nergens/bestaat-niet.pem';
  const gevallen: [string, string[]][] = [
    ['App-ID met letters', ['abc', '--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['App-ID met cijfers en letters', ['12a', '--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['leeg App-ID', ['', '--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['negatief App-ID', ['-5', '--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['geen App-ID', ['--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['geen argumenten', []],
    ['onbekende optie', ['123', '--onbekend', '--repo', 'o/r', '--sleutel', ONTBREKEND]],
    ['--repo zonder repository', ['123', '--repo', 'o', '--sleutel', ONTBREKEND]],
    ['--repo met extra pad', ['123', '--repo', 'o/r/x', '--sleutel', ONTBREKEND]],
    ['--repo met spatie', ['123', '--repo', 'o r/x', '--sleutel', ONTBREKEND]],
    ['--repo met puntkomma', ['123', '--repo', 'o/r;ls', '--sleutel', ONTBREKEND]],
    ['--repo leeg', ['123', '--repo', '', '--sleutel', ONTBREKEND]],
    ['--repo met twee puntsegmenten', ['123', '--repo', '../..', '--sleutel', ONTBREKEND]],
    ['--repo met puntpuntsegment als repository', ['123', '--repo', 'o/..', '--sleutel', ONTBREKEND]],
    ['--repo met puntpuntsegment als eigenaar', ['123', '--repo', '../r', '--sleutel', ONTBREKEND]],
    ['--repo met puntsegment als eigenaar', ['123', '--repo', './r', '--sleutel', ONTBREKEND]],
    ['--repo met puntsegment als repository', ['123', '--repo', 'o/.', '--sleutel', ONTBREKEND]],
    ['--repo met alleen punten in beide segmenten', ['123', '--repo', './.', '--sleutel', ONTBREKEND]],
  ];

  test.each(gevallen)('agent-token/AC-2: %s', (_naam, args) => {
    const uitslag = draai({ args });
    expect(uitslag.status).toBe(2);
    expect(uitslag.alles).toContain('agent-token.mjs');
    expect(uitslag.alles).toContain('<app-id>');
    expect(uitslag.alles).not.toContain(ONTBREKEND);
    expect(uitslag.calls).toEqual([]);
  });

  test('agent-token/AC-2: geldige argumenten met een onbekende sleutel geven geen exit 2 (controle op de tegenproef)', () => {
    const uitslag = draai({ args: ['123', '--repo', 'o/r', '--sleutel', ONTBREKEND] });
    expect(uitslag.status).toBe(1);
  });
});

// =====================================================================================================================
// AC-3: repository uit origin
// =====================================================================================================================

describe('agent-token/AC-3: repository uit remote.origin.url', () => {
  const tabel: [string, string | null][] = [
    ['https://github.com/o/r', 'o/r'],
    ['https://github.com/o/r.git', 'o/r'],
    ['https://user@github.com/o/r.git', 'o/r'],
    ['git@github.com:o/r', 'o/r'],
    ['git@github.com:o/r.git', 'o/r'],
    ['ssh://git@github.com/o/r', 'o/r'],
    ['ssh://git@github.com/o/r.git', 'o/r'],
    ['https://github.com/Eigenaar-1/mijn.repo.git', 'Eigenaar-1/mijn.repo'],
    ['git@github.com:Eigenaar-1/mijn_repo.git', 'Eigenaar-1/mijn_repo'],
    ['https://gitlab.com/o/r.git', null],
    ['git@gitlab.com:o/r.git', null],
    ['ssh://git@gitlab.com/o/r.git', null],
    ['http://github.com/o/r.git', null],
    ['https://github.com/o', null],
    ['https://github.com/o/r/extra', null],
    ['/srv/git/r.git', null],
    ['../r', null],
    ['file:///srv/git/r.git', null],
    ['', null],
  ];

  test.each(tabel)('agent-token/AC-3: repoUitRemote(%j) is %j en gelijk aan repositoryName', (url, verwacht) => {
    expect(repoUitRemote(url)).toBe(verwacht);
    expect(repoUitRemote(url)).toBe(repositoryName(url));
  });

  test.each([
    ['ontbrekende origin', null],
    ['lokaal pad als origin', '/srv/git/r.git'],
    ['andere host als origin', 'https://gitlab.com/o/r.git'],
  ])('agent-token/AC-3: %s geeft exit 1 met --repo in de melding, zonder verzoek', (_naam, origin) => {
    const { sleutel, uit, uitDir } = opzet();
    const uitslag = draai({ args: ['123', '--sleutel', sleutel, '--uit', uit], cwd: gitRepo(origin) });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('--repo');
    expect(uitslag.calls).toEqual([]);
    expect(readdirSync(uitDir)).toEqual([]);
  });

  test.each(['https://github.com/o/r.git', 'git@github.com:o/r.git', 'ssh://git@github.com/o/r'])(
    'agent-token/AC-3: zonder --repo gebruikt het script origin %s',
    (origin) => {
      const { sleutel, uit } = opzet();
      const uitslag = draai({ args: ['123', '--sleutel', sleutel, '--uit', uit], cwd: gitRepo(origin), modus: 'deny' });
      expect(uitslag.calls[0]?.methode).toBe('GET');
      expect(uitslag.calls[0]?.url).toBe('https://api.github.com/repos/o/r/installation');
    },
  );

  test('agent-token/AC-3: --repo gaat voor origin', () => {
    const { sleutel, uit } = opzet();
    const uitslag = draai({
      args: ['123', '--repo', 'x/y', '--sleutel', sleutel, '--uit', uit],
      cwd: gitRepo('https://github.com/o/r.git'),
      modus: 'deny',
    });
    expect(uitslag.calls[0]?.url).toBe('https://api.github.com/repos/x/y/installation');
  });
});

// =====================================================================================================================
// AC-4: verzoeken en het tokenbestand
// =====================================================================================================================

describe('agent-token/AC-4: installatie, token en bestand', () => {
  test('agent-token/AC-4: eerst de installatie van de repository, dan een token met alleen de repositorynaam', async () => {
    const o = opzet();
    const nep = nepFetch(goed);
    await maakToken(opties(o), omgeving(nep.fetch));
    expect(nep.calls).toHaveLength(2);
    const [installatie, token] = nep.calls;
    expect(installatie?.method).toBe('GET');
    expect(installatie?.url.origin).toBe('https://api.github.com');
    expect(installatie?.url.pathname).toBe('/repos/o/r/installation');
    expect(token?.method).toBe('POST');
    expect(token?.url.origin).toBe('https://api.github.com');
    expect(token?.url.pathname).toBe('/app/installations/42/access_tokens');
    expect(JSON.parse(token?.body ?? 'null')).toEqual({ repositories: ['r'] });
  });

  test('agent-token/AC-4: beide verzoeken dragen de JWT van de App met de meegegeven tijd', async () => {
    const o = opzet();
    const nep = nepFetch(goed);
    await maakToken(opties(o), omgeving(nep.fetch));
    for (const call of nep.calls) {
      const jwt = jwtUit(call);
      expect(ontleed(jwt).lading).toEqual({ iss: APP_ID, iat: NU_S - 60, exp: NU_S + 540 });
      expect(verifieert(jwt, sleutelPaar.publicKey)).toBe(true);
    }
  });

  test('agent-token/AC-4: het token staat in het uitvoerbestand met modus 600, zonder resten in de map', async () => {
    const o = opzet();
    await maakToken(opties(o), omgeving(nepFetch(goed).fetch));
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
    expect(modus(o.uit)).toBe(0o600);
    expect(readdirSync(o.uitDir)).toEqual(['agent-token']);
  });

  test('agent-token/AC-4: log meldt pad en vervaltijd, nooit het token of de JWT', async () => {
    const o = opzet();
    const nep = nepFetch(goed);
    const log: string[] = [];
    await maakToken(opties(o), omgeving(nep.fetch, log));
    const tekst = log.join('\n');
    expect(tekst).toContain(o.uit);
    expect(tekst).toContain(VERVAL);
    expect(tekst).not.toContain(TOKEN);
    for (const call of nep.calls) expect(tekst).not.toContain(jwtUit(call));
  });

  test('agent-token/AC-4: de succesmelding in log noemt de repository <owner>/<repo>', async () => {
    const o = opzet();
    const log: string[] = [];
    await maakToken(opties(o, { repo: 'acme/widgets' }), omgeving(nepFetch(goed).fetch, log));
    expect(log.join('\n')).toContain('acme/widgets');
  });

  test('agent-token/AC-4: de ingang noemt in stdout de repository uit --repo', () => {
    const o = opzet();
    const uitslag = draai({ args: [APP_ID, '--repo', 'acme/widgets', '--sleutel', o.sleutel, '--uit', o.uit] });
    expect(uitslag.status).toBe(0);
    expect(uitslag.stdout).toContain('acme/widgets');
    expect(uitslag.alles).not.toContain(TOKEN);
  });

  test('agent-token/AC-4: de ingang noemt in stdout de repository die uit origin komt', () => {
    const o = opzet();
    const uitslag = draai({
      args: [APP_ID, '--sleutel', o.sleutel, '--uit', o.uit],
      cwd: gitRepo('git@github.com:acme/widgets.git'),
    });
    expect(uitslag.status).toBe(0);
    expect(uitslag.stdout).toContain('acme/widgets');
  });

  test('agent-token/AC-4: ontbrekende map van het uitvoerpad geeft een fout met pad en --uit, zonder verzoek', async () => {
    const o = opzet();
    const uit = path.join(o.dir, 'bestaat-niet', 'agent-token');
    const nep = nepFetch(goed);
    const melding = await foutmelding(maakToken(opties(o, { uit }), omgeving(nep.fetch)));
    expect(melding).toContain(uit);
    expect(melding).toContain('--uit');
    expect(nep.calls).toEqual([]);
    expect(existsSync(uit)).toBe(false);
  });

  test('agent-token/AC-4: een symlink als uitvoerpad wordt zelf vervangen en het doel blijft onaangeroerd', async () => {
    const o = opzet();
    const doel = path.join(o.uitDir, 'doel');
    writeFileSync(doel, 'ORIGINEEL', { mode: 0o644 });
    chmodSync(doel, 0o644);
    symlinkSync(doel, o.uit);
    await maakToken(opties(o), omgeving(nepFetch(goed).fetch));
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
    expect(lstatSync(o.uit).isSymbolicLink()).toBe(false);
    expect(modus(o.uit)).toBe(0o600);
    expect(readFileSync(doel, 'utf8')).toBe('ORIGINEEL');
    expect(modus(doel)).toBe(0o644);
    expect(readdirSync(o.uitDir).sort()).toEqual(['agent-token', 'doel']);
  });

  test('agent-token/AC-4: een bestaand bestand met modus 644 heeft daarna modus 600', async () => {
    const o = opzet();
    writeFileSync(o.uit, 'OUD', { mode: 0o644 });
    chmodSync(o.uit, 0o644);
    await maakToken(opties(o), omgeving(nepFetch(goed).fetch));
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
    expect(modus(o.uit)).toBe(0o600);
  });

  test('agent-token/AC-4: twee keer kort na elkaar: het tweede token vervangt het eerste, één bestand met modus 600', async () => {
    const o = opzet();
    const tweede = nepFetch((call) =>
      call.url.pathname.endsWith('/installation')
        ? Response.json({ id: 42 })
        : Response.json({ token: 'ghs_TWEEDE', expires_at: VERVAL }, { status: 201 }),
    );
    await maakToken(opties(o), omgeving(nepFetch(goed).fetch));
    await maakToken(opties(o), omgeving(tweede.fetch));
    expect(readFileSync(o.uit, 'utf8').trim()).toBe('ghs_TWEEDE');
    expect(modus(o.uit)).toBe(0o600);
    expect(readdirSync(o.uitDir)).toEqual(['agent-token']);
  });

  test('agent-token/AC-4: de ingang drukt alleen repository, pad, vervaltijd en rechten af, het token en de JWT staan niet in stdout of stderr', () => {
    const o = opzet();
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--sleutel', o.sleutel, '--uit', o.uit] });
    expect(uitslag.status).toBe(0);
    expect(uitslag.stdout).toContain(o.uit);
    expect(uitslag.stdout).toContain(VERVAL);
    expect(uitslag.alles).not.toContain(TOKEN);
    expect(uitslag.alles).not.toContain('PRIVATE KEY');
    expect(uitslag.calls).toHaveLength(2);
    for (const call of uitslag.calls) {
      const jwt = (call.headers['authorization'] ?? '').replace('Bearer ', '');
      expect(verifieert(jwt, sleutelPaar.publicKey)).toBe(true);
      expect(uitslag.alles).not.toContain(jwt);
    }
    expect(JSON.parse(uitslag.calls[1]?.body ?? 'null')).toEqual({ repositories: ['r'] });
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
    expect(modus(o.uit)).toBe(0o600);
  });

  test('agent-token/AC-4: de ingang met een ontbrekende map geeft exit 1 met pad en --uit, zonder verzoek', () => {
    const o = opzet();
    const uit = path.join(o.dir, 'bestaat-niet', 'agent-token');
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--sleutel', o.sleutel, '--uit', uit] });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain(uit);
    expect(uitslag.stderr).toContain('--uit');
    expect(uitslag.calls).toEqual([]);
  });
});

// =====================================================================================================================
// AC-5: fouten van GitHub of het netwerk
// =====================================================================================================================

describe('agent-token/AC-5: fouten laten het uitvoerbestand ongemoeid en lekken niets', () => {
  async function faalt(handler: (call: Call, nummer: number) => Response | Promise<Response>): Promise<{
    melding: string;
    calls: Call[];
    o: Opzet;
  }> {
    const o = opzet();
    writeFileSync(o.uit, 'OUD', { mode: 0o644 });
    chmodSync(o.uit, 0o644);
    const nep = nepFetch(handler);
    const melding = await foutmelding(maakToken(opties(o), omgeving(nep.fetch)));
    // Geen uitvoerbestand geschreven of overschreven, geen tijdelijk bestand achtergelaten.
    expect(readFileSync(o.uit, 'utf8')).toBe('OUD');
    expect(modus(o.uit)).toBe(0o644);
    expect(readdirSync(o.uitDir)).toEqual(['agent-token']);
    expect(melding).not.toContain('SECRET-BODY');
    expect(melding).not.toContain(TOKEN);
    zonderStack(melding);
    for (const call of nep.calls) expect(melding).not.toContain(jwtUit(call));
    return { melding, calls: nep.calls, o };
  }

  test.each([401, 404, 500])(
    'agent-token/AC-5: status %i bij het opvragen van de installatie noemt methode, pad en status',
    async (status) => {
      const { melding, calls } = await faalt(() => new Response('SECRET-BODY', { status }));
      expect(melding).toContain('GET');
      expect(melding).toContain('/repos/o/r/installation');
      expect(melding).toContain(String(status));
      expect(calls).toHaveLength(1);
    },
  );

  test.each([401, 403, 404, 422])(
    'agent-token/AC-5: status %i bij het aanvragen van het token noemt methode, pad en status',
    async (status) => {
      const { melding, calls } = await faalt((call) =>
        call.url.pathname.endsWith('/installation')
          ? Response.json({ id: 42 })
          : new Response('SECRET-BODY', { status }),
      );
      expect(melding).toContain('POST');
      expect(melding).toContain('/app/installations/42/access_tokens');
      expect(melding).toContain(String(status));
      expect(calls).toHaveLength(2);
    },
  );

  test.each([1, 2])(
    'agent-token/AC-5: een netwerkfout bij verzoek %i meldt "geen verbinding" zonder details',
    async (nummer) => {
      const { melding } = await faalt((call, n) => {
        if (n === nummer) throw new TypeError('fetch failed: SECRET-NET-DETAIL');
        return goed(call);
      });
      expect(melding.toLowerCase()).toContain('geen verbinding');
      expect(melding).not.toContain('SECRET-NET-DETAIL');
      expect(melding).not.toContain('fetch failed');
    },
  );

  test.each([1, 2])(
    'agent-token/AC-5: een antwoord dat geen JSON is bij verzoek %i geeft een fout met methode en pad',
    async (nummer) => {
      const { melding } = await faalt((call, n) =>
        n === nummer ? new Response('<html>SECRET-BODY</html>', { status: 200 }) : goed(call),
      );
      expect(melding).toContain(nummer === 1 ? 'GET' : 'POST');
      expect(melding).toContain(nummer === 1 ? '/repos/o/r/installation' : '/app/installations/42/access_tokens');
    },
  );

  test.each([
    ['token ontbreekt', { expires_at: VERVAL }],
    ['expires_at ontbreekt', { token: TOKEN }],
    ['token is geen tekst', { token: 123, expires_at: VERVAL }],
    ['leeg object', {}],
  ])('agent-token/AC-5: antwoord waarin %s geeft een fout en schrijft niets', async (_naam, antwoord) => {
    const { melding } = await faalt((call) =>
      call.url.pathname.endsWith('/installation')
        ? Response.json({ id: 42 })
        : Response.json(antwoord, { status: 201 }),
    );
    expect(melding).toContain('POST');
    expect(melding).toContain('/app/installations/42/access_tokens');
  });

  test('agent-token/AC-5: lukt het hernoemen niet, dan blijft er geen tijdelijk bestand achter en lekt de melding niets', async () => {
    const o = opzet();
    mkdirSync(o.uit); // een map op het uitvoerpad: de hernoeming van het tijdelijke bestand faalt
    const melding = await foutmelding(maakToken(opties(o), omgeving(nepFetch(goed).fetch)));
    expect(melding).not.toContain(TOKEN);
    expect(readdirSync(o.uitDir)).toEqual(['agent-token']);
    expect(lstatSync(o.uit).isDirectory()).toBe(true);
  });

  test('agent-token/AC-5: de ingang geeft exit 1 en lekt geen antwoordtekst bij 401', () => {
    const o = opzet();
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--sleutel', o.sleutel, '--uit', o.uit], modus: 'deny' });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('GET');
    expect(uitslag.stderr).toContain('/repos/o/r/installation');
    expect(uitslag.stderr).toContain('401');
    expect(uitslag.alles).not.toContain('SECRET-BODY');
    expect(uitslag.alles).not.toContain('PRIVATE KEY');
    zonderStack(uitslag.alles);
    expect(readdirSync(o.uitDir)).toEqual([]);
    const jwt = (uitslag.calls[0]?.headers['authorization'] ?? '').replace('Bearer ', '');
    expect(jwt).not.toBe('');
    expect(uitslag.alles).not.toContain(jwt);
  });

  test('agent-token/AC-5: de ingang meldt "geen verbinding" zonder stacktrace bij een netwerkfout', () => {
    const o = opzet();
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--sleutel', o.sleutel, '--uit', o.uit], modus: 'net' });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr.toLowerCase()).toContain('geen verbinding');
    expect(uitslag.alles).not.toContain('SECRET-NET');
    zonderStack(uitslag.alles);
    expect(readdirSync(o.uitDir)).toEqual([]);
  });
});

// =====================================================================================================================
// AC-6: de sleutel
// =====================================================================================================================

describe('agent-token/AC-6: ontbrekende, onleesbare of te open sleutel geeft exit 1 zonder verzoek', () => {
  function sleutelArgs(sleutel: string, uit: string): string[] {
    return [APP_ID, '--repo', 'o/r', '--sleutel', sleutel, '--uit', uit];
  }

  test('agent-token/AC-6: een ontbrekend sleutelbestand noemt het pad en --sleutel', () => {
    const o = opzet();
    const weg = path.join(o.dir, 'weg.pem');
    const uitslag = draai({ args: sleutelArgs(weg, o.uit) });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain(weg);
    expect(uitslag.stderr).toContain('--sleutel');
    expect(uitslag.calls).toEqual([]);
    expect(existsSync(o.uit)).toBe(false);
  });

  test('agent-token/AC-6: een map in plaats van een sleutelbestand (onleesbaar) noemt het pad', () => {
    const o = opzet();
    const uitslag = draai({ args: sleutelArgs(o.uitDir, o.uit) });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain(o.uitDir);
    expect(uitslag.calls).toEqual([]);
  });

  test.each(['644', '640', '604', '660', '666'])(
    'agent-token/AC-6: sleutel met modus %s noemt pad en chmod 600',
    (rechten) => {
      const o = opzet();
      const sleutel = schrijfSleutel(o.dir, Number.parseInt(rechten, 8));
      const uitslag = draai({ args: sleutelArgs(sleutel, o.uit) });
      expect(uitslag.status).toBe(1);
      expect(uitslag.stderr).toContain(sleutel);
      expect(uitslag.stderr).toContain('chmod 600');
      expect(uitslag.alles).not.toContain('PRIVATE KEY');
      expect(uitslag.calls).toEqual([]);
      expect(readdirSync(o.uitDir)).toEqual([]);
    },
  );

  test.each(['600', '400'])(
    'agent-token/AC-6: sleutel met modus %s wordt geaccepteerd (er volgt een verzoek)',
    (rechten) => {
      const o = opzet();
      const sleutel = schrijfSleutel(o.dir, Number.parseInt(rechten, 8));
      const uitslag = draai({ args: sleutelArgs(sleutel, o.uit), modus: 'deny' });
      expect(uitslag.calls).toHaveLength(1);
      expect(uitslag.stderr).not.toContain('chmod 600');
    },
  );

  test('agent-token/AC-6: zonder --sleutel is de standaard ~/.ssh/template-agent.pem', () => {
    const o = opzet();
    const home = tmp();
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--uit', o.uit], home });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain(path.join(home, '.ssh', 'template-agent.pem'));
    expect(uitslag.calls).toEqual([]);
  });

  test('agent-token/AC-6: de standaardsleutel in ~/.ssh wordt gelezen als hij er is en modus 600 heeft', () => {
    const o = opzet();
    const home = tmp();
    mkdirSync(path.join(home, '.ssh'));
    writeFileSync(path.join(home, '.ssh', 'template-agent.pem'), sleutelPaar.privateKey, { mode: 0o600 });
    chmodSync(path.join(home, '.ssh', 'template-agent.pem'), 0o600);
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--uit', o.uit], home });
    expect(uitslag.status).toBe(0);
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
  });

  test('agent-token/AC-6: maakToken zelf weigert een sleutel met rechten voor groep of anderen, zonder verzoek', async () => {
    const o = opzet();
    const sleutel = schrijfSleutel(o.dir, 0o640);
    const nep = nepFetch(goed);
    const melding = await foutmelding(maakToken(opties(o, { sleutel }), omgeving(nep.fetch)));
    expect(melding).toContain(sleutel);
    expect(melding).toContain('chmod 600');
    expect(melding).not.toContain('PRIVATE KEY');
    expect(nep.calls).toEqual([]);
  });

  test('agent-token/AC-6: maakToken zelf weigert een ontbrekend sleutelbestand, zonder verzoek', async () => {
    const o = opzet();
    const weg = path.join(o.dir, 'weg.pem');
    const nep = nepFetch(goed);
    const melding = await foutmelding(maakToken(opties(o, { sleutel: weg }), omgeving(nep.fetch)));
    expect(melding).toContain(weg);
    expect(melding).toContain('--sleutel');
    expect(nep.calls).toEqual([]);
  });
});

// =====================================================================================================================
// AC-7 en AC-8: alleen node:-imports en werking via stdin
// =====================================================================================================================

function bron(): string {
  expect(existsSync(SCRIPT), MIST).toBe(true);
  return readFileSync(SCRIPT, 'utf8');
}

/** Bron zonder commentaar, zodat een opmerking over een verboden constructie niet meetelt. */
function code(tekst: string): string {
  return tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

describe('agent-token/AC-7: geen andere imports dan node:-modules', () => {
  test('agent-token/AC-7: elke import, dynamische import en require wijst naar een node:-module', () => {
    const tekst = code(bron());
    const specifiers = [
      ...[...tekst.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? ''),
      ...[...tekst.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? ''),
      ...[...tekst.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? ''),
      ...[...tekst.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? ''),
    ];
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => !specifier.startsWith('node:'))).toEqual([]);
    expect(specifiers).toContain('node:crypto');
  });

  test('agent-token/AC-7: geen import met een niet-literal specifier (import(variabele), require(variabele))', () => {
    const tekst = code(bron());
    expectAbsent(tekst, /\bimport\s*\(\s*[^'"\s)]/, {
      recognizes: ['import(pad)', 'await import( pad )'],
      allows: ["import('node:fs')"],
    });
    expectAbsent(tekst, /\brequire\s*\(\s*[^'"\s)]/, {
      recognizes: ['require(pad)', 'require( pad )'],
      allows: ["require('node:fs')"],
    });
  });
});

describe('agent-token/AC-8: werkt via stdin als `node --input-type=module - <args>`', () => {
  test('agent-token/AC-8: gebruikt geen import.meta.dirname, import.meta.filename of import.meta.url, wel import.meta.main', () => {
    const tekst = code(bron());
    expectAbsent(tekst, /import\.meta\.(dirname|filename|url)\b/, {
      recognizes: [
        'import.meta.dirname',
        'import.meta.filename',
        'fileURLToPath(import.meta.url)',
        'new URL(x, import.meta.url)',
      ],
      allows: ['import.meta.main'],
    });
    expect(tekst).toMatch(/import\.meta\.main\b/);
  });

  test('agent-token/AC-8: een ongeldig App-ID via stdin geeft exit 2 met de gebruiksregel', () => {
    const uitslag = draai({ args: ['abc'], stdin: true });
    expect(uitslag.status).toBe(2);
    expect(uitslag.alles).toContain('agent-token.mjs');
    expect(uitslag.alles).toContain('<app-id>');
    expect(uitslag.calls).toEqual([]);
  });

  test('agent-token/AC-8: zonder argumenten na `-` geeft exit 2 (het `-` zelf is geen argument van het script)', () => {
    const uitslag = draai({ args: [], stdin: true });
    expect(uitslag.status).toBe(2);
    expect(uitslag.alles).toContain('<app-id>');
  });

  test('agent-token/AC-8: een ongeldige --repo na een geldig App-ID geeft via stdin exit 2', () => {
    const uitslag = draai({ args: ['123', '--repo', 'geen-slash'], stdin: true });
    expect(uitslag.status).toBe(2);
  });

  test('agent-token/AC-8: geldige argumenten via stdin worden gelezen: App-ID, --repo en --sleutel komen aan', () => {
    const weg = path.join(tmp(), 'weg.pem');
    const uitslag = draai({ args: ['123', '--repo', 'o/r', '--sleutel', weg], stdin: true });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain(weg);
    expect(uitslag.calls).toEqual([]);
  });

  test('agent-token/AC-8: via stdin leest het script origin uit de repo in de huidige map', () => {
    const { sleutel, uit } = opzet();
    const uitslag = draai({ args: ['123', '--sleutel', sleutel, '--uit', uit], stdin: true, cwd: gitRepo(null) });
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('--repo');
    expect(uitslag.calls).toEqual([]);
  });

  test('agent-token/AC-8: via stdin slaagt een volledige run en staan token en JWT niet in de uitvoer', () => {
    const o = opzet();
    const uitslag = draai({ args: [APP_ID, '--repo', 'o/r', '--sleutel', o.sleutel, '--uit', o.uit], stdin: true });
    expect(uitslag.status).toBe(0);
    expect(uitslag.alles).not.toContain(TOKEN);
    expect(readFileSync(o.uit, 'utf8').trim()).toBe(TOKEN);
  });
});
