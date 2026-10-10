import { describe, expect, test } from 'vitest';
import { createApp } from './create-app.ts';
import { request } from './request.test-helper.ts';

test('GET /api/health geeft alleen { ok: true }', async () => {
  const response = await request(createApp(), '/api/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ ok: true });
});

test('onbekende route geeft 404', async () => {
  const response = await request(createApp(), '/api/onbekend');

  expect(response.status).toBe(404);
});

describe('GET /api/ready (readiness, framework §3)', () => {
  test('database bereikbaar: 200 met alleen { ok: true }', async () => {
    const response = await request(createApp({ ready: () => Promise.resolve(true) }), '/api/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('database onbereikbaar: 503 met alleen { ok: false }', async () => {
    const response = await request(createApp({ ready: () => Promise.resolve(false) }), '/api/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  test('zonder ready bestaat de route niet', async () => {
    const response = await request(createApp(), '/api/ready');
    expect(response.status).toBe(404);
  });
});
