import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec stappenformulier: AC-15 t/m AC-17 tegen de echte lokale stack, op mobiel en desktop, licht en donker.
for (const width of [375, 1280]) {
  test(`stappenformulier/AC-15 AC-16 AC-17 doorloop met toetsenbord op ${String(width)} px`, async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    const csp = collectCspViolations(page);
    await signIn(page, await createAccount('admin', { totp: true }));
    await page.goto('/design-system?vak=patronen');
    const wizard = page.getByRole('region', { name: 'Stappenformulier' });
    await expect(wizard.getByRole('heading', { name: 'Stap 1 van 3: Gegevens' })).toBeVisible();
    await wizard.getByRole('button', { name: 'Volgende' }).click();
    await expect(wizard.getByRole('heading', { name: 'Controleer de invoer' }).locator('..')).toBeFocused();
    await scanAxe(page);
    await wizard.getByRole('textbox', { name: 'Naam', exact: true }).fill('Anna de Vries');
    const email = wizard.getByRole('textbox', { name: 'E-mailadres', exact: true });
    await email.fill('anna@example.test');
    await email.press('Enter');
    await expect(wizard.getByRole('heading', { name: 'Stap 2 van 3: Adres' })).toBeFocused();
    await wizard.getByRole('textbox', { name: 'Straat en huisnummer' }).fill('Dorpsstraat 1');
    await wizard.getByRole('textbox', { name: 'Postcode' }).fill('1234 AB');
    await wizard.getByRole('button', { name: 'Vorige' }).press('Enter');
    await expect(wizard.getByRole('heading', { name: 'Stap 1 van 3: Gegevens' })).toBeFocused();
    await expect(wizard.getByRole('textbox', { name: 'Naam', exact: true })).toHaveValue('Anna de Vries');
    await email.press('Enter');
    await expect(wizard.getByRole('textbox', { name: 'Postcode' })).toHaveValue('1234 AB');
    const city = wizard.getByRole('textbox', { name: 'Plaats' });
    await city.fill('Voorbeeldstad');
    await city.press('Enter');
    await expect(wizard.getByRole('heading', { name: 'Stap 3 van 3: Controleren' })).toBeFocused();
    await expect(wizard.getByText('Voorbeeldstad')).toBeVisible();
    await scanAxe(page);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );
    await wizard.getByRole('checkbox', { name: 'Ik bevestig dat deze gegevens kloppen.' }).press('Space');
    await wizard.getByRole('button', { name: 'Versturen' }).press('Enter');
    const notice = wizard.getByText('Aanmelding verstuurd. Dit voorbeeld bewaart niets.');
    await expect(notice.locator('..')).toBeFocused();
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await scanAxe(page);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );
    await wizard.getByRole('button', { name: 'Nieuwe aanmelding' }).click();
    const first = wizard.getByRole('heading', { name: 'Stap 1 van 3: Gegevens' });
    await expect(first).toBeVisible();
    await expect(first).not.toBeFocused();
    const name = wizard.getByRole('textbox', { name: 'Naam', exact: true });
    await expect(name).toHaveValue('');
    await name.fill('Bert');
    await wizard.getByRole('link', { name: 'Terug naar accounts' }).click();
    const leave = page.getByRole('alertdialog', { name: 'Pagina verlaten?' });
    await expect(leave.getByText('Je hebt onopgeslagen wijzigingen. Bij verlaten gaan deze verloren.')).toBeVisible();
    await leave.getByRole('button', { name: 'Wijzigingen verwerpen en verlaten' }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    expect(csp).toStrictEqual([]);
  });
}
