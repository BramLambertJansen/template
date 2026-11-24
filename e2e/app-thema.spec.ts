import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

// Spec app-thema, deel A: de berekende stijl van elk component in de eerste set, op 375 en 1280 px, licht en donker,
// zonder stijlvariant (AC-1) en met de stijlvariant fixtures/app-thema/semantisch.css (AC-18), tegen de nulmeting van
// main in fixtures/app-thema-baseline.json.
// Opnamemodus: ontbreekt de baseline, dan faalt elke test en logt hij zijn deel van de meting op één regel tussen
// APP_THEMA_BASELINE_BEGIN en APP_THEMA_BASELINE_END, in de vorm van het bestand ({ "<breedte>": { "<variant>": … } });
// de vier regels samengevoegd (diep) vormen app-thema-baseline.json.
// Een stijlvariant staat niet in theme.css en is geen inline-stijl (CSP style-src 'self'): de test serveert het bestand
// met page.route op dezelfde origin en laadt het met page.addStyleTag({ url }) (spec, "Stijlvarianten in e2e").

const BASELINE_FILE = path.join(import.meta.dirname, 'fixtures/app-thema-baseline.json');
const VARIANT_URL = '/__e2e__/app-thema/semantisch.css';
const VARIANT_FILE = path.join(import.meta.dirname, 'fixtures/app-thema/semantisch.css');

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

type Variant = 'standaard' | 'semantisch';
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

// Opent een tabblad van de catalogus via de URL (geen hover op een tab) en laadt de stijlvariant opnieuw.
async function openVak({ page, variant, mode }: Run, vak: string) {
  await page.goto(`/design-system?vak=${vak}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await expect(vakTabs(page).getByRole('tab', { selected: true })).toBeVisible();
  if (variant === 'semantisch') await page.addStyleTag({ url: VARIANT_URL });
  if (mode === 'donker') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

async function measureDialogAndToast(run: Run, into: Record<string, Styles>) {
  const { page } = run;
  await region(page, 'Dialog').getByRole('button', { name: 'Dialoog openen', exact: true }).click();
  into['dialog'] = await styles(page.getByRole('dialog', { name: 'Account uitnodigen' }), ['max-width']);
  await page.keyboard.press('Escape');

  await openVak(run, 'meldingen');
  await measureAll(page, [...NOTICES, ...BADGES], into);
  await region(page, 'Toast').getByRole('button', { name: 'Toon succes-toast', exact: true }).click();
  const toast = page.getByRole('status').filter({ hasText: /^Wijziging opgeslagen\.$/ });
  // Vasthouden met de muis: een toast verdwijnt anders vanzelf.
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
  if (variant === 'semantisch')
    await page.route(`**${VARIANT_URL}`, (route) => route.fulfill({ path: VARIANT_FILE, contentType: 'text/css' }));
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
  });
}
