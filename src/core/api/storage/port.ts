// De poort voor bestandsopslag (spec bestandsopslag, ADR 0060 punt 1–2). Een adapter ontstaat alleen via defineFileStorage
// (vindbaar voor pnpm check:storage-adapters, dat eist dat er een testbestand fileStorageContract op draait). URL's maken is
// synchroon lokaal ondertekenen: een adapter die daarvoor een netwerkaanroep nodig heeft, past niet op de poort.
// Handlers zien de adapter nooit direct: createFileService (service.ts) omhult hem.

export const FILE_STORAGE: unique symbol = Symbol('defineFileStorage');

// De enige vorm van een sleutel: `files/<uuid>` (spec bestandsopslag, AC-31); nooit invoer, nooit een bestandsnaam.
const FILE_KEY = /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isFileKey(key: string): boolean {
  return FILE_KEY.test(key);
}

export interface SignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  // Precies deze headers stuurt de browser mee (uploadFile in de API-client); minstens Content-Type.
  readonly headers: Readonly<Record<string, string>>;
}

export interface UploadUrlRequest {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly ttlSeconds: number;
}

export interface DownloadUrlRequest {
  readonly key: string;
  // Alleen voor Content-Disposition (RFC 6266 filename*); nooit onderdeel van de sleutel.
  readonly filename: string;
  readonly ttlSeconds: number;
}

export interface StoredFile {
  readonly sizeBytes: number;
  readonly contentType: string;
}

export interface FileStorage {
  // De URL schrijft één object, alleen als het nog niet bestaat (write-once; bij een provider een conditionele write).
  createUploadUrl(request: UploadUrlRequest): SignedUpload;
  // De response heeft Content-Disposition: attachment, Content-Type: application/octet-stream en waar mogelijk nosniff.
  createDownloadUrl(request: DownloadUrlRequest): { url: string };
  stat(key: string): Promise<StoredFile | null>;
  // Idempotent: een ontbrekend object is geen fout.
  delete(key: string): Promise<void>;
  // De origin voor connect-src, of null als de URL's op APP_ORIGIN staan.
  readonly uploadOrigin: string | null;
}

export type DefinedFileStorage = FileStorage & { readonly [FILE_STORAGE]: true };

export function defineFileStorage<S extends FileStorage>(adapter: S): S & { readonly [FILE_STORAGE]: true } {
  return Object.assign(adapter, { [FILE_STORAGE]: true as const });
}

export function isFileStorage(value: unknown): value is DefinedFileStorage {
  return typeof value === 'object' && value !== null && FILE_STORAGE in value;
}
