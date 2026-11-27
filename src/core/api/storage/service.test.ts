import { describe, expect, test, vi } from 'vitest';
import { STORAGE_CALL_TIMEOUT_MS } from '../../shared/limits.ts';
import { AppError } from '../errors.ts';
import { defineFileStorage, type FileStorage } from './port.ts';
import { createFileService } from './service.ts';

// Spec files, AC-31 (sleutelcontrole): createFileService roept de adapter nooit aan met een sleutel die niet op
// ^files/<uuid>$ past; dat is een fout in de code (een gewone Error), geen gebruikersfout (geen STORAGE_UNAVAILABLE).
// Het routedeel van AC-31 (een :id dat geen uuid is) is deel B.

const UUID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const GOED = `files/${UUID}`;

const FOUT = [
  ['een bestandsnaam als sleutel', 'rapport.pdf'],
  ['een pad met ..', '../x'],
  ['een pad met een ontsnapte slash', `files/..%2Fx`],
  ['geen uuid', 'files/abc'],
  ['een lege sleutel', ''],
  ['alleen het voorvoegsel', 'files/'],
  ['een andere map', `bestanden/${UUID}`],
  ['een extra padsegment', `files/${UUID}/x`],
  ['een achtervoegsel', `files/${UUID}.pdf`],
  ['een voorvoegsel voor de sleutel', `x/files/${UUID}`],
  ['een slash vooraan', `/files/${UUID}`],
  ['een afsluitende nieuwe regel', `files/${UUID}\n`],
  ['een uuid met een spatie', `files/${UUID} `],
] as const;

function adapter() {
  const spies = {
    createUploadUrl: vi.fn<FileStorage['createUploadUrl']>(() => ({
      url: 'https://opslag.test/up',
      method: 'PUT',
      headers: {},
    })),
    createDownloadUrl: vi.fn<FileStorage['createDownloadUrl']>(() => ({ url: 'https://opslag.test/down' })),
    stat: vi.fn<FileStorage['stat']>(() => Promise.resolve({ sizeBytes: 1, contentType: 'application/pdf' })),
    delete: vi.fn<FileStorage['delete']>(() => Promise.resolve()),
  };
  const storage = defineFileStorage({ ...spies, uploadOrigin: null });
  return { spies, service: createFileService(storage) };
}

// Elke bewerking, aangeroepen met een sleutel; ook een synchrone throw telt als afwijzing (zie `afgewezen`).
type Service = ReturnType<typeof adapter>['service'];
const BEWERKINGEN = [
  [
    'createUploadUrl',
    (s: Service, key: string) =>
      s.createUploadUrl({ key, contentType: 'application/pdf', sizeBytes: 1, ttlSeconds: 60 }),
  ],
  ['createDownloadUrl', (s: Service, key: string) => s.createDownloadUrl({ key, filename: 'a.pdf', ttlSeconds: 60 })],
  ['stat', (s: Service, key: string) => s.stat(key)],
  ['delete', (s: Service, key: string) => s.delete(key)],
] as const;

async function afgewezen(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('files/AC-31: createFileService en een sleutel buiten ^files/<uuid>$', () => {
  describe.each(BEWERKINGEN)('%s', (naam, bewerking) => {
    test.each(FOUT)(
      `files/AC-31: ${naam} met %s gooit een gewone Error en roept de adapter niet aan`,
      async (_, key) => {
        const { spies, service } = adapter();

        const error = await afgewezen(() => bewerking(service, key));

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AppError);
        for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
      },
    );

    test(`files/AC-31: ${naam} met een geldige sleutel files/<uuid> roept de adapter wel aan (controle op de test zelf)`, async () => {
      const { spies, service } = adapter();

      const error = await afgewezen(() => bewerking(service, GOED));

      expect(error).toBeUndefined();
      expect(spies[naam]).toHaveBeenCalledTimes(1);
      expect(spies[naam].mock.calls[0]).toBeDefined();
    });
  });

  test('files/AC-31: de geldige sleutel gaat ongewijzigd naar de adapter', async () => {
    const { spies, service } = adapter();

    await service.stat(GOED);
    await service.delete(GOED);

    expect(spies.stat).toHaveBeenCalledExactlyOnceWith(GOED);
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith(GOED);
  });
});

