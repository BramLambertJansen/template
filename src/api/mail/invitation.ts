import type { Invitation } from '#core/api/auth/index.ts';
import type { Mail } from '#core/api/mail/smtp.ts';
import { APP_NAME } from '#shared/app.ts';
import { INVITATION_TTL_SECONDS } from '#core/shared/limits.ts';

const DAY_SECONDS = 24 * 60 * 60;

// Tekst uit de spec accountbeheer (onderwerp "Uitnodiging voor {appnaam}").
export function invitationMail({ email, name, url }: Invitation): Mail {
  const days = String(INVITATION_TTL_SECONDS / DAY_SECONDS);
  return {
    to: email,
    subject: `Uitnodiging voor ${APP_NAME}`,
    text: [
      `Hallo ${name},`,
      '',
      `Je bent uitgenodigd voor ${APP_NAME}. Stel via deze link je wachtwoord in:`,
      url,
      '',
      `De link werkt ${days} dagen en één keer. Verwachtte je deze mail niet, dan kun je hem negeren.`,
    ].join('\n'),
  };
}
