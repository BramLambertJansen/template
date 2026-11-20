import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';
import { scanAxe } from './support/axe.ts';

// Spec ui-weergave-basis: Avatar, Image en StatTile in de catalogus (AC-16 t/m AC-18).
async function openCatalogue(page: Page, path: string, ready: string) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto(path);
  await page.getByRole('region', { name: ready, exact: true }).waitFor();
}

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
}

for (const width of [375, 1280]) {
  test.describe(`Weergave-basis op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ context }) => {
      await context.setExtraHTTPHeaders(clientIpHeaders());
    });

    test('ui-weergave-basis/AC-16/AC-17: index toont varianten en Toon opent Gegevens tonen met focus', async ({
      page,
    }) => {
      await openCatalogue(page, '/design-system', 'Componentenindex');
      const index = page.getByRole('region', { name: 'Componentenindex' });
      const search = index.getByLabel('Component zoeken');
      const variants = [
        ['Avatar', 'size', ['lg', 'md', 'sm']],
        ['Image', 'ratio', ['portrait', 'square', 'video']],
        ['StatTile', '', []],
      ] as const;
      for (const [name, property, values] of variants) {
        await search.fill(name);
        const row = index.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
        await expect(row).toHaveCount(1);
        if (property !== '') {
          const cell = row.getByRole('cell').nth(2);
          await expect(cell).toContainText(`${property}:`);
          for (const value of values) await expect(cell).toContainText(value);
        }
        await index.getByRole('button', { name: `Toon ${name}`, exact: true }).click();
        await expect(page.getByRole('region', { name, exact: true })).toBeFocused();
        await expect(page).toHaveURL(/vak=gegevens/);
        await expect(page.getByRole('tab', { name: 'Gegevens tonen', exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
    });

    test('ui-weergave-basis/AC-18: fallbacks, StatTile-raster, geen overflow en axe in licht en donker', async ({
      page,
    }) => {
      await openCatalogue(page, '/design-system?vak=gegevens', 'StatTile');
      const avatar = page.locator('#example-avatar');
      await expect(avatar.getByRole('img', { name: 'Bert Jansen', exact: true })).toHaveText('BJ');
      const image = page.locator('#example-image');
      await image.scrollIntoViewIfNeeded();
      await expect(image.getByRole('status')).toHaveText('Afbeelding niet beschikbaar.');
      const tiles = page.locator('#example-stat-tile').getByRole('group');
      await expect(tiles).toHaveCount(4);
      await expect(tiles.nth(1)).toContainText('€ 12.345,67');
      const boxes = [];
      for (let i = 0; i < 4; i++) {
        const tile = tiles.nth(i);
        expect(
          await tile.evaluate<number, undefined>('(element) => element.scrollWidth - element.clientWidth', undefined),
        ).toBeLessThanOrEqual(0);
        boxes.push(await tile.boundingBox());
      }
      const lefts = new Set(boxes.map((box) => Math.round(box?.x ?? -1)));
      const tops = new Set(boxes.map((box) => Math.round(box?.y ?? -1)));
      expect(lefts.size).toBe(width === 375 ? 1 : 4);
      expect(tops.size).toBe(width === 375 ? 4 : 1);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      await scanAxe(page);
      await page.getByRole('button', { name: /Donker thema|Licht thema/ }).click();
      await scanAxe(page);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
