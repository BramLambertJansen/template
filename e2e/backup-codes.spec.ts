import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  base32Decode,
  clientIpHeaders,
  createAccount,
  freshTotpFor,
  PASSWORD,
  type TestAccount,
} from './support/accounts.ts';
import { collectCspViolations } from './support/axe.ts';
import { axeAtBothWidths } from './support/eigen-account.ts';

// Herstelcodes in de UI (spec accountbeheer-uitbreiding, accounts/AC-17 en accounts/AC-18; ADR 0113) tegen de echte stack:
// CSP aan, axe op 375 en 1280 px. De API-kant staat in test/auth/backup-codes.int.test.ts.

const CODE_SHAPE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;
const INVALID = 'Deze herstelcode klopt niet of is al gebruikt.';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

const codeItems = (page: Page) => page.getByRole('listitem').filter({ hasText: CODE_SHAPE });

async function readCodes(page: Page): Promise<string[]> {
  await expect(codeItems(page)).toHaveCount(10);
  return (await codeItems(page).allTextContents()).map((code) => code.trim());
}

// Een admin zonder TOTP schrijft in: wachtwoord, sleutel, eerste code; daarna het scherm "Herstelcodes".
async function enrolWithTotp(page: Page, admin: TestAccount): Promise<string[]> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tweestapsverificatie instellen');
  await page.getByRole('button', { name: 'Kan je niet scannen? Toon de sleutel' }).click();
  const secret = (await page.locator('code').textContent()) ?? '';
  await page.getByLabel('Code', { exact: true }).fill(freshTotpFor(base32Decode(secret)));
  await page.getByRole('button', { name: 'Activeren' }).click();
  await expect(page.getByRole('heading', { name: 'Herstelcodes' })).toBeVisible();
  return readCodes(page);
}

// Een tweede apparaat (eigen context en IP): wachtwoord, dan "Gebruik een herstelcode" en de code; de pagina blijft op het
// herstelcodescherm staan zodat de test het resultaat kan lezen.
async function submitBackupCode(browser: Browser, admin: TestAccount, code: string): Promise<Page> {
  const page = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page
    .getByRole('link', { name: 'Gebruik een herstelcode' })
    .or(page.getByRole('button', { name: 'Gebruik een herstelcode' }))
    .click();
  await expect(page.getByRole('heading', { name: 'Herstelcode', exact: true })).toBeVisible();
  await page.getByLabel('Herstelcode', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  return page;
}

test('accounts/AC-17: TOTP inschrijven toont 10 herstelcodes; één code logt in en werkt daarna niet meer', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin');

  const codes = await enrolWithTotp(page, admin);

  expect(codes).toHaveLength(10);
  expect(new Set(codes).size).toBe(10);
  expect(codes.filter((code) => CODE_SHAPE.test(code))).toHaveLength(10);
  await expect(
    page.getByText(
      'Bewaar deze codes op een veilige plek. Elke code werkt één keer, als je je authenticator-app niet bij de hand hebt. Je ziet ze maar één keer.',
    ),
  ).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('button', { name: 'Ik heb ze bewaard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  const [first = ''] = codes;
  const second = await submitBackupCode(browser, admin, first);
  await expect(second.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  expect((await second.request.get('/api/accounts')).status()).toBe(200);

  const again = await submitBackupCode(browser, admin, first);
  await expect(again.getByRole('alert')).toHaveText(INVALID);
  expect((await again.request.get('/api/me')).status()).toBe(401);
  await axeAtBothWidths(again);
  expect(csp).toStrictEqual([]);
});

test('accounts/AC-18: nieuwe herstelcodes op /account met wachtwoord; de oude werken niet meer bij inloggen', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin');
  const oldCodes = await enrolWithTotp(page, admin);
  await page.getByRole('button', { name: 'Ik heb ze bewaard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Herstelcodes' })).toBeVisible();
  await expect(page.getByText('Nieuwe codes maken maakt de oude ongeldig.')).toBeVisible();
  await axeAtBothWidths(page);
  // De sectie Wachtwoord heeft ook een veld met dit label: de interactie blijft binnen de regio Herstelcodes.
  const section = page.getByRole('region', { name: 'Herstelcodes' });
  await section.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await section.getByRole('button', { name: 'Nieuwe herstelcodes maken' }).click();

  const newCodes = await readCodes(page);
  expect(newCodes.filter((code) => oldCodes.includes(code))).toStrictEqual([]);
  await expect(page.getByRole('button', { name: 'Nieuwe herstelcodes maken' })).toHaveCount(0);
  await axeAtBothWidths(page);
  await page.getByRole('button', { name: 'Ik heb ze bewaard' }).click();
  await expect(page.getByRole('button', { name: 'Nieuwe herstelcodes maken' })).toBeVisible();
  await expect(codeItems(page)).toHaveCount(0);

  const withOld = await submitBackupCode(browser, admin, oldCodes[0] ?? '');
  await expect(withOld.getByRole('alert')).toHaveText(INVALID);
  expect((await withOld.request.get('/api/me')).status()).toBe(401);
  await withOld.getByLabel('Herstelcode', { exact: true }).fill(newCodes[0] ?? '');
  await withOld.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(withOld.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  expect(csp).toStrictEqual([]);
});
