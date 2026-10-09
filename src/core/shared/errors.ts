// Basisfoutcodes van de template (framework §6: naar buiten alleen `{ code, requestId }`). Het register met
// uitbreiding door de app (src/shared/errors.ts) volgt in stuk 3a (ADR 0008).
export const coreErrorCodes = ['INTERNAL_ERROR', 'NOT_FOUND', 'CSRF_REJECTED', 'PAYLOAD_TOO_LARGE'] as const;

export type CoreErrorCode = (typeof coreErrorCodes)[number];

export interface ErrorBody {
  readonly code: string;
  readonly requestId: string;
}
