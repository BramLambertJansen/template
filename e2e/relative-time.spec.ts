import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
    0,
  );
}

// Spec relatieve-tijd: de catalogussectie op de echte stack, beide breedtes en beide thema's.
for (const width of [375, 1280]) {
  test(`relatieve-tijd/AC-11: RelativeTime zonder axe-schendingen en overflow op ${String(width)} px`, async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, await createAccount('admin', { totp: true }));
    await page.goto('/design-system?vak=gegevens');
    const section = page.getByRole('region', { name: 'RelativeTime', exact: true });
    await expect(section.locator('time')).toHaveCount(9);
    await expect(section.locator('time[datetime="2026-11-13T09:57:00Z"]')).toHaveAttribute(
      'title',
      '13 november 2026 om 10:57',
    );
    await section.scrollIntoViewIfNeeded();
    await scanAxe(page);
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await scanAxe(page);
    await expectNoOverflow(page);
  });
}
