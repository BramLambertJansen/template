import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { MAX_FILE_BYTES, MAX_FILE_URL_TTL_SECONDS } from '../../shared/limits.ts';
import { AppError } from '../errors.ts';
import { defineFileStorage, isFileKey, type FileStorage, type StoredFile } from './port.ts';

// De lokale adapter (spec bestandsopslag, "Lokale adapter en dev-route", ADR 0060 punt 6): alleen bij APP_ENV=local of
// test (composeServer). URL's staan op APP_ORIGIN onder /api/dev/files/<token>, dus uploadOrigin is null en connect-src
// blijft 'self'. Het token is HMAC-SHA-256 over sleutel, methode, vervaltijd en bij PUT grootte en type, bij GET de
// bestandsnaam; de sleutel is 32 willekeurige bytes per createLocalFileStorage (één per proces), nergens op schijf of in
// env (OV-19): een herstart maakt openstaande tokens ongeldig.
// Opslag: per object een map <dir>/files/<uuid> met `data` en `type`. Een upload bouwt die map onder <dir>/.tmp en
// hernoemt hem pas bij de exacte grootte; een rename op een bestaande (niet-lege) map faalt, dus write-once is atomair.
// Fouten van de dev-route zijn AppErrors: createApp maakt er `{ code, requestId }` van.

const DEV_PATH = '/api/dev/files/';
const DATA = 'data';
const TYPE = 'type';
// De standaardmap ligt onder os.tmpdir(): bestanden en mappen alleen voor het eigen proces (geen andere gebruikers).
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const claims = z.discriminatedUnion('m', [
  z.object({ m: z.literal('PUT'), k: z.string(), e: z.number(), s: z.number(), t: z.string() }).strict(),
  z.object({ m: z.literal('GET'), k: z.string(), e: z.number(), f: z.string() }).strict(),
]);
type Claims = z.infer<typeof claims>;
type PutClaims = Extract<Claims, { m: 'PUT' }>;
type GetClaims = Extract<Claims, { m: 'GET' }>;

export interface LocalFileStorageOptions {
  readonly dir: string;
  // Exact APP_ORIGIN: de URL's zijn absoluut, Vite stuurt /api door naar de API.
  readonly appOrigin: string;
  // De klok in milliseconden; tests verzetten hem.
  readonly now?: () => number;
}

export type LocalFileStorage = FileStorage & {
  // De handler voor PUT en GET /api/dev/files/:token; createApp hangt hem buiten CSRF en bodyLimit.
  readonly devRoute: (request: Request) => Promise<Response>;
};

interface Signer {
  readonly sign: (value: Claims) => string;
  readonly verify: (token: string) => Claims | null;
}

