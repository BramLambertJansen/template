import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

// Spec app-thema, deel A: de berekende stijl van elk component in de eerste set, op 375 en 1280 px, licht en donker,
// zonder stijlvariant (AC-1) en met de stijlvariant fixtures/app-thema/semantisch.css (AC-18), tegen de nulmeting van
// main in fixtures/app-thema-baseline.json. AC-2 en AC-5b meten met hun eigen stijlvariant uit fixtures/app-thema/.
// Opnamemodus: ontbreekt de baseline, dan faalt elke test en logt hij zijn deel van de meting op één regel tussen
// APP_THEMA_BASELINE_BEGIN en APP_THEMA_BASELINE_END, in de vorm van het bestand ({ "<breedte>": { "<variant>": … } });
// de vier regels samengevoegd (diep) vormen app-thema-baseline.json.
// Een stijlvariant staat niet in theme.css en is geen inline-stijl (CSP style-src 'self'): de test serveert het bestand
// met page.route op dezelfde origin en laadt het met page.addStyleTag({ url }) (spec, "Stijlvarianten in e2e").

const BASELINE_FILE = path.join(import.meta.dirname, 'fixtures/app-thema-baseline.json');
const VARIANT_DIR = path.join(import.meta.dirname, 'fixtures/app-thema');
const VARIANT_PATH = '/__e2e__/app-thema/';
const variantUrl = (name: string) => `${VARIANT_PATH}${name}.css`;

const PROPS = [
  'border-radius',
  'box-shadow',
  'font-weight',
  'font-family',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'border-top-width',
  'border-bottom-width',
  'text-transform',
  'background-color',
  'color',
] as const;

// standaard = geen stijlvariant; de andere namen zijn een bestand in fixtures/app-thema/.
type Variant = 'standaard' | 'semantisch' | 'button-radius' | 'control-radius' | 'dichtheid';
type Mode = 'licht' | 'donker';
type Styles = Record<string, string>;
type Measurement = Record<Mode, Record<string, Styles>>;

interface Target {
  readonly name: string;
  readonly locate: (page: Page) => Locator;
  readonly extra?: readonly string[];
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const vakTabs = (page: Page) => page.getByRole('tablist', { name: 'Onderdelen per soort' });

const buttons: Target[] = ['primary', 'secondary', 'outline', 'ghost', 'destructive'].map((variant) => ({
  name: `button-${variant}`,
  locate: (page) => region(page, 'Button').getByRole('button', { name: variant, exact: true }),
  extra: ['height', 'min-height'],
}));

const ACTIES: readonly Target[] = [
  ...buttons,
  { name: 'tabs-selected', locate: (page) => vakTabs(page).getByRole('tab', { name: 'Acties', exact: true }) },
  { name: 'tabs-unselected', locate: (page) => vakTabs(page).getByRole('tab', { name: 'Basis', exact: true }) },
];

const FORMULIEREN: readonly Target[] = [
  {
    name: 'control-input',
    locate: (page) => region(page, 'Form, Field en Input').getByRole('textbox', { name: 'E-mailadres', exact: true }),
    extra: ['height', 'min-height'],
  },
  {
    name: 'control-select',
    locate: (page) => region(page, 'Form, Field en Input').getByRole('combobox', { name: 'Rol', exact: true }),
    extra: ['height', 'min-height'],
  },
];

const NOTICES: Target[] = [
  ['info', 'Uitnodiging verstuurd naar anna@example.test.'],
  ['error', 'Er ging iets mis. Probeer het later opnieuw.'],
  ['success', 'Wijzigingen opgeslagen.'],
  ['warning', 'Je sessie verloopt over 5 minuten.'],
].map(([tone = '', text = '']) => ({
  name: `notice-${tone}`,
  locate: (page) => region(page, 'Notice').getByText(text, { exact: true }),
}));

const BADGES: Target[] = [
  ['neutral', 'Uitgenodigd'],
  ['accent', 'Actief'],
  ['destructive', 'Geblokkeerd'],
  ['success', 'Voltooid'],
  ['warning', 'Verloopt binnenkort'],
].map(([tone = '', text = '']) => ({
  name: `badge-${tone}`,
  locate: (page) => region(page, 'StatusBadge').getByText(text, { exact: true }),
}));

const table = (page: Page) => page.getByRole('region', { name: 'Voorbeeldtabel', exact: true });

const GEGEVENS: readonly Target[] = [
  { name: 'table-wrapper', locate: table },
  { name: 'table-header', locate: (page) => table(page).locator('thead') },
  { name: 'table-header-cell', locate: (page) => table(page).getByRole('columnheader', { name: 'Naam', exact: true }) },
  { name: 'table-row', locate: (page) => table(page).getByRole('row').nth(1) },
  { name: 'table-cell', locate: (page) => table(page).getByRole('cell', { name: 'Anna de Vries', exact: true }) },
  {
    name: 'card',
    // Kaarttitel staat in CardHeader, die direct in Card staat.
    locate: (page) =>
      region(page, 'Card').getByRole('heading', { name: 'Kaarttitel', exact: true }).locator('xpath=../..'),
    extra: ['max-width'],
  },
];

function readBaseline(): unknown {
  return existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : undefined;
}

function pick(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([entry]) => entry === key)?.[1];
}

