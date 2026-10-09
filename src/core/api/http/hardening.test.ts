import { describe, expect, test, vi } from 'vitest';
import { MAX_BODY_BYTES } from '../../shared/limits.ts';
import { createApp } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';

// Framework §6: naar buiten alleen `{ code, requestId }`, nooit een stacktrace; bodyLimit; secureHeaders voor /api.
const json = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

describe('createApp: verharding', () => {
  test('een fout in een route geeft 500 met alleen code en requestId', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp().get('/boom', () => {
      throw new Error('geheime details met SQL');
    });

    const response = await app.request('/api/boom');
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(parseErrorBody(body).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('geheim');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  test('onbekende route geeft NOT_FOUND met requestId', async () => {
    const response = await createApp().request('/api/onbekend');

    expect(parseErrorBody(await response.json()).code).toBe('NOT_FOUND');
  });

  test('een te grote body geeft 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await createApp().request('/api/x', {
      method: 'POST',
      headers: json,
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  test('elke response heeft secureHeaders en een X-Request-Id', async () => {
    const response = await createApp().request('/api/health');

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('x-request-id')).toMatch(/.+/);
  });
});
