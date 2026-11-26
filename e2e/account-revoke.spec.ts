import { expect, test, type Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  freshTotpFor,
  invitationLink,
  PASSWORD,
  type TestAccount,
} from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

// Uitnodiging intrekken in de UI (spec accountbeheer-uitbreiding, accounts/AC-15 en het webdeel van accounts/AC-19)
// tegen de echte stack: CSP aan, axe op 375 en 1280 px met open menu en dialoog. De API-kant staat in
// test/api/account-revoke.int.test.ts.

async function axeAtBothWidths(page: Page): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await scanAxe(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function signInAsAdmin(page: Page, admin: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.getByLabel('Code', { exact: true }).fill(freshTotpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

// Een uitnodiging via de UI (de mail met de link staat daarna in Mailpit).
async function inviteViaUi(page: Page, naam: string, email: string): Promise<void> {
  await page.getByRole('button', { name: 'Account uitnodigen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await dialog.getByLabel('Naam').fill(naam);
  await dialog.getByLabel('E-mailadres').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Gebruiker' });
  await dialog.getByRole('button', { name: 'Uitnodiging versturen' }).click();
  await expect(page.getByRole('status')).toHaveText(`Uitnodiging verstuurd naar ${email}.`);
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('accounts/AC-15: intrekken met bevestiging; rij weg, focus op de tabel, de link is dood en het adres kan opnieuw', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  const email = `intrekken-${String(Date.now())}@template.test`;
  await signInAsAdmin(page, admin);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/accounts');
  await inviteViaUi(page, 'Ivo Intrekken', email);
  const link = await invitationLink(email);
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Uitgenodigd');

  await row.getByRole('button', { name: 'Acties voor Ivo Intrekken' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Opnieuw uitnodigen', 'Uitnodiging intrekken']);
  await expect(row.getByRole('button', { name: 'Opnieuw uitnodigen' })).toHaveCount(0);
  await axeAtBothWidths(page);
  await page.getByRole('menuitem', { name: 'Uitnodiging intrekken', exact: true }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Uitnodiging intrekken?' });
  await expect(dialog).toContainText(`De link aan ${email} werkt niet meer en het account verdwijnt uit de lijst.`);
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Intrekken', exact: true })).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Intrekken', exact: true }).click();

  await expect(page.getByRole('status')).toHaveText(`De uitnodiging aan ${email} is ingetrokken.`);
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Accounts' })).toBeFocused();

  const invitee = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await invitee.goto(link);
  await invitee.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await invitee.getByLabel('Wachtwoord herhalen').fill(PASSWORD);
  await invitee.getByRole('button', { name: 'Wachtwoord instellen' }).click();
  await expect(invitee.getByRole('alert')).toHaveText(
    'Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe aan.',
  );

  await inviteViaUi(page, 'Ivo Opnieuw', email);
  await expect(page.getByRole('row').filter({ hasText: email })).toContainText('Uitgenodigd');
  expect(csp).toStrictEqual([]);
});

test('accounts/AC-15: filter Status Uitgenodigd met één rij: na intrekken is de lijst leeg en staat de focus op "Account uitnodigen"', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  const email = `leeg-${String(Date.now())}@template.test`;
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await inviteViaUi(page, 'Lea Leeg', email);
  await page.getByLabel('Zoeken').fill(email);
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Uitgenodigd' });
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Acties voor Lea Leeg' }).click();
  await page.getByRole('menuitem', { name: 'Uitnodiging intrekken', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Uitnodiging intrekken?' })
    .getByRole('button', { name: 'Intrekken', exact: true })
    .click();

  await expect(page.getByRole('status').filter({ hasText: 'is ingetrokken' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account uitnodigen' })).toBeFocused();
});

test('accounts/AC-15: annuleren in de dialoog trekt niets in; de focus keert terug op de menuknop van de rij', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  const email = `annuleren-${String(Date.now())}@template.test`;
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await inviteViaUi(page, 'Anke Annuleer', email);
  const row = page.getByRole('row').filter({ hasText: email });
  const menuButton = row.getByRole('button', { name: 'Acties voor Anke Annuleer' });
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Uitnodiging intrekken', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Uitnodiging intrekken?' })
    .getByRole('button', { name: 'Annuleren' })
    .click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(row).toContainText('Uitgenodigd');
  await expect(menuButton).toBeFocused();
});

test('accounts/AC-15: intrekken terwijl de genodigde al accepteerde: ALREADY_ACTIVE met de eigen tekst in de dialoog', async ({
  browser,
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  const email = `al-actief-${String(Date.now())}@template.test`;
  await signInAsAdmin(page, admin);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/accounts');
  await inviteViaUi(page, 'Aad Actief', email);
  const link = await invitationLink(email);
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: 'Acties voor Aad Actief' }).click();
  await page.getByRole('menuitem', { name: 'Uitnodiging intrekken', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Uitnodiging intrekken?' });

  const invitee = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await invitee.goto(link);
  await invitee.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await invitee.getByLabel('Wachtwoord herhalen').fill(PASSWORD);
  await invitee.getByRole('button', { name: 'Wachtwoord instellen' }).click();
  await expect(invitee.getByRole('status')).toHaveText('Je wachtwoord is ingesteld. Log in om verder te gaan.');

  await dialog.getByRole('button', { name: 'Intrekken', exact: true }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Dit account is inmiddels actief; de uitnodiging is al gebruikt.');
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Annuleren' }).click();
  await expect(row).toContainText('Actief');
});
