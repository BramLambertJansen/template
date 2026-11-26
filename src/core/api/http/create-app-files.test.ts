import { describe, expect, test } from 'vitest';
import { MAX_FILE_BYTES, MAX_FILE_URL_TTL_SECONDS, MAX_PAGE_SIZE, type FileLimits } from '../../shared/limits.ts';
import { defineFileStorage } from '../storage/port.ts';
import { createFileService } from '../storage/service.ts';
import { createApp } from './create-app.ts';

// Spec files, AC-6: createApp({ files: { service, limits } }) weigert bij opstart een waarde boven een harde grens,
// pendingTtlSeconds <= uploadUrlTtlSeconds en een lege allowedTypes bij een geconfigureerde adapter, met een melding die de
// sleutel noemt. Zonder adapter (service zonder storage) is een lege lijst toegestaan. Alleen opstart: geen auth, geen database.

const GOED: FileLimits = {
  maxBytes: 10_485_760,
  allowedTypes: ['application/pdf'],
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
  pendingTtlSeconds: 86_400,
  maxPerUser: 100,
  pageSize: 25,
};

const adapter = defineFileStorage({
  createUploadUrl: () => ({ url: 'https://opslag.test/up', method: 'PUT', headers: {} }),
  createDownloadUrl: () => ({ url: 'https://opslag.test/down' }),
  stat: () => Promise.resolve(null),
  delete: () => Promise.resolve(),
  uploadOrigin: null,
});

const metAdapter = (limits: FileLimits) => () => createApp({ files: { service: createFileService(adapter), limits } });
const zonderAdapter = (limits: FileLimits) => () =>
  createApp({ files: { service: createFileService(undefined), limits } });

describe('files/AC-6: createApp weigert ongeldige FILE_LIMITS bij opstart', () => {
  test('files/AC-6: de standaardwaarden uit de spec starten met en zonder adapter (controle op de test zelf)', () => {
    expect(metAdapter(GOED)).not.toThrow();
    expect(zonderAdapter(GOED)).not.toThrow();
  });

  test.each([
    ['maxBytes', { ...GOED, maxBytes: MAX_FILE_BYTES + 1 }],
    ['uploadUrlTtlSeconds', { ...GOED, uploadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS + 1 }],
    ['downloadUrlTtlSeconds', { ...GOED, downloadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS + 1 }],
    ['pageSize', { ...GOED, pageSize: MAX_PAGE_SIZE + 1 }],
  ])(
    'files/AC-6: %s boven de harde grens: createApp gooit met die sleutel, met en zonder adapter',
    (sleutel, limits) => {
      expect(metAdapter(limits)).toThrow(sleutel);
      expect(zonderAdapter(limits)).toThrow(sleutel);
    },
  );

  test.each([
    ['maxBytes', { ...GOED, maxBytes: MAX_FILE_BYTES }],
    ['uploadUrlTtlSeconds', { ...GOED, uploadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS, pendingTtlSeconds: 86_400 }],
    ['downloadUrlTtlSeconds', { ...GOED, downloadUrlTtlSeconds: MAX_FILE_URL_TTL_SECONDS }],
    ['pageSize', { ...GOED, pageSize: MAX_PAGE_SIZE }],
  ])('files/AC-6: %s precies op de harde grens is toegestaan', (_, limits) => {
    expect(metAdapter(limits)).not.toThrow();
  });

  test.each([
    ['gelijk aan uploadUrlTtlSeconds', 300],
    ['kleiner dan uploadUrlTtlSeconds', 299],
  ])('files/AC-6: pendingTtlSeconds %s: createApp gooit met pendingTtlSeconds en uploadUrlTtlSeconds', (_, pending) => {
    const start = metAdapter({ ...GOED, pendingTtlSeconds: pending });

    expect(start).toThrow('pendingTtlSeconds');
    expect(start).toThrow('uploadUrlTtlSeconds');
  });

  test('files/AC-6: pendingTtlSeconds één seconde boven uploadUrlTtlSeconds is toegestaan', () => {
    expect(metAdapter({ ...GOED, pendingTtlSeconds: 301 })).not.toThrow();
  });

  test('files/AC-6: een lege allowedTypes bij een adapter: createApp gooit met allowedTypes', () => {
    expect(metAdapter({ ...GOED, allowedTypes: [] })).toThrow('allowedTypes');
  });

  test('files/AC-6: een lege allowedTypes zonder adapter is toegestaan', () => {
    expect(zonderAdapter({ ...GOED, allowedTypes: [] })).not.toThrow();
  });
});
