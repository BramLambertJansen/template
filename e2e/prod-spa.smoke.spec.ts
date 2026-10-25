import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

// Prod-SPA-smoke (ADR 0049): opent de productiebuild uit de image in een echte browser, zonder database en zonder cookie.
// Dan geeft /api/me 401 vóór elke databasequery (src/core/api/auth/auth.ts, getSession zonder sessie), dus elke schermroute
// moet via de guard op het inlogscherm uitkomen. Faalt op elke console.error (ook een route die bij het renderen crasht:
// React meldt dat alleen zo, en de ErrorBoundary toont gewoon een h1), elke ongevangen JS-fout, elke CSP-schending en
// elke mislukte niet-API-request (ontbrekende chunk, asset). Alleen "Failed to load resource" van een /api/-URL is verwacht.
// Draait over http in een intern Docker-netwerk: de CSP (security-headers.ts) heeft geen upgrade-insecure-requests en
// browsers negeren HSTS over http, dus de assets laden gewoon van dezelfde origin.

// Een CSP-schending staat niet altijd als console-melding; dit event wel. Als string: init-scripts vallen buiten de CSP.
const CSP_LUISTERAAR = `document.addEventListener('securitypolicyviolation', (event) => {
  console.error('Content Security Policy-schending: ' + event.violatedDirective + ' ' + event.blockedURI);
});`;

function isApiPath(url: string): boolean {
  return url !== '' && new URL(url).pathname.startsWith('/api/');
}

// De browser meldt een API-antwoord ≥ 400 als console-fout; de bron-URL zit in location, niet betrouwbaar in de tekst.
function isExpectedApiFailure(message: ConsoleMessage): boolean {
  return message.text().startsWith('Failed to load resource') && isApiPath(message.location().url);
}

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedApiFailure(message)) problems.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (!isApiPath(request.url())) problems.push(`requestfailed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isApiPath(response.url())) {
      problems.push(`http ${String(response.status())}: ${response.url()}`);
    }
  });
  return problems;
}

for (const path of ['/', '/admin/accounts']) {
  test(`productie-SPA stuurt ${path} naar het inlogscherm zonder console-fout of CSP-schending`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.addInitScript(CSP_LUISTERAAR);

    await page.goto(path);

    await expect(page).toHaveURL(/\/login(\?.*)?$/, { timeout: 20_000 });
    await expect(page.locator('#root').getByRole('heading', { level: 1, name: 'Inloggen' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });
}
