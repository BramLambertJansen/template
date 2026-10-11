import { z } from 'zod';
import { ROLES } from '#core/shared/can.ts';
import { MAX_NAME_LENGTH } from '../limits.ts';
import { defineContract } from './kit.ts';

// GET /api/me (spec accountbeheer): wie ben ik, met de rol uit de database.
export const meOutput = z.object({ id: z.string(), naam: z.string(), email: z.string(), rol: z.enum(ROLES) }).strict();

export const meContract = defineContract({
  method: 'GET',
  path: '/me',
  input: z.object({}).strict(),
  output: meOutput,
  permission: 'me:read',
});

// Spec eigen-account: de eigen naam wijzigen. Het account komt uit de sessie, nooit uit de invoer.
export const renameInput = z
  .object({
    naam: z
      .string()
      .trim()
      .min(1, 'Vul een naam in.')
      .max(MAX_NAME_LENGTH, `Hooguit ${String(MAX_NAME_LENGTH)} tekens.`),
  })
  .strict();

export const renameContract = defineContract({
  method: 'PATCH',
  path: '/me',
  input: renameInput,
  output: z.null(),
  permission: 'me:update',
});
