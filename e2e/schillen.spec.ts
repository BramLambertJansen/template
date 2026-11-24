import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec schillen, deel A, tegen de echte stack: SidebarShell en TopbarShell via de schilwissel op /design-system
// (?schil=topbalk&items=9). Een stijlvariant (schiltokens, tekst op 200 %) staat niet in theme.css en is geen inline-stijl
// (CSP style-src 'self'): de test serveert het bestand met page.route op dezelfde origin en laadt het met
// page.addStyleTag({ url }), zoals e2e/app-thema.spec.ts.

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures/schillen');
const FIXTURE_PATH = '/__e2e__/schillen/';
type Fixture = 'schiltokens' | 'tekst-200';

const NINE = [
  'Schillen',
  'Basis',
  'Acties',
  'Formulieren',
  'Meldingen en status',
  'Tabellen',
  'Kaarten',
  'Navigatie en layout',
  'Patronen',
];

const topNav = (page: Page) => page.getByRole('navigation', { name: 'Hoofdnavigatie' });
const sideNav = (page: Page) => page.locator('aside').getByRole('navigation', { name: 'Hoofdmenu' });
const menuButton = (page: Page) => page.locator('header').getByRole('button', { name: 'Menu openen' });
const more = (page: Page) => topNav(page).getByRole('button', { name: 'Meer' });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

async function signInAsAdmin(page: Page): Promise<void> {
  await page.route(`**${FIXTURE_PATH}*.css`, async (route) => {
    const name = /([\w-]+)\.css$/.exec(new URL(route.request().url()).pathname)?.[1] ?? '';
    await route.fulfill({ path: path.join(FIXTURE_DIR, `${name}.css`), contentType: 'text/css' });
  });
  await signIn(page, await createAccount('admin', { totp: true }));
}

// Laadt de pagina, wacht op de kop, laadt eventueel een stijlvariant en zet muis en focus neutraal.
async function open(page: Page, url: string, fixture?: Fixture): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (fixture !== undefined) await page.addStyleTag({ url: `${FIXTURE_PATH}${fixture}.css` });
  await page.mouse.move(0, 0);
  await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
}

async function noHorizontalScroll(page: Page, context: string): Promise<void> {
  // Als tekst: de e2e-tsconfig kent geen DOM-types.
  const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
  expect(overflow, `horizontaal scrollen: ${context}`).toBeLessThanOrEqual(0);
}

async function height(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.height ?? 0;
}

// Elk zichtbaar item in de balk (links en knoppen) is minstens 44 px hoog.
async function barItemsAtLeast44(page: Page, context: string): Promise<void> {
  const items = page.locator('header').locator('a:visible, button:visible');
  const count = await items.count();
  expect(count, `items in de balk: ${context}`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    expect(await height(items.nth(index)), `${context}: item ${String(index)}`).toBeGreaterThanOrEqual(44);
  }
}

// Draait in de browser. De node-tsconfig van e2e kent geen DOM-types, daarom via Reflect en met `unknown` (zoals
// readStyles in e2e/app-thema.spec.ts).
function readCss(element: unknown, property: string): string {
  const read: unknown = Reflect.get(globalThis, 'getComputedStyle');
  if (typeof read !== 'function') throw new Error('getComputedStyle ontbreekt');
  const computed: unknown = Reflect.apply(read, globalThis, [element]);
  if (typeof computed !== 'object' || computed === null) throw new Error('geen berekende stijl');
  const value: unknown = Reflect.get(computed, 'getPropertyValue');
  if (typeof value !== 'function') throw new Error('getPropertyValue ontbreekt');
  return String(Reflect.apply(value, computed, [property]));
}

async function cssValue(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(readCss, property);
}

