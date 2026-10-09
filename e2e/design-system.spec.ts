import { expect, test } from '@playwright/test';
import { collectCspViolations, scanAxe } from './support/axe.ts';

// De catalogus (alleen in dev) op 375 en 1280 px, licht en donker: axe, geen CSP-schendingen, geen horizontaal scrollen,
// en de toetsenbordafspraken uit de spec (Esc sluit, focus terug op de knop).
for (const width of [375, 1280]) {
  test.describe(`design-system op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('axe in licht en donker, zonder CSP-schendingen of horizontaal scrollen', async ({ page }) => {
      const csp = collectCspViolations(page);
      await page.goto('/design-system');
      await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();

      await scanAxe(page);
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await scanAxe(page);

      // Als tekst: de e2e-tsconfig kent geen DOM-types.
      const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
      expect(overflow).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}

test('dialoog: focus erin, Esc sluit, focus terug op de knop', async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto('/design-system');
  const opener = page.getByRole('button', { name: 'Dialoog openen' });

  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await expect(dialog).toBeVisible();
  await scanAxe(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(csp).toStrictEqual([]);
});

test('menu: met het toetsenbord open, Esc sluit, focus terug op de knop', async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto('/design-system');
  const trigger = page.getByRole('button', { name: 'Menu openen' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Uitloggen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(csp).toStrictEqual([]);
});

test('profielmenu in de AppShell heeft de toegankelijke naam "Profielmenu" en toont de initialen', async ({ page }) => {
  await page.goto('/design-system');

  // "Anna de Vries": eerste letter van het eerste en het laatste woord.
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toHaveText('AV');
});