// Draait in de browser. De node-tsconfig van e2e kent geen DOM-types, daarom via Reflect en met `unknown` (zoals
// setText in stappenformulier-lange-titel.spec.ts).
function readStyles(element: unknown, props: readonly string[]): Record<string, string> {
  const read: unknown = Reflect.get(globalThis, 'getComputedStyle');
  if (typeof read !== 'function') throw new Error('getComputedStyle ontbreekt');
  const computed: unknown = Reflect.apply(read, globalThis, [element]);
  if (typeof computed !== 'object' || computed === null) throw new Error('geen berekende stijl');
  const value: unknown = Reflect.get(computed, 'getPropertyValue');
  if (typeof value !== 'function') throw new Error('getPropertyValue ontbreekt');
  return Object.fromEntries(props.map((prop) => [prop, String(Reflect.apply(value, computed, [prop]))]));
}

async function styles(locator: Locator, extra: readonly string[] = []): Promise<Styles> {
  await expect(locator).toBeVisible();
  return locator.evaluate(readStyles, [...PROPS, ...extra]);
}

interface Run {
  readonly page: Page;
  readonly variant: Variant;
  readonly mode: Mode;
}

async function measureAll(page: Page, targets: readonly Target[], into: Record<string, Styles>) {
  for (const target of targets) into[target.name] = await styles(target.locate(page), target.extra);
}

// Serveert elk bestand uit fixtures/app-thema/ op dezelfde origin (CSP style-src 'self').
async function serveVariants(page: Page) {
  await page.route(`**${VARIANT_PATH}*.css`, async (route) => {
    const name = /([\w-]+)\.css$/.exec(new URL(route.request().url()).pathname)?.[1] ?? '';
    await route.fulfill({ path: path.join(VARIANT_DIR, `${name}.css`), contentType: 'text/css' });
  });
}

// Geen hover en geen focus op een gemeten element: de muis naar de hoek, de focus terug naar het document.
async function neutral(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
}

