import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { WizardExample } from './wizard-example.tsx';

// jsdom mist native dialogmethoden; modaliteit en focusherstel controleert e2e/stappenformulier.spec.ts.
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterAll(() => {
  if (originalShow === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  if (originalClose === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  else Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
});
afterEach(cleanup);

async function renderPending() {
  let finish: (value: unknown) => void = () => undefined;
  const send = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const route = createRootRoute({ component: () => <WizardExample send={send} /> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  const scope = within(await screen.findByRole('region', { name: 'Stappenformulier' }));
  return {
    scope,
    router,
    finish: () => {
      finish(undefined);
    },
  };
}

type Scope = Awaited<ReturnType<typeof renderPending>>['scope'];

function type(scope: Scope, label: string, value: string) {
  fireEvent.change(scope.getByRole('textbox', { name: label }), { target: { value } });
}

async function next(scope: Scope, heading: string) {
  fireEvent.click(scope.getByRole('button', { name: 'Volgende' }));
  await scope.findByRole('heading', { name: heading });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

test('stappenformulier/AC-15 tijdens Bezig… blokkeert de guard verlaten; na de verzending mag het weer', async () => {
  const { scope, router, finish } = await renderPending();
  type(scope, 'Naam', 'Anna de Vries');
  type(scope, 'E-mailadres', 'anna@example.test');
  await next(scope, 'Stap 2 van 3: Adres');
  type(scope, 'Straat en huisnummer', 'Dorpsstraat 1');
  type(scope, 'Postcode', '1234 AB');
  type(scope, 'Plaats', 'Voorbeeldstad');
  await next(scope, 'Stap 3 van 3: Controleren');
  fireEvent.click(scope.getByRole('checkbox', { name: 'Ik bevestig dat deze gegevens kloppen.' }));
  fireEvent.click(scope.getByRole('button', { name: 'Versturen' }));
  await scope.findByRole('button', { name: 'Bezig…' });

  fireEvent.click(scope.getByRole('link', { name: 'Terug naar accounts' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Pagina verlaten?' });
  expect(within(dialog).queryByRole('button', { name: 'Wijzigingen verwerpen en verlaten' })).toBeNull();
  expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toHaveProperty('disabled', true);
  const confirm = within(dialog).getByRole('button', { name: 'Bezig…' });
  expect(confirm.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(confirm);
  await settle();
  expect(router.state.location.pathname).toBe('/');

  await act(async () => {
    finish();
    await Promise.resolve();
  });
  await scope.findByText('Aanmelding verstuurd. Dit voorbeeld bewaart niets.');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  expect(router.state.location.pathname).toBe('/');
  fireEvent.click(scope.getByRole('link', { name: 'Terug naar accounts' }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/admin/accounts');
  });
});
