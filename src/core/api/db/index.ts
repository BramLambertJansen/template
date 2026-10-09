import { env } from '../env.ts';
import { createPool } from './pool.ts';
import { createWithUser } from './with-user.ts';

// De enige ingang naar de database (framework §1, §6): de rest van de module is intern.
export const withUser = createWithUser(createPool(env().databaseUrl));
export type { Actor, SessionStrength, Tx, WithUserOptions } from './with-user.ts';
