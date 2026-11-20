import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient, supportReference } from './api-client.ts';
import { ForbiddenError } from './guard.ts';

afterEach(() => vi.unstubAllGlobals());

const id = '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64';
const contract = { method: 'GET', path: '/items', input: z.object({}).strict(), output: z.null() } as const;
const client = createApiClient<readonly [typeof contract]>();

function respond(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

async function failure(): Promise<ApiError> {
  try {
    await client.call(`${contract.method} ${contract.path}`, {});
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('call slaagde onverwacht');
}

describe('ApiError.requestId', () => {
  test('foutreferentie/AC-1: code, status en requestId uit de foutbody; message blijft de code', async () => {
    respond(Response.json({ code: 'INTERNAL_ERROR', requestId: id }, { status: 500 }));
    const error = await failure();
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.status).toBe(500);
    expect(error.requestId).toBe(id);
    expect(error.message).toBe('INTERNAL_ERROR');
  });

  test.each([
    ['ontbreekt', {}],
    ['getal', { requestId: 42 }],
    ['null', { requestId: null }],
    ['object', { requestId: { id } }],
    ['leeg', { requestId: '' }],
    ['65 tekens', { requestId: 'a'.repeat(65) }],
    ['spatie', { requestId: 'a b' }],
    ['kleiner-dan', { requestId: '<script>' }],
    ['slash', { requestId: 'a/b' }],
    ['regeleinde', { requestId: 'a\nb' }],
    ['apostrof', { requestId: "a'b" }],
  ])('foutreferentie/AC-2: requestId %s wordt null, code zoals vandaag', async (_, extra) => {
    respond(Response.json({ code: 'NOT_FOUND', ...extra }, { status: 404 }));
    const error = await failure();
    expect(error.requestId).toBeNull();
    expect(error.code).toBe('NOT_FOUND');
  });

  test('foutreferentie/AC-3: een antwoord dat geen JSON is geeft INTERNAL_ERROR zonder requestId', async () => {
    respond(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const error = await failure();
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.requestId).toBeNull();
  });

  test('foutreferentie/AC-5: devLoginAs geeft de requestId mee', async () => {
    respond(Response.json({ code: 'INTERNAL_ERROR', requestId: id }, { status: 500 }));
    await expect(client.devLoginAs('user')).rejects.toMatchObject({ status: 500, requestId: id });
  });

  test('de constructor valideert: een ongeldige of ontbrekende id wordt null', () => {
    expect(new ApiError('INTERNAL_ERROR', 500, '<script>').requestId).toBeNull();
    expect(new ApiError('INTERNAL_ERROR', 500).requestId).toBeNull();
  });
});

describe('supportReference', () => {
  test('foutreferentie/AC-6: alleen een ApiError ≥ 500 met geldige id geeft een referentie', () => {
    expect(supportReference(new ApiError('INTERNAL_ERROR', 500, id))).toBe(id);
    expect(supportReference(new ApiError('UNAVAILABLE', 503, id))).toBe(id);
    expect(supportReference(new ApiError('CONFLICT', 499, id))).toBeNull();
    expect(supportReference(new ApiError('INTERNAL_ERROR', 500))).toBeNull();
    expect(supportReference(Object.assign(new Error('x'), { status: 500, requestId: id }))).toBeNull();
    expect(supportReference(new ForbiddenError())).toBeNull();
    expect(supportReference(undefined)).toBeNull();
  });
});
