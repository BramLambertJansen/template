import { expect, test } from 'vitest';
import { invitationMail } from './invitation.ts';

// Uitnodiging (spec accountbeheer) in de mail-layout: onderwerp, de spectekst en de link in tekst én HTML.
test('uitnodiging: onderwerp, tekst en HTML met de link', () => {
  const mail = invitationMail({
    email: 'ada@example.test',
    name: 'Ada',
    url: 'https://app.example.test/uitnodiging?token=t1',
  });
  expect(mail.to).toBe('ada@example.test');
  expect(mail.subject).toBe('Uitnodiging voor App-template');
  expect(mail.text).toMatchSnapshot();
  expect(mail.html).toContain('href="https://app.example.test/uitnodiging?token=t1"');
  expect(mail.html).toContain('Wachtwoord instellen');
});
