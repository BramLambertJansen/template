import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import type { FileLimits } from '../../shared/limits.ts';
import { createApp, type App } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import { createLocalFileStorage, type LocalFileStorage } from './local.ts';
import type { SignedUpload } from './port.ts';
import { createFileService } from './service.ts';
import { fileStorageContract, fileStorageContractCases, type ContractSetup } from './testing.ts';

// Spec files, deel A: de lokale adapter met zijn dev-route (AC-1, AC-3, AC-4). De adapter krijgt een tijdelijke map en een
// injecteerbare klok in milliseconden (`now`); een nieuwe createLocalFileStorage is een "herstart" (nieuwe HMAC-sleutel).
// AC-3 en AC-4 lopen via createApp, zodat de foutbody de vorm { code, requestId } heeft; AC-1 draait de suite zelf.
// Keuzes waar de koppelnotitie niets vastlegt: een succesvolle PUT geeft een ok-status (geen vaste code); een te kleine body
// geeft een niet-ok antwoord en laat geen object achter; het token is ondoorzichtig (de laatste padsegmenten van de URL).

const APP_ORIGIN = 'http://localhost:5173';
const START = 1_800_000_000_000;
const PDF = 'application/pdf';
const KEY_X = 'files/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const KEY_Y = 'files/9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const UPLOAD_TTL = 300;
const DOWNLOAD_TTL = 60;
const SIZE = 16;
const LIMITS: FileLimits = {
  maxBytes: 1024,
  allowedTypes: [PDF],
  uploadUrlTtlSeconds: UPLOAD_TTL,
  downloadUrlTtlSeconds: DOWNLOAD_TTL,
  pendingTtlSeconds: 86_400,
  maxPerUser: 100,
  pageSize: 25,
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'files-local-'));
  dirs.push(dir);
  return dir;
}

interface Rig {
  readonly dir: string;
  readonly storage: LocalFileStorage;
  readonly app: App;
  readonly advance: (ms: number) => void;
}

function appFor(storage: LocalFileStorage): App {
  return createApp({ files: { service: createFileService(storage), limits: LIMITS, devRoute: storage.devRoute } });
}

function rig(dir = tempDir(), clock = { now: START }): Rig {
  const storage = createLocalFileStorage({ dir, appOrigin: APP_ORIGIN, now: () => clock.now });
  return {
    dir,
    storage,
    app: appFor(storage),
    advance: (ms) => {
      clock.now += ms;
    },
  };
}

// Een nieuw proces op dezelfde map en klok: nieuwe ondertekeningssleutel, dus openstaande tokens vervallen.
function restarted(old: Rig, clock: { now: number }): Rig {
  return rig(old.dir, clock);
}

function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function upload(key: string, sizeBytes = SIZE) {
  return { key, contentType: PDF, sizeBytes, ttlSeconds: UPLOAD_TTL };
}

function putRequest(signed: SignedUpload, body: Uint8Array, headers?: Record<string, string>): Request {
  const merged = new Headers(signed.headers);
  if (!merged.has('content-type')) merged.set('content-type', PDF);
  for (const [name, value] of Object.entries(headers ?? {})) merged.set(name, value);
  return new Request(signed.url, { method: signed.method, headers: merged, body });
}

const bytes = (size: number, fill = 7) => new Uint8Array(size).fill(fill);

async function expectError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  // parseErrorBody is strikt: een extra veld of een lege requestId laat hem falen.
  const body = parseErrorBody(await response.json());
  expect(body.code).toBe(code);
  expect(Object.keys(body).toSorted()).toStrictEqual(['code', 'requestId']);
}

// Verandert het teken op `index` in een ander teken van hetzelfde alfabet.
function tamper(token: string, index: number): string {
  const teken = token[index] === 'A' ? 'B' : 'A';
  return token.slice(0, index) + teken + token.slice(index + 1);
}

function withToken(url: string, token: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1) + token;
}

