import { expect, test } from 'vitest';
import { createApp } from './create-app.ts';

test('GET /api/health geeft alleen { ok: true }', async () => {
  const response = await createApp().request('/api/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ ok: true });
});

test('onbekende route geeft 404', async () => {
  const response = await createApp().request('/api/onbekend');

  expect(response.status).toBe(404);
});
