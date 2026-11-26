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

// Resetlink sturen in de UI (spec accountbeheer-uitbreiding, accounts/AC-16): menu, ConfirmDialog, de mail uit Mailpit,
// /uitnodiging?soort=reset en inloggen met het nieuwe wachtwoord, tegen de echte stack met CSP aan en axe op 375 en 1280 px.
// De API-kant staat in test/api/account-reset-link.int.test.ts.
const NEW_PASSWORD = 'nw-e2e-'.repeat(2);

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

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('accounts/AC-16: resetlink sturen, nieuw wachtwoord instellen via de mail en inloggen met het nieuwe wachtwoord', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Rita Reset' });
  await signInAsAdmin(page, admin);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/accounts');
  await page.getByLabel('Zoeken').fill(user.email);
  const row = page.getByRole('row').filter({ hasText: user.email });
  await expect(row).toContainText('Actief');

  await row.getByRole('button', { name: 'Acties voor Rita Reset' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Resetlink sturen', 'Blokkeren', 'Deactiveren']);
  await axeAtBothWidths(page);
  await page.getByRole('menuitem', { name: 'Resetlink sturen', exact: true }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Resetlink sturen?' });
  await expect(dialog).toContainText(
    'Rita Reset krijgt een mail met een link om een nieuw wachtwoord in te stellen. Het huidige wachtwoord blijft werken tot dan.',
  );
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Link sturen' })).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Link sturen' }).click();

  await expect(page.getByRole('status')).toHaveText(`Resetlink verstuurd naar ${user.email}.`);
  await expect(dialog).toBeHidden();
  await expect(row.getByRole('button', { name: 'Acties voor Rita Reset' })).toBeFocused();

  const link = await invitationLink(user.email);
  expect(link).toContain('soort=reset');
  const target = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await target.goto(link);
  await expect(target.getByRole('heading', { level: 1, name: 'Nieuw wachtwoord instellen' })).toBeVisible();
  await axeAtBothWidths(target);
  await target.getByLabel('Wachtwoord', { exact: true }).fill(NEW_PASSWORD);
  await target.getByLabel('Wachtwoord herhalen').fill(NEW_PASSWORD);
  await target.getByRole('button', { name: 'Wachtwoord instellen' }).click();

  await expect(target).toHaveURL(/\/login\?gewijzigd=true/);
  await expect(target.getByRole('status')).toHaveText('Je wachtwoord is gewijzigd. Log in om verder te gaan.');
  await axeAtBothWidths(target);
  await target.getByLabel('E-mailadres').fill(user.email);
  await target.getByLabel('Wachtwoord').fill(NEW_PASSWORD);
  await target.getByRole('button', { name: 'Inloggen' }).click();
  await expect(target.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  expect(csp).toStrictEqual([]);
});

test('accounts/AC-16: de eigen rij heeft geen "Resetlink sturen"', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true, name: 'Eva Eigen' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await page.getByLabel('Zoeken').fill(admin.email);
  const row = page.getByRole('row').filter({ hasText: admin.email });
  await expect(row).toHaveCount(1);

  await expect(row.getByRole('button', { name: 'Acties voor Eva Eigen' })).toHaveCount(0);
});

test('accounts/AC-16: annuleren in de dialoog stuurt niets; de focus keert terug op de menuknop van de rij', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Anke Annuleer' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await page.getByLabel('Zoeken').fill(user.email);
  const row = page.getByRole('row').filter({ hasText: user.email });
  const menuButton = row.getByRole('button', { name: 'Acties voor Anke Annuleer' });
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Resetlink sturen', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Resetlink sturen?' }).getByRole('button', { name: 'Annuleren' }).click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(menuButton).toBeFocused();
});

test('accounts/AC-16: een gedeactiveerd account: de dialoog toont de eigen tekst en blijft open', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Dirk Dicht' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await page.getByLabel('Zoeken').fill(user.email);
  const row = page.getByRole('row').filter({ hasText: user.email });
  await row.getByRole('button', { name: 'Acties voor Dirk Dicht' }).click();
  await page.getByRole('menuitem', { name: 'Resetlink sturen', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Resetlink sturen?' });

  // Intussen deactiveert dezelfde admin het account in een tweede sessie; de dialoog hierboven staat nog open.
  const other = await (await page.context().browser()?.newContext({ extraHTTPHeaders: clientIpHeaders() }))?.newPage();
  if (other === undefined) throw new Error('geen tweede pagina');
  await signInAsAdmin(other, admin);
  await other.goto('/admin/accounts');
  await other.getByLabel('Zoeken').fill(user.email);
  await other
    .getByRole('row')
    .filter({ hasText: user.email })
    .getByRole('button', { name: 'Acties voor Dirk Dicht' })
    .click();
  await other.getByRole('menuitem', { name: 'Deactiveren', exact: true }).click();
  await other.getByRole('alertdialog').getByRole('button', { name: 'Deactiveren', exact: true }).click();
  await expect(other.getByRole('status')).toBeVisible();

  await dialog.getByRole('button', { name: 'Link sturen' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Dit account is gedeactiveerd. Activeer het eerst.');
  await axeAtBothWidths(page);
});