function tokenOf(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

// --- AC-1: de contracttestsuite ------------------------------------------------------------------------------------------

interface Parts {
  readonly dir: string;
  readonly storage: LocalFileStorage;
  readonly setup: ContractSetup;
}

function localParts(): Parts {
  const dir = tempDir();
  const clock = { now: START };
  const storage = createLocalFileStorage({ dir, appOrigin: APP_ORIGIN, now: () => clock.now });
  const setup: ContractSetup = {
    storage,
    fetch: (request) => storage.devRoute(request),
    advance: (ms) => {
      clock.now += ms;
    },
  };
  return { dir, storage, setup };
}

// De echte suite tegen de lokale adapter: de gevallen van AC-1 slaan hier als tests neer.
fileStorageContract('files/AC-1: lokale adapter', () => {
  const dir = tempDir();
  let now = START;
  const storage = createLocalFileStorage({ dir, appOrigin: APP_ORIGIN, now: () => now });
  return Promise.resolve({
    storage,
    fetch: (request: Request) => storage.devRoute(request),
    advance: (ms: number) => {
      now += ms;
    },
  });
});

// Voert elk geval uit en geeft de namen van de gevallen die falen.
async function failingCases(build: () => Promise<ContractSetup>): Promise<{ total: number; failed: string[] }> {
  const cases = fileStorageContractCases(build);
  const failed: string[] = [];
  for (const geval of cases) {
    try {
      await geval.run();
    } catch {
      failed.push(geval.name);
    }
  }
  return { total: cases.length, failed };
}

const healthy = () => Promise.resolve(localParts().setup);

// Een adapter die een verlopen URL blijft accepteren: de klok die de suite verzet, bereikt hem nooit.
const acceptsExpired = () => {
  const { setup } = localParts();
  return Promise.resolve({ ...setup, advance: () => undefined });
};

// Een adapter die een tweede upload op dezelfde sleutel toelaat: het bestaande object verdwijnt vlak vóór een PUT.
const allowsSecondUpload = () => {
  const { storage, setup } = localParts();
  const keys = new Map<string, string>();
  return Promise.resolve<ContractSetup>({
    ...setup,
    storage: {
      createUploadUrl: (request) => {
        const signed = storage.createUploadUrl(request);
        keys.set(signed.url, request.key);
        return signed;
      },
      createDownloadUrl: (request) => storage.createDownloadUrl(request),
      stat: (key) => storage.stat(key),
      delete: (key) => storage.delete(key),
      uploadOrigin: storage.uploadOrigin,
    },
    fetch: async (request) => {
      const key = keys.get(request.url);
      if (request.method === 'PUT' && key !== undefined) await storage.delete(key);
      return storage.devRoute(request);
    },
  });
};

// Een adapter waarvan de download de headers van de poort mist: `change` past de headers van een GET-antwoord aan.
function brokenDownload(change: (headers: Headers) => void) {
  return () => {
    const { storage, setup } = localParts();
    return Promise.resolve<ContractSetup>({
      ...setup,
      fetch: async (request) => {
        const response = await storage.devRoute(request);
        if (request.method !== 'GET' || !response.ok) return response;
        const headers = new Headers(response.headers);
        change(headers);
        return new Response(response.body, { status: response.status, headers });
      },
    });
  };
}

describe('files/AC-1: de suite laat een kapotte adapter falen', () => {
  test('files/AC-1: de suite heeft minstens de zes gevallen van de spec en de lokale adapter slaagt op alle', async () => {
    const { total, failed } = await failingCases(healthy);

    expect(total).toBeGreaterThanOrEqual(6);
    expect(failed).toStrictEqual([]);
  });

  test.each([
    ['accepteert een verlopen URL', acceptsExpired],
    ['staat een tweede upload op dezelfde sleutel toe', allowsSecondUpload],
    [
      'laat Content-Disposition: attachment weg',
      brokenDownload((headers) => {
        headers.delete('content-disposition');
      }),
    ],
    [
      'geeft een download zonder attachment (inline)',
      brokenDownload((headers) => {
        headers.set('content-disposition', 'inline');
      }),
    ],
    [
      'laat Content-Type: application/octet-stream weg',
      brokenDownload((headers) => {
        headers.delete('content-type');
      }),
    ],
    [
      'geeft de download het opgeslagen type in plaats van application/octet-stream',
      brokenDownload((headers) => {
        headers.set('content-type', PDF);
      }),
    ],
  ])('files/AC-1: een adapter die %s laat minstens één geval falen', async (_, build) => {
    const { failed } = await failingCases(build);

    expect(failed.length).toBeGreaterThanOrEqual(1);
  });
});

// --- AC-3: een token geldt alleen voor wat is ondertekend ------------------------------------------------------------------

describe('files/AC-3: een ongeldig token geeft 403 FORBIDDEN en er wordt niets geschreven of gelezen', () => {
  const secret = bytes(SIZE, 42);

  async function stored(r: Rig, key: string): Promise<void> {
    const signed = r.storage.createUploadUrl(upload(key));
    const response = await r.app.fetch(putRequest(signed, secret));
    expect(response.ok).toBe(true);
  }

  async function notRead(response: Response): Promise<void> {
    await expectError(response, 403, 'FORBIDDEN');
  }

  test('files/AC-3: een token voor sleutel X, samengesteld met dat van sleutel Y, geeft 403 en schrijft niets', async () => {
    const r = rig();
    const x = r.storage.createUploadUrl(upload(KEY_X));
    const y = r.storage.createUploadUrl(upload(KEY_Y));
    const [tx, ty] = [tokenOf(x.url), tokenOf(y.url)];
    const half = Math.floor(tx.length / 2);
    const mixed = tx.slice(0, half) + ty.slice(half);
    expect(mixed).not.toBe(tx);
    expect(mixed).not.toBe(ty);

    const response = await r.app.fetch(putRequest({ ...x, url: withToken(x.url, mixed) }, bytes(SIZE)));

    await expectError(response, 403, 'FORBIDDEN');
    expect(filesIn(r.dir)).toStrictEqual([]);
    expect(await r.storage.stat(KEY_X)).toBeNull();
    expect(await r.storage.stat(KEY_Y)).toBeNull();
  });

  test('files/AC-3: een upload-token geeft toegang tot zijn eigen sleutel en tot geen andere (controle op de test zelf)', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X));

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE)));

    expect(response.ok).toBe(true);
    expect(await r.storage.stat(KEY_X)).toStrictEqual({ sizeBytes: SIZE, contentType: PDF });
    expect(await r.storage.stat(KEY_Y)).toBeNull();
  });

  test('files/AC-3: een upload-token gebruikt met GET geeft 403 en niet 404, ook als het object bestaat', async () => {
    const r = rig();
    await stored(r, KEY_X);
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(new Request(signed.url, { method: 'GET' }));

    await notRead(response);
  });

  test('files/AC-3: een download-token gebruikt met PUT geeft 403 en schrijft niets', async () => {
    const r = rig();
    const download = r.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    const headers = new Headers({ 'content-type': PDF });

    const response = await r.app.fetch(new Request(download.url, { method: 'PUT', headers, body: bytes(SIZE) }));

    await expectError(response, 403, 'FORBIDDEN');
    expect(filesIn(r.dir)).toStrictEqual([]);
  });

  test('files/AC-3: een download-token voor een ontbrekend object geeft 404, een ongeldig token 403 (volgorde van de controles)', async () => {
    const r = rig();
    const download = r.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    const bad = withToken(download.url, tamper(tokenOf(download.url), Math.floor(tokenOf(download.url).length / 2)));

    await expectError(await r.app.fetch(new Request(download.url)), 404, 'NOT_FOUND');
    await expectError(await r.app.fetch(new Request(bad)), 403, 'FORBIDDEN');
  });

  test('files/AC-3: een ander Content-Type dan in het token geeft 403 en schrijft niets', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X));

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE), { 'content-type': 'text/plain' }));

    await expectError(response, 403, 'FORBIDDEN');
    expect(filesIn(r.dir)).toStrictEqual([]);
    expect(await r.storage.stat(KEY_X)).toBeNull();
  });

  test('files/AC-3: na het verlopen van de upload-URL geeft PUT 403 en schrijft niets', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X));
    r.advance((UPLOAD_TTL + 1) * 1000);

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE)));

    await expectError(response, 403, 'FORBIDDEN');
    expect(filesIn(r.dir)).toStrictEqual([]);
  });

  test('files/AC-3: na het verlopen van de download-URL geeft GET 403 en lekt de inhoud niet', async () => {
    const r = rig();
    await stored(r, KEY_X);
    const download = r.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    r.advance((DOWNLOAD_TTL + 1) * 1000);

    const response = await r.app.fetch(new Request(download.url));

    await expectError(response, 403, 'FORBIDDEN');
  });

  test('files/AC-3: na een herstart van het proces (nieuwe sleutel) geeft een oude upload-URL 403 en schrijft niets', async () => {
    const clock = { now: START };
    const before = rig(undefined, clock);
    const signed = before.storage.createUploadUrl(upload(KEY_X));
    const after = restarted(before, clock);

    const response = await after.app.fetch(putRequest(signed, bytes(SIZE)));

    await expectError(response, 403, 'FORBIDDEN');
    expect(filesIn(after.dir)).toStrictEqual([]);
    // Een nieuwe URL van het nieuwe proces werkt wel.
    const fresh = after.storage.createUploadUrl(upload(KEY_X));
    expect((await after.app.fetch(putRequest(fresh, bytes(SIZE)))).ok).toBe(true);
  });

  test('files/AC-3: na een herstart geeft een oude download-URL 403 en lekt de inhoud niet', async () => {
    const clock = { now: START };
    const before = rig(undefined, clock);
    await stored(before, KEY_X);
    const download = before.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    const after = restarted(before, clock);

    const response = await after.app.fetch(new Request(download.url));

    await expectError(response, 403, 'FORBIDDEN');
  });

  test.each([0, 0.5, 0.9, -5])(
    'files/AC-3: een gewijzigd token (teken op positie %s van de lengte) geeft 403 en schrijft niets',
    async (positie) => {
      const r = rig();
      const signed = r.storage.createUploadUrl(upload(KEY_X));
      const token = tokenOf(signed.url);
      const index = positie < 0 ? token.length + positie : Math.floor(token.length * positie);

      const response = await r.app.fetch(
        putRequest({ ...signed, url: withToken(signed.url, tamper(token, index)) }, bytes(SIZE)),
      );

      await expectError(response, 403, 'FORBIDDEN');
      expect(filesIn(r.dir)).toStrictEqual([]);
    },
  );

  test('files/AC-3: een gewijzigd of afgekapt download-token lekt de inhoud niet', async () => {
    const r = rig();
    await stored(r, KEY_X);
    const download = r.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    const token = tokenOf(download.url);

    for (const bad of [tamper(token, Math.floor(token.length / 2)), token.slice(0, -4), 'onzin']) {
      const response = await r.app.fetch(new Request(withToken(download.url, bad)));
      expect(response.headers.get('content-disposition')).toBeNull();
      await expectError(response, 403, 'FORBIDDEN');
    }
  });
});

