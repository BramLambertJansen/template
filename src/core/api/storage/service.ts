import { STORAGE_CALL_TIMEOUT_MS } from '../../shared/limits.ts';
import { AppError } from '../errors.ts';
import {
  isFileKey,
  isFileStorage,
  type DownloadUrlRequest,
  type FileStorage,
  type SignedUpload,
  type StoredFile,
  type UploadUrlRequest,
} from './port.ts';

// createFileService (spec bestandsopslag, "Poort"): de enige bron van STORAGE_UNAVAILABLE. Elke fout van de adapter, een
// ontbrekende adapter en een time-out van stat worden hier `new AppError('STORAGE_UNAVAILABLE')`, zonder de oorspronkelijke
// melding (die lekt niet naar buiten). Een sleutel die niet op ^files/<uuid>$ past, is een fout in de code: een gewone
// Error, vóór de adapter wordt aangeroepen (AC-31). Handlers krijgen de service via ctx.services.files (deel B).

export interface FileService {
  readonly available: boolean;
  // Zonder adapter STORAGE_UNAVAILABLE; elke bestandshandler roept dit als eerste aan.
  readonly ensureAvailable: () => void;
  readonly uploadOrigin: string | null;
  readonly createUploadUrl: (request: UploadUrlRequest) => SignedUpload;
  readonly createDownloadUrl: (request: DownloadUrlRequest) => { url: string };
  readonly stat: (key: string) => Promise<StoredFile | null>;
  readonly delete: (key: string) => Promise<void>;
}

export interface FileServiceOptions {
  // Time-out op stat; standaard STORAGE_CALL_TIMEOUT_MS.
  readonly timeoutMs?: number;
}

function checkKey(key: string): void {
  if (!isFileKey(key)) throw new Error('createFileService: sleutel past niet op files/<uuid> (fout in de code)');
}

const unavailable = () => new AppError('STORAGE_UNAVAILABLE');

function sync<T>(storage: FileStorage | undefined, key: string, run: (storage: FileStorage) => T): T {
  checkKey(key);
  if (storage === undefined) throw unavailable();
  try {
    return run(storage);
  } catch {
    throw unavailable();
  }
}

async function guarded<T>(
  storage: FileStorage | undefined,
  key: string,
  run: (s: FileStorage) => Promise<T>,
): Promise<T> {
  checkKey(key);
  if (storage === undefined) throw unavailable();
  try {
    return await run(storage);
  } catch {
    throw unavailable();
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(unavailable());
    }, timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export function createFileService(storage: FileStorage | undefined, options: FileServiceOptions = {}): FileService {
  if (storage !== undefined && !isFileStorage(storage)) {
    throw new Error('createFileService: alleen een adapter uit defineFileStorage (ADR 0060)');
  }
  const timeoutMs = options.timeoutMs ?? STORAGE_CALL_TIMEOUT_MS;
  return {
    available: storage !== undefined,
    ensureAvailable: () => {
      if (storage === undefined) throw unavailable();
    },
    uploadOrigin: storage?.uploadOrigin ?? null,
    createUploadUrl: (request) => sync(storage, request.key, (s) => s.createUploadUrl(request)),
    createDownloadUrl: (request) => sync(storage, request.key, (s) => s.createDownloadUrl(request)),
    stat: (key) => guarded(storage, key, (s) => withTimeout(s.stat(key), timeoutMs)),
    delete: (key) => guarded(storage, key, (s) => s.delete(key)),
  };
}
