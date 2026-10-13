import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

async function openCatalog(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

for (const width of [375, 1280]) {
  test.describe(`UI-basics op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('AC-2/3/4/9/10: native bediening, payload, reset en alle staten met CSP en axe', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalog(page);
      const controls = page.getByRole('region', { name: 'Textarea, Checkbox en RadioGroup' });
      const name = controls.getByLabel('Naam', { exact: true });
      const checkbox = controls.getByRole('checkbox', { name: 'Meldingen' });
      const user = controls.getByRole('radio', { name: 'Gebruiker' });
      const admin = controls.getByRole('radio', { name: 'Beheerder' });
      await controls.getByRole('button', { name: 'Versturen' }).click();
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(controls.getByText('Vul een naam in.')).toBeVisible();
      await scanAxe(page);
      await name.fill('Ada\nLovelace');
      await checkbox.focus();
      await page.keyboard.press('Space');
      await expect(checkbox).toBeChecked();
      await user.focus();
      await page.keyboard.press('ArrowRight');
      await expect(admin).toBeChecked();
      await expect(user).not.toBeChecked();
      await expect(admin).toBeFocused();
      await controls.getByRole('button', { name: 'Versturen' }).click();
      await expect(controls.locator('output')).toHaveText(
        JSON.stringify({ naam: 'Ada\nLovelace', meldingen: true, rol: 'admin' }),
      );
      await controls.getByRole('button', { name: 'Annuleren' }).click();
      await expect(name).toHaveValue('');
      await expect(checkbox).not.toBeChecked();
      await expect(user).toBeChecked();
      await checkbox.locator('..').click();
      await expect(checkbox).toBeChecked();
      const disabled = page.getByRole('region', { name: 'Invoervelden: disabled' });
      await expect(disabled.getByRole('checkbox')).toBeDisabled();
      await disabled.getByRole('checkbox').locator('..').click();
      await expect(disabled.getByRole('checkbox')).toBeChecked();
      await expect(disabled.getByRole('textbox')).toBeDisabled();
      await expect(disabled.getByRole('radio', { name: 'Beheerder' })).toBeDisabled();
      await scanAxe(page);
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await scanAxe(page);
      expect(
        await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth'),
      ).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}
