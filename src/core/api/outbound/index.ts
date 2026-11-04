import type { z } from 'zod';
import type { Env } from '../env.ts';
import type { WithUser } from '../db/types.ts';

// Uitgaande client voor koppelingen met een partner (ADR 0077, spec uitgaande-client). Netwerk naar een externe dienst gaat
// alleen hierlangs (R-CODE-12). SKELET: de tester schrijft eerst de tests; de bouw volgt.

export type OutboundMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OutboundLogEntry {
  readonly time: string;
  readonly requestId: string;
  readonly outbound: string;
  readonly method: OutboundMethod;
  readonly path: string;
  readonly status: number | null;
  readonly durationMs: number;
  readonly attempt: number;
  readonly outcome: 'OK' | 'EXPECTED' | 'UPSTREAM_INVALID' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_TIMEOUT';
  readonly retry: boolean;
}

export type OutboundLog = (entry: OutboundLogEntry) => void;

export interface OutboundConfig {
  readonly name: string;
  readonly baseUrl: string;
  readonly hosts: readonly string[];
  readonly appEnv: Env['appEnv'];
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly budgetMs?: number;
  readonly maxAttempts?: number;
  readonly maxResponseBytes?: number;
  readonly log?: OutboundLog;
}

export interface OutboundRequest<S extends z.ZodType, E extends number> {
  readonly requestId: string;
  readonly method: OutboundMethod;
  readonly path: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly body?: unknown;
  readonly schema: S;
  readonly idempotencyKey?: string;
  readonly expect?: readonly E[];
}

export type OutboundResult<S extends z.ZodType, E extends number> =
  | { readonly ok: true; readonly status: number; readonly data: z.output<S> }
  | { readonly ok: false; readonly status: E };

export interface OutboundClient {
  readonly call: <S extends z.ZodType, const E extends number = never>(
    request: OutboundRequest<S, E>,
  ) => Promise<OutboundResult<S, E>>;
}

export class OutboundConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundConfigError';
  }
}

export class OutboundUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundUsageError';
  }
}

export class OutboundForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundForbiddenError';
  }
}

export function createOutboundClient(config: OutboundConfig): OutboundClient {
  throw new Error(`createOutboundClient: nog niet gebouwd (${config.name})`);
}

export function guardWithUser(withUser: WithUser): WithUser {
  return withUser;
}
