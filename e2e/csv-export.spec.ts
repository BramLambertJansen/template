import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec csv-export: de knop in het DataTable-voorbeeld op de echte stack.
const BOM = '﻿';
const HEADER = 'Naam;Rol';
const ANNA = 'Anna de Vries;Gebruiker';
const BERT = 'Bert Jansen;Beheerder';
const CLARA = 'Clara met een lange voorbeeldnaam voor responsive tabellen;Gebruiker';

async function openExample(page: Page): Promise<Locator> {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system?vak=gegevens');
  const section = page.locator('#example-data-table');
  await expect(section.getByRole('button', { name: 'CSV exporteren' })).toBeVisible();
  return section;
}

async function exportCsv(page: Page, start: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), start()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

function lines(bytes: Buffer): string[] {
  const text = bytes.toString('utf8');
  expect(text.startsWith(BOM)).toBe(true);
  return text.slice(BOM.length).split('\r\n');
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate<number>('(() => document.documentElement.scrollWidth - window.innerWidth)()'),
  ).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('csv-export/AC-8: de export bevat precies de getoonde rijen, ook na "Meer laden"', async ({ page }) => {
  const section = await openExample(page);
  const button = section.getByRole('button', { name: 'CSV exporteren' });
  const first = await exportCsv(page, () => button.click());
  expect(lines(first.bytes)).toStrictEqual([HEADER, ANNA, BERT]);
  await expect(section.getByRole('status').filter({ hasText: 'CSV-bestand aangemaakt.' })).toBeVisible();
  await section.getByRole('button', { name: 'Meer laden' }).click();
  const second = await exportCsv(page, () => button.click());
  expect(lines(second.bytes)).toStrictEqual([HEADER, ANNA, BERT, CLARA]);
});

test('csv-export/AC-10: Enter en Spatie op de gefocuste knop starten de export; de focus blijft op de knop', async ({
  page,
}) => {
  const section = await openExample(page);
  const button = section.getByRole('button', { name: 'CSV exporteren' });
  await button.focus();
  const viaEnter = await exportCsv(page, () => page.keyboard.press('Enter'));
  expect(viaEnter.name).toBe('voorbeeldgegevens.csv');
  await expect(button).toBeFocused();
  const viaSpace = await exportCsv(page, () => page.keyboard.press('Space'));
  expect(viaSpace.name).toBe('voorbeeldgegevens.csv');
  await expect(button).toBeFocused();
});

for (const width of [375, 1280]) {
  test(`csv-export/AC-12: download voorbeeldgegevens.csv met BOM en koprij, axe en geen overflow op ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const section = await openExample(page);
    const result = await exportCsv(page, () => section.getByRole('button', { name: 'CSV exporteren' }).click());
    expect(result.name).toBe('voorbeeldgegevens.csv');
    expect([...result.bytes.subarray(0, 3)]).toStrictEqual([0xef, 0xbb, 0xbf]);
    expect(lines(result.bytes)[0]).toBe(HEADER);
    await section.scrollIntoViewIfNeeded();
    await scanAxe(page);
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await scanAxe(page);
    await expectNoOverflow(page);
  });
}
