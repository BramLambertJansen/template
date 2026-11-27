import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, uploadFile } from './api-client.ts';

// Spec files ("Upload in de browser"): uploadFile(upload, file) stuurt het bestand naar de signed URL met precies de methode en
// headers uit het antwoord van POST /api/files, zonder cookies (credentials: 'omit'); een niet-ok antwoord gooit ApiError met
// de code uit het antwoord, anders INTERNAL_ERROR. Geen AC van deel A; AC-7 (deel B) dekt de hele keten in de UI.

afterEach(() => vi.unstubAllGlobals());

const SIGNED = {
  url: 'http://localhost:5173/api/dev/files/token-abc',
  method: 'PUT',
  headers: { 'Content-Type': 'application/pdf', 'X-Opslag-Test': 'ja' },
} as const;

function stubFetch(response: Response) {
  const transport = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', transport);
  return transport;
}

function callOf(transport: ReturnType<typeof stubFetch>): { url: string; init: RequestInit } {
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0] ?? [];
  if (typeof url !== 'string' || init === undefined) throw new Error('fetch is niet aangeroepen met een URL en opties');
  return { url, init };
}

function headerEntries(init: RequestInit): [string, string][] {
  return [...new Headers(init.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
}

describe('uploadFile', () => {
  const file = new Blob(['%PDF-1.4 inhoud'], { type: 'application/pdf' });

  test('stuurt het bestand naar de URL uit de signed upload, ongewijzigd (geen /api-voorvoegsel)', async () => {
    const transport = stubFetch(new Response(null, { status: 200 }));

    await uploadFile(SIGNED, file);

    const { url, init } = callOf(transport);
    expect(url).toBe(SIGNED.url);
    expect(init.body).toBe(file);
  });

  test('gebruikt precies de methode uit de signed upload', async () => {
    const transport = stubFetch(new Response(null, { status: 200 }));

    await uploadFile(SIGNED, file);

    expect(callOf(transport).init.method).toBe('PUT');
  });

  test('stuurt precies de headers uit de signed upload, niet meer en niet minder', async () => {
    const transport = stubFetch(new Response(null, { status: 200 }));

    await uploadFile(SIGNED, file);

    expect(headerEntries(callOf(transport).init)).toStrictEqual([
      ['content-type', 'application/pdf'],
      ['x-opslag-test', 'ja'],
    ]);
  });

  test("stuurt geen cookies mee: credentials is 'omit', niet 'same-origin'", async () => {
    const transport = stubFetch(new Response(null, { status: 200 }));

    await uploadFile(SIGNED, file);

    expect(callOf(transport).init.credentials).toBe('omit');
  });

  test('een ok-antwoord (200 of 204) geeft undefined terug', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(uploadFile(SIGNED, file)).resolves.toBeUndefined();
  });

  test('een niet-ok antwoord met { code, requestId } gooit ApiError met die code, status en requestId', async () => {
    stubFetch(Response.json({ code: 'ALREADY_EXISTS', requestId: 'req-1' }, { status: 409 }));

    const error = await uploadFile(SIGNED, file).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'ALREADY_EXISTS', status: 409, requestId: 'req-1' });
  });

  test.each([
    ['een antwoord zonder JSON (HTML van een proxy)', () => new Response('<html>mis</html>', { status: 502 }), 502],
    ['JSON zonder code', () => Response.json({ fout: 'x' }, { status: 500 }), 500],
    [
      'een XML-foutbody van een provider',
      () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }),
      403,
    ],
  ])('%s gooit ApiError met code INTERNAL_ERROR en de HTTP-status', async (_, build, status) => {
    stubFetch(build());

    const error = await uploadFile(SIGNED, file).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status });
  });
});