// Opent een tabblad van de catalogus via de URL (geen hover op een tab) en laadt de stijlvariant opnieuw.
async function openVak({ page, variant, mode }: Run, vak: string) {
  await page.goto(`/design-system?vak=${vak}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await expect(vakTabs(page).getByRole('tab', { selected: true })).toBeVisible();
  if (variant !== 'standaard') await page.addStyleTag({ url: variantUrl(variant) });
  if (mode === 'donker') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await neutral(page);
}

async function measureDialogAndToast(run: Run, into: Record<string, Styles>) {
  const { page } = run;
  await region(page, 'Dialog').getByRole('button', { name: 'Dialoog openen', exact: true }).click();
  into['dialog'] = await styles(page.getByRole('dialog', { name: 'Account uitnodigen' }), ['max-width']);
  await page.keyboard.press('Escape');
  await neutral(page);

  await openVak(run, 'meldingen');
  await measureAll(page, [...NOTICES, ...BADGES], into);
  await region(page, 'Toast').getByRole('button', { name: 'Toon succes-toast', exact: true }).click();
  const toast = page.getByRole('status').filter({ hasText: /^Wijziging opgeslagen\.$/ });
  // Vasthouden met de muis: een toast verdwijnt anders vanzelf. Daarom als laatste gemeten; de toast heeft geen hoverstijl.
  await toast.hover();
  into['toast'] = await styles(toast, ['max-width']);
}

async function measureMode(run: Run): Promise<Record<string, Styles>> {
  const result: Record<string, Styles> = {};
  await openVak(run, 'acties');
  await measureAll(run.page, ACTIES, result);
  await measureDialogAndToast(run, result);
  await openVak(run, 'formulieren');
  await measureAll(run.page, FORMULIEREN, result);
  await openVak(run, 'gegevens');
  await measureAll(run.page, GEGEVENS, result);
  return result;
}

async function measure(page: Page, variant: Variant): Promise<Measurement> {
  await serveVariants(page);
  await signIn(page, await createAccount('admin', { totp: true }));
  const licht = await measureMode({ page, variant, mode: 'licht' });
  await page.getByRole('button', { name: 'Donker thema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const donker = await measureMode({ page, variant, mode: 'donker' });
  return { licht, donker };
}

function expectBaseline(width: number, variant: Variant, measurement: Measurement) {
  const baseline = readBaseline();
  if (baseline === undefined) {
    const fragment = JSON.stringify({ [String(width)]: { [variant]: measurement } });
    console.log(`APP_THEMA_BASELINE_BEGIN${fragment}APP_THEMA_BASELINE_END`);
    throw new Error(
      `Opnamemodus: ${path.relative(process.cwd(), BASELINE_FILE)} ontbreekt. De meting (${String(width)} px, ${variant}) ` +
        'staat in de log tussen APP_THEMA_BASELINE_BEGIN en APP_THEMA_BASELINE_END; voeg de vier delen samen tot dat bestand.',
    );
  }
  expect(measurement).toStrictEqual(pick(pick(baseline, String(width)), variant));
}

// AC-2: de baseline zonder variant, met de radius van elke Button-variant vervangen; de rest moet gelijk blijven.
function entriesOf(value: unknown): [string, unknown][] {
  return typeof value === 'object' && value !== null ? Object.entries(value) : [];
}

function withButtonRadius(standaard: unknown, radius: string): Record<string, Record<string, unknown>> {
  const replace = (name: string, value: unknown) =>
    name.startsWith('button-') ? Object.fromEntries([...entriesOf(value), ['border-radius', radius]]) : value;
  return Object.fromEntries(
    entriesOf(standaard).map(([mode, components]) => [
      mode,
      Object.fromEntries(entriesOf(components).map(([name, value]) => [name, replace(name, value)])),
    ]),
  );
}

// Draait in de browser: de soort invoerveld (tag, type of combobox-rol), zonder DOM-types (zie readStyles).
function controlKind(element: unknown): string {
  if (typeof element !== 'object' || element === null) return '';
  const getAttribute: unknown = Reflect.get(element, 'getAttribute');
  if (typeof getAttribute !== 'function') return '';
  const attribute = (name: string) => String(Reflect.apply(getAttribute, element, [name]) ?? '');
  const tag = String(Reflect.get(element, 'tagName')).toLowerCase();
  if (attribute('role') === 'combobox') return 'combobox';
  return tag === 'input' ? `input:${attribute('type')}` : tag;
}

const CONTROLS = 'input[type=text], input[type=email], input[type=password], input[type=date], select, textarea';

async function controlRadii(page: Page): Promise<Record<string, string[]>> {
  const controls = page.getByRole('tabpanel').locator(CONTROLS).filter({ visible: true });
  const result: Record<string, string[]> = {};
  for (const control of await controls.all()) {
    const kind = await control.evaluate(controlKind);
    const radius = (await styles(control))['border-radius'] ?? '';
    result[kind] = [...new Set([...(result[kind] ?? []), radius])];
  }
  return result;
}

// Breedte van de focusring: de grootste spreiding min die van de ring-offset (Tailwind: offset + ring-breedte).
function ringWidth(boxShadow: string): number {
  const spreads = boxShadow
    .split(/,(?![^(]*\))/)
    .map((shadow) => [...shadow.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]))[3] ?? 0)
    .filter((spread) => spread > 0)
    .sort((a, b) => b - a);
  return (spreads[0] ?? 0) - (spreads[1] ?? 0);
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

for (const width of [375, 1280]) {
  test.describe(`app-thema op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('app-thema/AC-1: zonder stijlvariant is de berekende stijl gelijk aan de nulmeting, licht en donker', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      expectBaseline(width, 'standaard', await measure(page, 'standaard'));
    });

    test('app-thema/AC-18: met alleen semantische tokens op :root is de stijl gelijk aan de nulmeting met die variant', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      expectBaseline(width, 'semantisch', await measure(page, 'semantisch'));
    });

    test('app-thema/AC-2: --button-radius geeft elke Button-variant die radius en verandert geen ander component', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const expected = withButtonRadius(pick(pick(readBaseline(), String(width)), 'standaard'), '20px');
      expect(await measure(page, 'button-radius')).toStrictEqual(expected);
    });

    test('app-thema/AC-2: --control-radius geeft Input, Select, Textarea, Combobox, DateInput en PasswordInput dezelfde radius', async ({
      page,
    }) => {
      await serveVariants(page);
      await signIn(page, await createAccount('admin', { totp: true }));
      await openVak({ page, variant: 'control-radius', mode: 'licht' }, 'formulieren');
      const radii = await controlRadii(page);
      expect(Object.keys(radii)).toEqual(
        expect.arrayContaining(['input:email', 'select', 'textarea', 'combobox', 'input:date', 'input:password']),
      );
      expect(Object.values(radii).flat()).toStrictEqual(Object.values(radii).map(() => '14px'));
    });

    test('app-thema/AC-5b: met --density-control 2rem en --density-focus-ring 1px is Button 44 px hoog en de focusring 2 px', async ({
      page,
    }) => {
      await serveVariants(page);
      await signIn(page, await createAccount('admin', { totp: true }));
      await openVak({ page, variant: 'dichtheid', mode: 'licht' }, 'acties');
      const button = region(page, 'Button').getByRole('button', { name: 'primary', exact: true });
      await expect(button).toHaveCSS('height', '44px');
      await expect(button).toHaveCSS('min-height', '44px');
      // Met het toetsenbord erop, zodat :focus-visible geldt.
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      expect(ringWidth((await styles(button))['box-shadow'] ?? '')).toBe(2);
    });
  });
}

