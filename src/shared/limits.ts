import { MAX_PAGE_SIZE } from '#core/shared/limits.ts';

// Grenzen van de app (ADR 0008); nooit boven een harde grens uit core (test in limits.test.ts).
export const ACCOUNTS_PAGE_SIZE = 25;
export const APP_LIMITS = { ACCOUNTS_PAGE_SIZE } as const;
export { MAX_PAGE_SIZE };
