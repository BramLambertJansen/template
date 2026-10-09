// Harde grenzen van de template (framework §6). App-grenzen staan in src/shared/limits.ts (ADR 0008).
export const MAX_BODY_BYTES = 100 * 1024;

// Accounts en sessies (ADR 0003, ADR 0013, spec accountbeheer).
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
export const SESSION_REFRESH_SECONDS = 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_FRESH_SECONDS = 10 * 60;

// Paginering (framework §5): een app mag kleiner, nooit groter dan MAX_PAGE_SIZE.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
