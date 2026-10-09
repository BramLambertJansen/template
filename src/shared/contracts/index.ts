import { accountsListContract, inviteContract, reinviteContract } from './accounts.ts';
import { meContract } from './me.ts';

// Alle route-contracten van de app; de web-client is hierop getypt (src/web/lib/api.ts).
export const contracts = [meContract, accountsListContract, inviteContract, reinviteContract] as const;
export type Contracts = typeof contracts;
