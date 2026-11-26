import { RESET_LINK_TTL_SECONDS } from '../../shared/limits.ts';
import { renderMail } from './layout.ts';
import type { Mail } from './smtp.ts';

const HOUR_SECONDS = 60 * 60;

// Resetmail (spec accountbeheer-uitbreiding, tabel "Alle zichtbare tekst"): een beheerder vroeg een resetlink aan voor een
// actief account; de link wijst naar /uitnodiging?token=…&soort=reset.
export function passwordResetMail(input: {
  readonly appName: string;
  readonly name: string;
  readonly to: string;
  readonly url: string;
}): Mail {
  const { appName, name, to, url } = input;
  const hours = String(RESET_LINK_TTL_SECONDS / HOUR_SECONDS);
  return {
    to,
    subject: `Nieuw wachtwoord instellen voor ${appName}`,
    ...renderMail({
      appName,
      greeting: `Hallo ${name},`,
      paragraphs: [
        `Een beheerder heeft een link voor je aangevraagd om een nieuw wachtwoord in te stellen. De link is ${hours} uur geldig.`,
      ],
      action: { label: 'Wachtwoord instellen', url },
    }),
  };
}
