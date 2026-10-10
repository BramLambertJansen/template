import { z } from 'zod';
import { ROLES } from '#core/shared/can.ts';
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