// Elke fout van de adapter, een time-out en een ontbrekende adapter worden hier STORAGE_UNAVAILABLE, nergens anders.
function codeOf(error: unknown): string | undefined {
  return error instanceof AppError ? error.code : undefined;
}

function brokenService(options?: { timeoutMs?: number }) {
  const boom = () => {
    throw new Error('adapter stuk');
  };
  const storage = defineFileStorage({
    createUploadUrl: boom,
    createDownloadUrl: boom,
    stat: () => Promise.reject(new Error('adapter stuk')),
    delete: () => Promise.reject(new Error('adapter stuk')),
    uploadOrigin: null,
  });
  return createFileService(storage, options);
}

describe('files/AC-31: elke adapterfout wordt STORAGE_UNAVAILABLE', () => {
  test.each(BEWERKINGEN)(
    'files/AC-31: %s met een falende adapter geeft AppError STORAGE_UNAVAILABLE',
    async (_, bewerking) => {
      const error = await afgewezen(() => bewerking(brokenService(), GOED));

      expect(codeOf(error)).toBe('STORAGE_UNAVAILABLE');
    },
  );

  test('files/AC-31: de foutmelding van de adapter lekt niet in de fout naar buiten', async () => {
    const error = await afgewezen(() => brokenService().stat(GOED));

    expect(error).toBeInstanceOf(AppError);
    expect(error instanceof Error ? error.message : '').not.toContain('adapter stuk');
  });
});

describe('files/AC-31: de time-out op stat', () => {
  const hangend = (options?: { timeoutMs?: number }) =>
    createFileService(
      defineFileStorage({
        createUploadUrl: () => ({ url: 'https://opslag.test/up', method: 'PUT', headers: {} }),
        createDownloadUrl: () => ({ url: 'https://opslag.test/down' }),
        stat: () => new Promise<never>(() => undefined),
        delete: () => Promise.resolve(),
        uploadOrigin: null,
      }),
      options,
    );

  test('files/AC-31: een stat die langer duurt dan timeoutMs geeft STORAGE_UNAVAILABLE', async () => {
    const error = await afgewezen(() => hangend({ timeoutMs: 20 }).stat(GOED));

    expect(codeOf(error)).toBe('STORAGE_UNAVAILABLE');
  });

  test('files/AC-31: standaard is de time-out STORAGE_CALL_TIMEOUT_MS (5000 ms)', async () => {
    vi.useFakeTimers();
    try {
      let result: unknown = 'lopend';
      void afgewezen(() => hangend().stat(GOED)).then((error) => {
        result = error;
      });
      await vi.advanceTimersByTimeAsync(STORAGE_CALL_TIMEOUT_MS - 1);
      expect(result).toBe('lopend');
      await vi.advanceTimersByTimeAsync(1);
      expect(codeOf(result)).toBe('STORAGE_UNAVAILABLE');
    } finally {
      vi.useRealTimers();
    }
  });

  test('files/AC-31: een stat binnen de time-out geeft het resultaat van de adapter', async () => {
    const { service } = adapter();

    await expect(service.stat(GOED)).resolves.toStrictEqual({ sizeBytes: 1, contentType: 'application/pdf' });
  });
});

describe('files/AC-31: zonder adapter', () => {
  test('files/AC-31: available is false, ensureAvailable en elke bewerking gooien STORAGE_UNAVAILABLE', async () => {
    const service = createFileService(undefined);

    expect(service.available).toBe(false);
    expect(
      codeOf(
        await afgewezen(() => {
          service.ensureAvailable();
        }),
      ),
    ).toBe('STORAGE_UNAVAILABLE');
    for (const [, bewerking] of BEWERKINGEN) {
      expect(codeOf(await afgewezen(() => bewerking(service, GOED)))).toBe('STORAGE_UNAVAILABLE');
    }
  });

  test('files/AC-31: met een adapter is available true en gooit ensureAvailable niet', () => {
    const { service } = adapter();

    expect(service.available).toBe(true);
    expect(() => {
      service.ensureAvailable();
    }).not.toThrow();
  });
});
