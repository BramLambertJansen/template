import type { z } from 'zod';
import { safeRequestId } from '../../shared/request-id.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';

// Enige plek met fetch (framework §5). Getypt op de route-contracten uit src/shared: de web-code importeert niets uit src/api.
// Same-origin met cookie; de CSRF-headers stuurt de browser zelf (Sec-Fetch-Site), Content-Type zet de client altijd (ADR 0041).
// 401 → inloggen: createQueryClient (query.ts) en de guard (guard.ts) handelen dat af; de client gooit alleen ApiError.

interface AnyContract {
  readonly method: string;
  readonly path: string;
  readonly input: z.ZodType;
  readonly output: z.ZodType;
}

type Key<C> = C extends AnyContract ? `${C['method']} ${C['path']}` : never;
type ContractFor<C, K> = C extends AnyContract ? (K extends `${C['method']} ${C['path']}` ? C : never) : never;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  // Alleen een veilige korte id (safeRequestId), anders null; nooit in `message` (spec foutreferentie).
  readonly requestId: string | null;

  constructor(code: string, status: number, requestId?: unknown) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = safeRequestId(requestId);
  }
}

// De referentie die een gebruiker aan support doorgeeft: alleen bij een serverfout (≥ 500) met geldige requestId (spec
// foutreferentie, AC-6). Bij 4xx is de foutzin zelf de uitleg.
export function supportReference(error: unknown): string | null {
  return error instanceof ApiError && error.status >= 500 ? error.requestId : null;
}

function fillPath(path: string, input: Record<string, unknown>): { url: string; rest: Record<string, unknown> } {
  const used = new Set<string>();
  const url = path.replace(/:(\w+)/g, (_, name: string) => {
    used.add(name);
    return encodeURIComponent(String(input[name]));
  });
  return { url: `/api${url}`, rest: Object.fromEntries(Object.entries(input).filter(([name]) => !used.has(name))) };
}

// Leest de foutbody één keer: `code` (terugval INTERNAL_ERROR) en `requestId` (de constructor valideert hem).
async function apiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Geen JSON (bijv. HTML van een proxy): de algemene code, geen requestId.
  }
  if (typeof body !== 'object' || body === null) return new ApiError('INTERNAL_ERROR', response.status);
  const code = 'code' in body && typeof body.code === 'string' ? body.code : 'INTERNAL_ERROR';
  return new ApiError(code, response.status, 'requestId' in body ? body.requestId : undefined);
}

// Het antwoord van POST /api/files (spec bestandsopslag): dezelfde vorm als SignedUpload in src/core/api/storage/port.ts,
// hier structureel herhaald omdat de web-zone niets uit de api-zone importeert.
export interface SignedUploadTarget {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

// Uploadt een bestand naar een signed URL: precies de methode en headers uit het antwoord, zonder cookies (de URL draagt de
// toestemming, niet de sessie). Een niet-ok antwoord gooit ApiError met de code uit de body, anders INTERNAL_ERROR.
export async function uploadFile(upload: SignedUploadTarget, file: Blob): Promise<void> {
  const response = await fetch(upload.url, {
    method: upload.method,
    credentials: 'omit',
    headers: { ...upload.headers },
    body: file,
  });
  if (!response.ok) throw await apiError(response);
}

export function createApiClient<Contracts extends readonly AnyContract[]>() {
  async function call<K extends Key<Contracts[number]>>(
    key: K,
    input: z.input<ContractFor<Contracts[number], K>['input']>,
  ): Promise<z.output<ContractFor<Contracts[number], K>['output']>> {
    const [method = 'GET', path = '/'] = key.split(' ');
    const { url, rest } = fillPath(path, typeof input === 'object' && input !== null ? { ...input } : {});
    const query =
      method === 'GET' || method === 'DELETE'
        ? `?${new URLSearchParams(
            Object.entries(rest)
              .filter(([, value]) => value !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ).toString()}`
        : '';
    const response = await fetch(`${url}${query === '?' ? '' : query}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...(query === '' ? { body: JSON.stringify(rest) } : {}),
    });
    if (!response.ok) throw await apiError(response);
    const body: unknown = await response.json();
    return unsafeCast(body, 'de server valideert de output tegen hetzelfde contract (createApp)');
  }

  async function health(): Promise<boolean> {
    const response = await fetch('/api/health', { credentials: 'same-origin' });
    return response.ok;
  }

  // Alleen lokaal (ADR 0043): logt in als het seed-account van de rol uit het register van de app; elders geeft de server 404.
  async function devLoginAs(rol: string): Promise<void> {
    const response = await fetch('/api/dev/login-as', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rol }),
    });
    if (!response.ok) throw await apiError(response);
  }

  return { call, health, devLoginAs };
}