// Spec app-thema, deel C: de themakiezer op /design-system (AC-16) en ThemeScope binnen een documentthema (AC-14), met de
// twee meegeleverde thema's uit src/web/styles/theme.css. Strak: --radius 0 (knop, dialoog en toast 0 px), --primary
// zinc; zacht: --radius 0.875rem (knop 12 px, dialoog 14 px) en een eigen --background. Standaard: knop en toast 6 px.
const themeSelect = (page: Page) => page.getByRole('combobox', { name: 'Thema', exact: true });
const primaryButton = (page: Page) => region(page, 'Button').getByRole('button', { name: 'primary', exact: true });

async function openCatalogue(page: Page, vak: string) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto(`/design-system?vak=${vak}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await neutral(page);
}

async function showToast(page: Page): Promise<Locator> {
  await vakTabs(page).getByRole('tab', { name: 'Meldingen en status', exact: true }).click();
  await region(page, 'Toast').getByRole('button', { name: 'Toon succes-toast', exact: true }).click();
  const toast = page.getByRole('status').filter({ hasText: /^Wijziging opgeslagen\.$/ });
  await toast.hover();
  return toast;
}

test('app-thema/AC-16: de kiezer toont Standaard, Strak en Zacht; de voorbeelden wisselen mee, meldingen en <html> niet', async ({
  page,
}) => {
  await openCatalogue(page, 'acties');
  const select = themeSelect(page);
  await expect(select.getByRole('option')).toHaveText(['Standaard', 'Strak', 'Zacht']);
  await expect(primaryButton(page)).toHaveCSS('border-radius', '6px');

  await select.selectOption({ label: 'Strak' });
  await expect(primaryButton(page)).toHaveCSS('border-radius', '0px');
  await select.selectOption({ label: 'Zacht' });
  await expect(primaryButton(page)).toHaveCSS('border-radius', '12px');
  await expect(select).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-app-theme');

  // De toast staat buiten de scope (ToastProvider) en volgt het document: de standaardradius.
  await expect(await showToast(page)).toHaveCSS('border-radius', '6px');

  await select.selectOption({ label: 'Standaard' });
  await expect(primaryButton(page)).toHaveCSS('border-radius', '6px');
  await expect(page.locator('html')).not.toHaveAttribute('data-app-theme');
});

test('app-thema/AC-14: ThemeScope met zacht in een document met strak rekent binnen met zacht en erbuiten met strak', async ({
  page,
}) => {
  // Het documentthema zoals setAppTheme het bewaart; applyStoredTheme zet het bij het laden.
  await page.addInitScript("window.localStorage.setItem('app-thema', 'strak')");
  await openCatalogue(page, 'acties');
  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'strak');
  const select = themeSelect(page);

  // Scope gelijk aan het document: de knop krijgt de --primary van strak.
  await select.selectOption({ label: 'Strak' });
  const strakPrimary = (await styles(primaryButton(page)))['background-color'];
  await select.selectOption({ label: 'Zacht' });

  // Binnen: de radius van zacht; zacht zet --primary niet, dus die erft van strak (het document).
  const inside = await styles(primaryButton(page));
  expect([inside['border-radius'], inside['background-color']]).toStrictEqual(['12px', strakPrimary]);
  // Buiten (de kiezer zelf): de controlradius van strak.
  await expect(select).toHaveCSS('border-radius', '0px');

  // ThemeScope voegt geen box toe.
  await expect(page.locator("[data-app-theme='zacht']")).toHaveCSS('display', 'contents');

  // Een Dialog die binnen de scope opent, rekent ook met zacht.
  await region(page, 'Dialog').getByRole('button', { name: 'Dialoog openen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Account uitnodigen' })).toHaveCSS('border-radius', '14px');
  await page.keyboard.press('Escape');

  // Zacht zet alleen --background; het afgeleide --control-bg rekent daarmee in de scope, de kiezer buiten niet.
  await vakTabs(page).getByRole('tab', { name: 'Formulieren', exact: true }).click();
  const input = region(page, 'Form, Field en Input').getByRole('textbox', { name: 'E-mailadres', exact: true });
  const tokens = await input.evaluate(readStyles, ['--control-bg', '--background', 'background-color']);
  const outside = await select.evaluate(readStyles, ['--control-bg', 'background-color']);
  expect(tokens['--control-bg']).toBe(tokens['--background']);
  expect(tokens['--control-bg']).not.toBe(outside['--control-bg']);
  expect(tokens['background-color']).not.toBe(outside['background-color']);

  // De toast volgt het document (strak), niet de scope.
  await expect(await showToast(page)).toHaveCSS('border-radius', '0px');
});
