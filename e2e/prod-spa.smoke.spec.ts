import { expect, test, type Page } from '@playwright/test';

// Prod-SPA-smoke (ADR 0049): opent de productiebuild uit de image in een echte browser, zonder database. Faalt op elke
// ongevangen JS-fout, elke CSP-schending en elke mislukte niet-API-request (ontbrekende chunk, asset). /api/* geeft
// zonder database een fout; dat is hier verwacht. De SPA moet dan toch renderen: de guard stuurt naar inloggen (401)
// of de ErrorBoundary toont de foutpagina (5xx). Beide zijn de enige h1 van het scherm (page-title.tsx).
// Draait over http in een intern Docker-netwerk: de CSP (security-headers.ts) heeft geen upgrade-insecure-requests en
// browsers negeren HSTS over http, dus de assets laden gewoon van dezelfde origin.

const CSP_MELDING = 'Content Security Policy';
// Een CSP-schending staat niet altijd als console-melding; dit event wel. Als string: init-scripts vallen buiten de CSP.
const CSP_LUISTERAAR = `document.addEventListener('securitypolicyviolation', (event) => {
  console.error('${CSP_MELDING}-schending: ' + event.violatedDirective + ' ' + event.blockedURI);
});`;

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.text().includes(CSP_MELDING)) problems.push(`csp: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (!new URL(request.url()).pathname.startsWith('/api/')) problems.push(`requestfailed: ${request.url()}`);
  });
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() >= 400 && !pathname.startsWith('/api/')) {
      problems.push(`http ${String(response.status())}: ${response.url()}`);
    }
  });
  return problems;
}

for (const path of ['/', '/admin/accounts']) {
  test(`productie-SPA rendert ${path} zonder JS-fout of CSP-schending`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.addInitScript(CSP_LUISTERAAR);

    await page.goto(path);

    const heading = page.locator('#root').getByRole('heading', { level: 1, name: /^(Inloggen|Er ging iets mis)$/ });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    expect(problems).toEqual([]);
  });
}
