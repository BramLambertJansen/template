import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

// Offline-melding en printstijlen van de AppShell (spec offline-en-print, AC-14) tegen de echte stack. emulateMedia vuurt
// geen beforeprint: hier alleen de layout; het lichte thema bij afdrukken toetst app-shell-print.test.tsx (AC-12).
const OFFLINE = 'Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is.';
const BACK_ONLINE = 'Weer online.';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

// Als tekst: e2e heeft geen DOM-types.
async function widthOf(page: Page, selector: string): Promise<number> {
  return page.evaluate<number>(`document.querySelector('${selector}').getBoundingClientRect().width`);
}

async function expectPrintLayout(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('link', { name: 'Naar de inhoud', includeHidden: true })).toHaveCSS('display', 'none');
  await expect(page.locator('aside').first()).toHaveCSS('display', 'none');
  await expect(page.locator('header').first()).toHaveCSS('display', 'none');
  await expect(page.getByText(OFFLINE, { exact: true })).toHaveCSS('display', 'none');
  await expect(page.locator('.z-toast').first()).toHaveCSS('display', 'none');
  const main = await widthOf(page, 'main');
  const body = await widthOf(page, 'body');
  expect(Math.abs(main - body)).toBeLessThanOrEqual(1);

  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('header').first()).toBeVisible();
}

test('offline-en-print/AC-14: offline-melding, herstel en printlayout op 1280 en 375 px', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const admin = await createAccount('admin', { totp: true });
  await signIn(page, admin);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: BACK_ONLINE })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible();
  await expectPrintLayout(page);

  await page.setViewportSize({ width: 375, height: 900 });
  await expectPrintLayout(page);
  await context.setOffline(false);
});
