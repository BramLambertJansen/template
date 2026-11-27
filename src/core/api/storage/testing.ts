import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { FileStorage } from './port.ts';

// Alleen voor testbestanden: de contracttestsuite van de poort (spec bestandsopslag, AC-1; ADR 0060 punt 2). Elke adapter
// uit defineFileStorage draait hem (pnpm check:storage-adapters eist dat). De setup levert de adapter, een fetch die een
// signed URL uitvoert (lokaal: devRoute; bij een provider de echte HTTP-aanroep) en een klok die de suite kan verzetten.
// Een geweigerd verzoek is een niet-ok antwoord of een fetch die gooit (de lokale devRoute gooit een AppError).

export interface ContractSetup {
  readonly storage: FileStorage;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly advance: (ms: number) => void;
  readonly cleanup?: () => Promise<void>;
}

export interface ContractCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

const TYPE = 'application/pdf';
const TTL = 60;
const SIZE = 32;
const NAME = 'rapport één.pdf';

const content = (fill: number) => new Uint8Array(SIZE).fill(fill);
const newKey = () => `files/${randomUUID()}`;

// De uitkomst van een verzoek: het antwoord als het ok is, anders null (ook als fetch gooit).
async function attempt(setup: ContractSetup, request: Request): Promise<Response | null> {
  try {
    const response = await setup.fetch(request);
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

function putRequest(setup: ContractSetup, key: string, body: Uint8Array): Request {
  const signed = setup.storage.createUploadUrl({ key, contentType: TYPE, sizeBytes: body.byteLength, ttlSeconds: TTL });
  return new Request(signed.url, { method: signed.method, headers: signed.headers, body });
}

function getRequest(setup: ContractSetup, key: string): Request {
  return new Request(setup.storage.createDownloadUrl({ key, filename: NAME, ttlSeconds: TTL }).url);
}

async function upload(setup: ContractSetup, key: string, fill = 1): Promise<void> {
  expect(await attempt(setup, putRequest(setup, key, content(fill))), 'upload binnen de termijn').not.toBeNull();
}

async function download(setup: ContractSetup, key: string): Promise<Uint8Array> {
  const response = await attempt(setup, getRequest(setup, key));
  expect(response, 'download binnen de termijn').not.toBeNull();
  return new Uint8Array((await response?.arrayBuffer()) ?? new ArrayBuffer(0));
}

const CASES: readonly (readonly [string, (setup: ContractSetup) => Promise<void>])[] = [
  [
    'upload en stat: het object heeft de ondertekende grootte en het type',
    async (setup) => {
      const key = newKey();
      await upload(setup, key);
      expect(await setup.storage.stat(key)).toStrictEqual({ sizeBytes: SIZE, contentType: TYPE });
    },
  ],
  [
    'download: de inhoud, Content-Disposition attachment met filename* en Content-Type application/octet-stream',
    async (setup) => {
      const key = newKey();
      await upload(setup, key, 3);
      const response = await attempt(setup, getRequest(setup, key));
      expect(response).not.toBeNull();
      const disposition = response?.headers.get('content-disposition') ?? '';
      expect(disposition.toLowerCase().startsWith('attachment')).toBe(true);
      expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(NAME)}`);
      expect(response?.headers.get('content-type')).toBe('application/octet-stream');
      expect(new Uint8Array((await response?.arrayBuffer()) ?? new ArrayBuffer(0))).toStrictEqual(content(3));
    },
  ],
  [
    'delete is idempotent: daarna geeft stat null, een tweede delete en een delete zonder object slagen',
    async (setup) => {
      const key = newKey();
      await upload(setup, key);
      await setup.storage.delete(key);
      expect(await setup.storage.stat(key)).toBeNull();
      await setup.storage.delete(key);
      await setup.storage.delete(newKey());
    },
  ],
  [
    'een verlopen upload-URL wordt geweigerd en schrijft niets',
    async (setup) => {
      const key = newKey();
      const request = putRequest(setup, key, content(1));
      setup.advance((TTL + 1) * 1000);
      expect(await attempt(setup, request)).toBeNull();
      expect(await setup.storage.stat(key)).toBeNull();
    },
  ],
  [
    'een verlopen download-URL wordt geweigerd',
    async (setup) => {
      const key = newKey();
      await upload(setup, key);
      const request = getRequest(setup, key);
      setup.advance((TTL + 1) * 1000);
      expect(await attempt(setup, request)).toBeNull();
    },
  ],
  [
    'een tweede upload op dezelfde sleutel wordt geweigerd en de inhoud blijft gelijk',
    async (setup) => {
      const key = newKey();
      await upload(setup, key, 1);
      expect(await attempt(setup, putRequest(setup, key, content(2)))).toBeNull();
      expect(await download(setup, key)).toStrictEqual(content(1));
    },
  ],
];

// Dezelfde gevallen als losse functies (zoals shellContractCases), zodat een test kan bewijzen dat een kapotte adapter faalt.
export function fileStorageContractCases(setup: () => Promise<ContractSetup>): readonly ContractCase[] {
  return CASES.map(([name, body]) => ({
    name,
    run: async () => {
      const ready = await setup();
      try {
        await body(ready);
      } finally {
        await ready.cleanup?.();
      }
    },
  }));
}

export function fileStorageContract(name: string, setup: () => Promise<ContractSetup>): void {
  describe(`fileStorageContract: ${name}`, () => {
    for (const geval of fileStorageContractCases(setup)) test(geval.name, geval.run);
  });
}
