import { expect, test } from '@playwright/test';

test('de startpagina toont de API-status, zonder CSP-schendingen', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });

  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText('API-status: ok');
  expect(violations).toStrictEqual([]);
});
