import { coreErrorTexts } from '#core/web/copy/errors.ts';
import type { ErrorCode } from '#shared/errors.ts';

// Tekst per foutcode (framework §5): TypeScript eist er één voor elke code uit src/shared/errors.ts. Letterlijk uit de spec
// accountbeheer waar die een tekst geeft.
export const errorTexts = {
  ...coreErrorTexts,
  INVALID_CREDENTIALS: 'E-mailadres of wachtwoord klopt niet.',
  INVALID_TOTP: 'Deze code klopt niet. Probeer het opnieuw.',
  INVITATION_INVALID: 'Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe aan.',
  ALREADY_ACTIVE: 'Dit account is al actief; opnieuw uitnodigen kan niet.',
  LAST_ADMIN: 'Er moet minstens één beheerder overblijven.',
} as const satisfies Record<ErrorCode, string>;
