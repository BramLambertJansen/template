import { z } from 'zod';
import { defineContract } from './kit.ts';

// GET /api/me (spec accountbeheer): wie ben ik, met de rol uit de database.
export const meOutput = z
  .object({ id: z.string(), naam: z.string(), email: z.string(), rol: z.enum(['user', 'admin']) })
  .strict();

export const meContract = defineContract({
  method: 'GET',
  path: '/me',
  input: z.object({}).strict(),
  output: meOutput,
  permission: 'me:read',
});
