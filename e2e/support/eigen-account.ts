import { expect, type Browser, type Page } from '@playwright/test';
import { clientIpHeaders, PASSWORD, totpFor, type TestAccount } from './accounts.ts';
import { scanAxe } from './axe.ts';

// Hulp voor de e2e-tests van spec eigen-account. Elke browsercontext krijgt een eigen IP (rate limit van Better Auth per
// IP en pad), zodat de tests elkaar niet afremmen.

export async function axeAtBothWidths(page: Page): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await scanAxe(page);
    // Als tekst: e2e heeft geen DOM-types.
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
    expect(overflow, `horizontaal scrollen op ${String(width)} px`).toBeLessThanOrEqual(0);
  }
}

// Inloggen via het scherm; met een TOTP-geheim ook de code.
export async function signIn(page: Page, account: TestAccount, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(account.email);
  await page.getByLabel('Wachtwoord').fill(password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  if (account.totpSecret !== undefined) {
    await page.getByLabel('Code', { exact: true }).fill(totpFor(account.totpSecret));
    await page.getByRole('button', { name: 'Bevestigen' }).click();
  }
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toBeVisible();
}

// Een tweede apparaat: een eigen context (eigen cookies en IP), ingelogd.
export async function secondDevice(browser: Browser, account: TestAccount, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await signIn(page, account, password);
  return page;
}

export async function openAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Profielmenu' }).click();
  await page.getByRole('menuitem', { name: 'Mijn account' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mijn account');
}