function createSigner(): Signer {
  const secret = randomBytes(32);
  const mac = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    sign: (value) => {
      const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${payload}.${mac(payload)}`;
    },
    verify: (token) => {
      const [payload, signature, ...rest] = token.split('.');
      if (payload === undefined || signature === undefined || rest.length > 0) return null;
      const expected = Buffer.from(mac(payload));
      const given = Buffer.from(signature);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const parsed = claims.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}

function checkRequest(key: string, ttlSeconds: number): void {
  if (!isFileKey(key)) throw new Error('lokale opslag: sleutel past niet op files/<uuid>');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_FILE_URL_TTL_SECONDS) {
    throw new Error('lokale opslag: ttlSeconds buiten 1 t/m MAX_FILE_URL_TTL_SECONDS');
  }
}

// RFC 6266: een ASCII-terugval in filename en de echte naam in filename* (UTF-8, procentgecodeerd).
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

interface Store {
  readonly dir: string;
  readonly objectDir: (key: string) => string;
}

// Alleen "bestaat niet" (ENOENT) geeft de terugvalwaarde; elke andere fout (EACCES, EIO, …) gaat door, zodat
// createFileService hem STORAGE_UNAVAILABLE maakt en de dev-route INTERNAL_ERROR.
async function ifMissing<T, F>(work: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// Zonder `type` (een object dat een test direct in de map zette) is het type application/octet-stream.
async function statObject(store: Store, key: string): Promise<StoredFile | null> {
  const dir = store.objectDir(key);
  const data = await ifMissing(stat(path.join(dir, DATA)), null);
  if (data === null || !data.isFile()) return null;
  const type = await ifMissing(readFile(path.join(dir, TYPE), 'utf8'), 'application/octet-stream');
  return { sizeBytes: data.size, contentType: type };
}

// Een write kan minder bytes schrijven dan gevraagd: door tot de hele chunk staat.
async function writeAll(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  for (let offset = 0; offset < chunk.byteLength;) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
    offset += bytesWritten;
  }
}

// Leest de body als stream naar `file` en breekt af zodra hij `limit` bytes overschrijdt; geeft het aantal bytes.
async function writeBody(body: ReadableStream<Uint8Array> | null, file: string, limit: number): Promise<number> {
  const handle = await open(file, 'wx', FILE_MODE);
  let total = 0;
  try {
    if (body === null) return 0;
    const reader = body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new AppError('PAYLOAD_TOO_LARGE');
      }
      await writeAll(handle, chunk.value);
    }
    return total;
  } finally {
    await handle.close();
  }
}

async function put(store: Store, token: PutClaims, request: Request): Promise<Response> {
  if ((request.headers.get('content-type') ?? '').toLowerCase() !== token.t.toLowerCase()) {
    throw new AppError('FORBIDDEN');
  }
  const target = store.objectDir(token.k);
  if ((await ifMissing(stat(target), null)) !== null) throw new AppError('ALREADY_EXISTS');
  const temp = path.resolve(store.dir, '.tmp', randomUUID());
  if (!temp.startsWith(store.dir + path.sep)) throw new Error('lokale opslag: pad buiten de opslagmap');
  await mkdir(temp, { recursive: true, mode: DIR_MODE });
  try {
    const written = await writeBody(request.body, path.join(temp, DATA), token.s);
    // Een kortere body dan ondertekend past niet bij het token: niets opslaan.
    if (written !== token.s) throw new AppError('FORBIDDEN');
    await writeFile(path.join(temp, TYPE), token.t, { flag: 'wx', mode: FILE_MODE });
    await commit(temp, target);
    return new Response(null, { status: 201 });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

const EXISTS: ReadonlySet<unknown> = new Set(['EEXIST', 'ENOTEMPTY']);

// De rename is de write-once-grens: een bestaande objectmap (nooit leeg) laat hem falen met EEXIST of ENOTEMPTY. Elke andere
// fout (EACCES, ENOSPC, …) gaat ongewijzigd door en wordt INTERNAL_ERROR; put ruimt de tijdelijke map in beide gevallen op.
async function commit(temp: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true, mode: DIR_MODE });
  try {
    await rename(temp, target);
  } catch (error) {
    if (error instanceof Error && 'code' in error && EXISTS.has(error.code)) throw new AppError('ALREADY_EXISTS');
    throw error;
  }
}

// Streamt het bestand; de handle sluit zichzelf aan het eind van de stream (of bij afbreken).
async function get(store: Store, token: GetClaims): Promise<Response> {
  const handle = await ifMissing(open(path.join(store.objectDir(token.k), DATA), 'r'), null);
  if (handle === null) throw new AppError('NOT_FOUND');
  let size: number;
  try {
    size = (await handle.stat()).size;
  } catch (error) {
    await handle.close();
    throw error;
  }
  return new Response(Readable.toWeb(handle.createReadStream()), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': contentDisposition(token.f),
      'Content-Length': String(size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'no-store',
    },
  });
}

function devRoute(store: Store, signer: Signer, now: () => number) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const token = pathname.startsWith(DEV_PATH) ? signer.verify(pathname.slice(DEV_PATH.length)) : null;
    // Ongeldig, verlopen, andere methode of sleutel buiten files/<uuid>: FORBIDDEN, vóór elke bestandsbewerking.
    if (token === null || token.m !== request.method || now() > token.e || !isFileKey(token.k)) {
      throw new AppError('FORBIDDEN');
    }
    return token.m === 'PUT' ? put(store, token, request) : get(store, token);
  };
}

export function createLocalFileStorage(options: LocalFileStorageOptions): LocalFileStorage {
  const now = options.now ?? Date.now;
  const signer = createSigner();
  // Elke weg naar de schijf loopt via objectDir: een sleutel buiten files/<uuid> komt nooit in een pad.
  // Daarna nog een padcontrole: het opgeloste pad ligt altijd binnen de opslagmap.
  const root = path.resolve(options.dir);
  const store: Store = {
    dir: root,
    objectDir: (key) => {
      if (!isFileKey(key)) throw new Error('lokale opslag: sleutel past niet op files/<uuid>');
      const full = path.resolve(root, key);
      if (!full.startsWith(root + path.sep)) throw new Error('lokale opslag: pad buiten de opslagmap');
      return full;
    },
  };
  const url = (claims: Claims) => `${options.appOrigin}${DEV_PATH}${signer.sign(claims)}`;
  return defineFileStorage({
    createUploadUrl: ({ key, contentType, sizeBytes, ttlSeconds }) => {
      checkRequest(key, ttlSeconds);
      if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
        throw new Error('lokale opslag: sizeBytes buiten 1 t/m MAX_FILE_BYTES');
      }
      const e = now() + ttlSeconds * 1000;
      return {
        url: url({ m: 'PUT', k: key, e, s: sizeBytes, t: contentType }),
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      };
    },
    createDownloadUrl: ({ key, filename, ttlSeconds }) => {
      checkRequest(key, ttlSeconds);
      return { url: url({ m: 'GET', k: key, e: now() + ttlSeconds * 1000, f: filename }) };
    },
    stat: (key) => statObject(store, key),
    delete: async (key) => {
      await rm(store.objectDir(key), { recursive: true, force: true });
    },
    uploadOrigin: null,
    devRoute: devRoute(store, signer, now),
  });
}