test.describe('schillen op 375 px', () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test('schillen/AC-4: TopbarShell toont de menuknop; de sheet heeft alle items en sluit na een klik', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=topbalk&items=9');
    await expect(topNav(page)).toBeHidden();
    await menuButton(page).click();
    const sheet = page.getByRole('dialog', { name: 'Hoofdmenu' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link')).toHaveText(NINE);
    await sheet.getByRole('link', { name: 'Formulieren', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/[?&]vak=formulieren(&|$)/);
    await expect(page).toHaveURL(/[?&]schil=topbalk(&|$)/);
  });
});

for (const width of [375, 1280]) {
  test.describe(`schillen op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('schillen/AC-8: beide schillen, licht en donker: geen horizontale scroll, axe vindt niets, items 44 px', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await signInAsAdmin(page);
      for (const mode of ['licht', 'donker'] as const) {
        for (const schil of ['sidebar', 'topbalk'] as const) {
          const context = `${schil}, ${mode}, ${String(width)} px`;
          await open(page, `/design-system?schil=${schil}&items=9&vak=schillen`);
          if (mode === 'donker') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
          await noHorizontalScroll(page, context);
          await barItemsAtLeast44(page, context);
          await scanAxe(page);
        }
        if (mode === 'licht') {
          await page.getByRole('button', { name: 'Donker thema' }).click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        }
      }
    });
  });
}

test.describe('schillen op 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('schillen/AC-8: met tekst op 200 % toont TopbarShell met negen items de menuknop, zonder horizontale scroll', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=topbalk&items=9', 'tekst-200');
    await expect(menuButton(page)).toBeVisible();
    await expect(topNav(page)).toBeHidden();
    await noHorizontalScroll(page, 'tekst op 200 %');
  });

  test('schillen/AC-6: standaardmaten: sidebar 256 px, balk minstens 56 px, main zonder maximale breedte', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=sidebar&items=3');
    expect((await page.locator('aside').boundingBox())?.width).toBeCloseTo(256, 0);
    expect(await height(page.locator('header'))).toBeGreaterThanOrEqual(56);
    expect(await cssValue(page.getByRole('main'), 'max-width')).toBe('none');
    await open(page, '/design-system?schil=topbalk&items=3');
    expect(await height(page.locator('header'))).toBeGreaterThanOrEqual(56);
    expect(await cssValue(page.getByRole('main'), 'max-width')).toBe('none');
  });

  test('schillen/AC-6: met de schiltokens volgen sidebar, balk en main de berekende maten', async ({ page }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=sidebar&items=3', 'schiltokens');
    expect((await page.locator('aside').boundingBox())?.width).toBeCloseTo(320, 0);
    expect(await height(page.locator('header'))).toBeGreaterThanOrEqual(80);
    expect(await cssValue(page.getByRole('main'), 'max-width')).toBe('640px');
    expect((await page.getByRole('main').boundingBox())?.width).toBeLessThanOrEqual(640);
    await open(page, '/design-system?schil=topbalk&items=3', 'schiltokens');
    expect(await height(page.locator('header'))).toBeGreaterThanOrEqual(80);
    expect(await cssValue(page.getByRole('main'), 'max-width')).toBe('640px');
  });

  test('schillen/AC-9: ?schil=topbalk&items=9 en ?schil=sidebar&items=3; elders verandert schil niets', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=topbalk&items=9');
    await expect(topNav(page).getByRole('link')).toHaveText(NINE.slice(0, 5));
    await more(page).click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(NINE.slice(5));
    await page.keyboard.press('Escape');
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Naar de inhoud' })).toHaveCount(1);
    await scanAxe(page);

    await open(page, '/design-system?schil=sidebar&items=3');
    await expect(sideNav(page).getByRole('link')).toHaveText(NINE.slice(0, 3));
    await expect(topNav(page)).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(1);

    await open(page, '/admin?schil=topbalk&items=9');
    await expect(topNav(page)).toHaveCount(0);
    await expect(sideNav(page).getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('schillen/AC-9: na een klik op een voorbeelditem blijven schil en items staan en is precies dat item actief', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await open(page, '/design-system?schil=topbalk&items=9');
    await topNav(page).getByRole('link', { name: 'Formulieren', exact: true }).click();
    await expect(page).toHaveURL(/[?&]vak=formulieren(&|$)/);
    await expect(page).toHaveURL(/[?&]schil=topbalk(&|$)/);
    await expect(page).toHaveURL(/[?&]items=9(&|$)/);
    await expect(page.locator('a[aria-current="page"]:visible')).toHaveText(['Formulieren']);

    await more(page).click();
    await page.getByRole('menuitem', { name: 'Kaarten', exact: true }).click();
    await expect(page).toHaveURL(/[?&]q=Card(&|$)/);
    await expect(page).toHaveURL(/[?&]schil=topbalk(&|$)/);
    await expect(page.locator('a[aria-current="page"]:visible')).toHaveCount(0);
    await expect(more(page)).toHaveAttribute('data-active', 'true');
    await more(page).click();
    await expect(page.getByRole('menuitem', { name: 'Kaarten', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('menuitem', { name: 'Tabellen', exact: true })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
