import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ToastProvider } from '#core/web/ui/toast.tsx';
import * as ui from '#web/ui/index.ts';
import { DesignSystemPage } from './design-system-page.tsx';
import { exampleTarget } from './example-targets.ts';

afterEach(cleanup);

const USAGE = 'Een tijdstip ten opzichte van nu, met de volledige datum voor schermlezers en als tooltip.';

// Spec relatieve-tijd: de sectie staat in het tabblad Gegevens tonen.
function setup() {
  const route = createRootRoute({ component: DesignSystemPage });
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/?vak=gegevens'] }),
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ToastProvider>,
  );
}

test('relatieve-tijd/AC-9: RelativeTime komt uit de barrel src/web/ui/index.ts', () => {
  expect(typeof ui.RelativeTime).toBe('function');
});

test('relatieve-tijd/AC-10: vindplaats in het tabblad gegevens met de zoekdoeltekst uit de spec', () => {
  expect(exampleTarget('RelativeTime')).toStrictEqual({
    names: ['RelativeTime'],
    id: 'example-relative-time',
    vak: 'gegevens',
    text: 'Bekijk tijdstippen in het verleden en de toekomst; de volledige datum staat in de tooltip.',
  });
});

test('relatieve-tijd/AC-10: de sectie toont de gebruikszin en de negen voorbeeldtermen met hun tekst', async () => {
  setup();
  const region = await screen.findByRole('region', { name: 'RelativeTime' }, { timeout: 2000 });
  const view = within(region);
  expect(region.id).toBe('example-relative-time');
  expect(view.getByText(USAGE)).toBeTruthy();
  const cases: readonly (readonly [string, string])[] = [
    ['Zojuist', 'nu'],
    ['Minuten geleden', '3 minuten geleden'],
    ['Vandaag', '3 uur geleden'],
    ['Gisteren', 'gisteren'],
    ['Vorige week', 'vorige week'],
    ['Maanden geleden', '3 maanden geleden'],
    ['Jaren geleden', '3 jaar geleden'],
    ['Morgen', 'morgen'],
    ['Over 2 weken', 'over 2 weken'],
  ];
  const terms = region.querySelectorAll('dt');
  expect([...terms].map((term) => term.textContent)).toStrictEqual(cases.map(([term]) => term));
  for (const [term, text] of cases) {
    const value = view.getByText(term).nextElementSibling;
    const time = value?.querySelector('time');
    expect(time?.firstChild?.textContent, term).toBe(text);
  }
});
