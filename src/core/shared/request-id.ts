import { MAX_REQUEST_ID_LENGTH } from './limits.ts';

// Spec foutreferentie: alleen een korte id uit [A-Za-z0-9_-] mag de gebruiker zien (als "Referentie: <id>"); al het andere
// uit een foutbody, ook een vreemde requestId, blijft buiten de DOM. De server geeft een UUID (createApp, hono/request-id).
const REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]+$/;

export function safeRequestId(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID_SHAPE.test(value)
    ? value
    : null;
}
