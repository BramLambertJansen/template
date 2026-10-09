import { meContract } from './me.ts';

// Alle route-contracten van de app; de web-client is hierop getypt (src/web/lib/api.ts).
export const contracts = [meContract] as const;
export type Contracts = typeof contracts;
