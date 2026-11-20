import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

// Spec stappenformulier AC-17: een lange staptitel wrapt in de voortgangslijst en de stapkop, zonder pagina-overflow.
// Het voorbeeld heeft korte titels; de test zet daarom in de echte browser een lange titel in de gerenderde lijst en kop.
// Eén woord breder dan het scherm (break-words) plus gewone woorden (wrappen op spaties).
const longTitle = `${'Aanmeldingsgegevenscontroleoverzicht'.repeat(2)} met een lange toelichting`;

// Draait in de browser; e2e kent geen DOM-types, dus het element komt binnen als unknown.
function setText(element: unknown, text: string) {
  if (typeof element === 'object' && element !== null && 'textContent' in element) element.textContent = text;
}

test('stappenformulier/AC-17 lange staptitel wrapt zonder overflow op 375 px', async ({ page, context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
  await page.setViewportSize({ width: 375, height: 900 });
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system?vak=patronen');
  const wizard = page.getByRole('region', { name: 'Stappenformulier' });
  const heading = wizard.getByRole('heading', { name: 'Stap 1 van 3: Gegevens' });
  await expect(heading).toBeVisible();
  const title = wizard.getByRole('list', { name: 'Voortgang aanmelding' }).getByText('Gegevens', { exact: true });
  // De locators zoeken op tekst en vinden het element na de tekstwijziging niet meer; daarom handles vooraf.
  const titleHandle = await title.elementHandle();
  const headingHandle = await heading.elementHandle();
  const before = await titleHandle.boundingBox();
  await titleHandle.evaluate(setText, longTitle);
  await headingHandle.evaluate(setText, `Stap 1 van 3: ${longTitle}`);
  const after = await titleHandle.boundingBox();
  const head = await headingHandle.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(head).not.toBeNull();
  if (before === null || after === null || head === null) return;
  expect(after.height).toBeGreaterThan(before.height);
  expect(after.x + after.width).toBeLessThanOrEqual(375);
  expect(head.x + head.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
    0,
  );
});