// --- AC-4: grootte en write-once -------------------------------------------------------------------------------------------

describe('files/AC-4: de grootte uit het token en write-once', () => {
  test('files/AC-4: een body groter dan N geeft 413 PAYLOAD_TOO_LARGE en het object bestaat niet', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE + 1)));

    await expectError(response, 413, 'PAYLOAD_TOO_LARGE');
    expect(await r.storage.stat(KEY_X)).toBeNull();
    expect(filesIn(r.dir)).toStrictEqual([]);
  });

  test('files/AC-4: een veel grotere body (een kilobyte bij N = 16) geeft ook 413 en laat niets achter', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(putRequest(signed, bytes(1024)));

    await expectError(response, 413, 'PAYLOAD_TOO_LARGE');
    expect(filesIn(r.dir)).toStrictEqual([]);
  });

  test('files/AC-4: een body van precies N bytes slaagt en het object heeft die grootte en dat type', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE)));

    expect(response.ok).toBe(true);
    expect(await r.storage.stat(KEY_X)).toStrictEqual({ sizeBytes: SIZE, contentType: PDF });
  });

  test('files/AC-4: een body kleiner dan N maakt het object niet (hernoemen pas bij de exacte grootte)', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE - 1)));

    expect(response.ok).toBe(false);
    expect(await r.storage.stat(KEY_X)).toBeNull();
    expect(filesIn(r.dir)).toStrictEqual([]);
  });

  test('files/AC-4: een tweede upload op een bestaand object geeft 409 ALREADY_EXISTS en de inhoud blijft gelijk', async () => {
    const r = rig();
    const first = r.storage.createUploadUrl(upload(KEY_X, SIZE));
    expect((await r.app.fetch(putRequest(first, bytes(SIZE, 1)))).ok).toBe(true);
    const second = r.storage.createUploadUrl(upload(KEY_X, SIZE));

    const response = await r.app.fetch(putRequest(second, bytes(SIZE, 2)));

    await expectError(response, 409, 'ALREADY_EXISTS');
    const download = r.storage.createDownloadUrl({ key: KEY_X, filename: 'a.pdf', ttlSeconds: DOWNLOAD_TTL });
    const content = new Uint8Array(await (await r.app.fetch(new Request(download.url))).arrayBuffer());
    expect(content).toStrictEqual(bytes(SIZE, 1));
  });

  test('files/AC-4: dezelfde URL een tweede keer gebruiken geeft 409 en laat de inhoud ongewijzigd', async () => {
    const r = rig();
    const signed = r.storage.createUploadUrl(upload(KEY_X, SIZE));
    expect((await r.app.fetch(putRequest(signed, bytes(SIZE, 1)))).ok).toBe(true);

    const response = await r.app.fetch(putRequest(signed, bytes(SIZE, 2)));

    await expectError(response, 409, 'ALREADY_EXISTS');
    expect(await r.storage.stat(KEY_X)).toStrictEqual({ sizeBytes: SIZE, contentType: PDF });
  });

  test('files/AC-4: na delete is de sleutel weer vrij en slaagt een nieuwe upload (write-once geldt per object)', async () => {
    const r = rig();
    expect((await r.app.fetch(putRequest(r.storage.createUploadUrl(upload(KEY_X)), bytes(SIZE)))).ok).toBe(true);
    await r.storage.delete(KEY_X);

    const response = await r.app.fetch(putRequest(r.storage.createUploadUrl(upload(KEY_X)), bytes(SIZE)));

    expect(response.ok).toBe(true);
  });
});
