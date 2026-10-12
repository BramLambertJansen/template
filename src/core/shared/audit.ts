import type { z } from 'zod';

export interface AuditActionDef {
  readonly target: string;
  readonly details: z.ZodObject;
}

export type AuditActions = Readonly<Record<string, AuditActionDef>>;

export type AuditAction<Audit extends AuditActions> = Extract<keyof Audit, string>;

export type AuditDetails<Audit extends AuditActions, A extends AuditAction<Audit>> = z.input<Audit[A]['details']>;

// Contractstub (ADR 0021): de validatie van sleutels en doeltypen volgt in de implementatie.
export function defineAuditActions<const Map extends AuditActions>(map: Map): Map {
  return map;
}
