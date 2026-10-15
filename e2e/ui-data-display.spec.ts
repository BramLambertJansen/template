import { expect, test, type Page, type Locator } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

async function openCatalogue(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await page.getByRole('region', { name: 'DataTable', exact: true }).waitFor();
}

async function swipeLeft(page: Page, slide: Locator) {
  await slide.scrollIntoViewIfNeeded();
  const box = await slide.boundingBox();
  if (box === null) throw new Error('Carousel slide must be visible');
  const x = box.x + Math.min(box.width - 10, 220);
  const y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const step of [20, 40, 60, 80, 100]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step, y }] });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

for (const width of [375, 1280]) {
  test.describe(`Gegevensweergave op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: true });
    test.beforeEach(async ({ context }) => {
      await context.setExtraHTTPHeaders(clientIpHeaders());
    });

    test('AC-2/3/6: sortering, selectie, meer laden en zoekbare filterchips', async ({ page }) => {
      await openCatalogue(page);
      const section = page.getByRole('region', { name: 'DataTable', exact: true });
      const table = section.getByRole('region', { name: 'Voorbeeldgegevens', exact: true });
      const result = section.getByRole('status', { name: 'Tabelresultaat' });
      await table.getByRole('checkbox', { name: 'Selecteer Anna de Vries', exact: true }).check();
      await expect(result).toContainText('1 geselecteerd');
      await section.getByRole('button', { name: 'Meer laden', exact: true }).click();
      await expect(result).toContainText('3 resultaten');
      await table.getByRole('button', { name: /Naam/ }).click();
      await expect(table.getByRole('columnheader').filter({ hasText: 'Naam' })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      const role = section.getByRole('combobox', { name: 'Rol', exact: true });
      await role.fill('beheer');
      await section.getByRole('option', { name: 'Beheerder', exact: true }).tap();
      await expect(result).toHaveText('1 resultaten; 0 geselecteerd');
      await expect(table.getByRole('cell', { name: 'Bert Jansen', exact: true })).toBeVisible();
      await section.getByRole('button', { name: 'Verwijder Rol: Beheerder', exact: true }).click();
      await expect(role).toBeFocused();
      await role.press('Escape');
      const search = section.getByRole('searchbox', { name: 'Zoeken', exact: true });
      await search.fill('onbekend');
      await expect(table.getByRole('cell', { name: 'Geen resultaten.', exact: true })).toBeVisible();
      await section.getByRole('button', { name: 'Filters wissen', exact: true }).click();
      await expect(search).toBeFocused();
      await expect(result).toHaveText('2 resultaten; 0 geselecteerd');
      await section.getByRole('checkbox', { name: 'Tabel bezig', exact: true }).check();
      await expect(table.getByRole('button', { name: /Naam/ })).toBeDisabled();
      await section.getByRole('checkbox', { name: 'Tabel bezig', exact: true }).uncheck();
      await table.getByRole('button', { name: 'Bekijken', exact: true }).first().click();
      await expect(section.getByRole('status', { name: 'Rijactie' })).toHaveText('Anna de Vries');
    });

    test('AC-4/5/7/9/10: tabs, preview, swipe, focus, axe en CSP', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalogue(page);
      const tabs = page.getByRole('tablist', { name: 'Voorbeeldtabs', exact: true });
      const overview = tabs.getByRole('tab', { name: 'Overzicht', exact: true });
      await overview.focus();
      await overview.press('ArrowRight');
      const details = tabs.getByRole('tab', { name: 'Details', exact: true });
      await expect(details).toBeFocused();
      await expect(details).toHaveAttribute('aria-selected', 'false');
      await details.press('Enter');
      const input = page
        .getByRole('tabpanel', { name: 'Details', exact: true })
        .getByRole('textbox', { name: 'Bewaarde invoer' });
      await input.fill('Bewaard');
      await overview.click();
      await expect(input).toBeHidden();
      await details.click();
      await expect(input).toHaveValue('Bewaard');
      const gallery = page.getByRole('region', { name: 'Gallery', exact: true });
      const opener = gallery.getByRole('button', { name: 'Afbeelding bekijken: Landschap', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Landschap', exact: true });
      await expect(dialog.getByRole('img')).toBeVisible();
      await scanAxe(page);
      await dialog.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      await expect(gallery.getByRole('status')).toHaveText('Afbeelding niet beschikbaar.');
      const carousel = page.getByRole('region', { name: 'Voorbeeldcarrousel', exact: true });
      const slide = carousel.getByRole('group', { name: '1 van 3: Landschap', exact: true });
      await swipeLeft(page, slide);
      await expect(carousel.getByRole('textbox', { name: 'Dia-invoer' })).toBeVisible();
      await carousel.getByRole('textbox', { name: 'Dia-invoer' }).fill('Blijft');
      await carousel.getByRole('button', { name: 'Bekijken', exact: true }).tap();
      await expect(page.getByRole('status', { name: 'Dia-actie' })).toHaveText('Bekijken');
      await carousel.getByRole('button', { name: 'Volgende dia', exact: true }).click();
      await expect(carousel.getByRole('button', { name: 'Volgende dia', exact: true })).toBeDisabled();
      await carousel.getByRole('button', { name: 'Toon dia 2: Architectuur', exact: true }).click();
      await expect(carousel.getByRole('textbox', { name: 'Dia-invoer' })).toHaveValue('Blijft');
      await scanAxe(page);
      await page.getByRole('button', { name: /Donker thema|Licht thema/ }).click();
      await scanAxe(page);
      expect(
        await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth'),
      ).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}
