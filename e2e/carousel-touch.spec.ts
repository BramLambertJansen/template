import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

test.use({ viewport: { width: 375, height: 900 }, hasTouch: true });

test('AC-7: een swipe laat invoer en een daaropvolgende tik op een dia-actie werken', async ({ page, context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  const carousel = page.getByRole('region', { name: 'Voorbeeldcarrousel', exact: true });
  await carousel.waitFor();
  await page.evaluate(`(() => {
    const events = [];
    window.carouselTouchEvents = events;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture',
      'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout']) {
      document.addEventListener(type, event => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('[aria-label="Voorbeeldcarrousel"]') === null) return;
        events.push({ type, tag: target.tagName, id: target.id, text: target.textContent.slice(0, 80),
          pointerId: event.pointerId, primary: event.isPrimary, button: event.button,
          captured: event.pointerId === undefined ? false : target.hasPointerCapture(event.pointerId) });
      }, true);
    }
  })()`);
  try {
    const slide = carousel.getByRole('group', { name: '1 van 3: Landschap', exact: true });
    await slide.scrollIntoViewIfNeeded();
    const box = await slide.boundingBox();
    if (box === null) throw new Error('De eerste dia moet zichtbaar zijn');
    const x = box.x + Math.min(box.width - 10, 220);
    const y = box.y + box.height / 2;
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    await carousel.getByRole('textbox', { name: 'Dia-invoer' }).fill('Blijft');
    await carousel.getByRole('button', { name: 'Bekijken', exact: true }).tap();
    await expect(page.getByRole('status', { name: 'Dia-actie' })).toHaveText('Bekijken');
    await expect(carousel.getByRole('textbox', { name: 'Dia-invoer' })).toHaveValue('Blijft');
  } finally {
    const path = test.info().outputPath('carousel-touch-events.json');
    await writeFile(path, JSON.stringify(await page.evaluate<unknown>('window.carouselTouchEvents')));
    await test.info().attach('carousel-touch-events', {
      path,
      contentType: 'application/json',
    });
  }
});
