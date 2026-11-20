import { describe, expect, test, vi } from 'vitest';
import { safeRequestId } from '../../shared/request-id.ts';
import { appWith, defineRoute, notesContract } from '../route/fixture.test-helper.ts';
import { createApp } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';
import { request } from './request.test-helper.ts';

// Spec foutreferentie: de web-client toont alleen een requestId die safeRequestId accepteert; de server moet die vorm geven.
describe('createApp: vorm van de requestId', () => {
  test('foutreferentie/AC-16: een route die gooit geeft een requestId die de web-client accepteert', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const boom = defineRoute(notesContract, () => {
        throw new Error('boom');
      });
      const { app } = appWith({ role: 'user', sessionStrength: 'password' }, [boom]);
      const { requestId } = parseErrorBody(await (await request(app, '/api/notes/n1')).json());

      expect(safeRequestId(requestId)).toBe(requestId);
    } finally {
      error.mockRestore();
    }
  });

  test('foutreferentie/AC-16: een onbekende route geeft een requestId die de web-client accepteert', async () => {
    const { requestId } = parseErrorBody(await (await request(createApp(), '/api/onbekend')).json());

    expect(safeRequestId(requestId)).toBe(requestId);
  });
});
