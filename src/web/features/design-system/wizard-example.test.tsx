import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { exampleTarget } from './example-targets.ts';
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

const sources = import.meta.glob<string>('/src/web/features/design-system/wizard-example.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

async function renderExample() {
  const route = createRootRoute({ component: WizardExample });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return within(await screen.findByRole('region', { name: 'Stappenformulier' }));
}

type Scope = Awaited<ReturnType<typeof renderExample>>;

function type(scope: Scope, label: string, value: string) {
  fireEvent.change(scope.getByRole('textbox', { name: label }), { target: { value } });
}

async function next(scope: Scope, heading: string) {
  fireEvent.click(scope.getByRole('button', { name: 'Volgende' }));
  await scope.findByRole('heading', { name: heading });
}

async function fillAll(scope: Scope) {
  type(scope, 'Naam', 'Anna de Vries');
  type(scope, 'E-mailadres', 'anna@example.test');
  await next(scope, 'Stap 2 van 3: Adres');
  type(scope, 'Straat en huisnummer', 'Dorpsstraat 1');
  type(scope, 'Postcode', '1234 AB');
  type(scope, 'Plaats', 'Voorbeeldstad');
  await next(scope, 'Stap 3 van 3: Controleren');
}

async function submit(scope: Scope) {
  fireEvent.click(scope.getByRole('checkbox', { name: 'Ik bevestig dat deze gegevens kloppen.' }));
  fireEvent.click(scope.getByRole('button', { name: 'Versturen' }));
  return scope.findByText('Aanmelding verstuurd. Dit voorbeeld bewaart niets.');
}

test('stappenformulier/AC-14 voorbeeld toont de letterlijke teksten van alle drie de stappen', async () => {
  const scope = await renderExample();
  expect(
    scope.getByText('Meerstaps-invoer met voortgang, validatie per stap en terugbladeren zonder dataverlies.'),
  ).toBeTruthy();
  expect(
    scope.getByText('Vul drie stappen in; Vorige bewaart je invoer. Dit voorbeeld bewaart niets buiten de browser.'),
  ).toBeTruthy();
  expect(scope.getByRole('list', { name: 'Voortgang aanmelding' })).toBeTruthy();
  expect(scope.getByRole('heading', { name: 'Stap 1 van 3: Gegevens', level: 3 })).toBeTruthy();
  fireEvent.click(scope.getByRole('button', { name: 'Volgende' }));
  await scope.findByRole('heading', { name: 'Controleer de invoer' });
  expect(scope.getAllByText('Vul een naam in.').length).toBeGreaterThan(0);
  expect(scope.getAllByText('Vul een geldig e-mailadres in.').length).toBeGreaterThan(0);
  type(scope, 'Naam', 'Anna de Vries');
  type(scope, 'E-mailadres', 'anna@example.test');
  await next(scope, 'Stap 2 van 3: Adres');
  expect(scope.getByText('Bijvoorbeeld 1234 AB.')).toBeTruthy();
  type(scope, 'Postcode', '12');
  fireEvent.click(scope.getByRole('button', { name: 'Volgende' }));
  await scope.findAllByText('Vul een straat en huisnummer in.');
  expect(scope.getAllByText('Vul een geldige postcode in, bijvoorbeeld 1234 AB.').length).toBeGreaterThan(0);
  expect(scope.getAllByText('Vul een plaats in.').length).toBeGreaterThan(0);
  type(scope, 'Straat en huisnummer', 'Dorpsstraat 1');
  type(scope, 'Postcode', '1234 AB');
  type(scope, 'Plaats', 'Voorbeeldstad');
  await next(scope, 'Stap 3 van 3: Controleren');
  for (const term of ['Naam', 'E-mailadres', 'Straat en huisnummer', 'Postcode', 'Plaats']) {
    expect(scope.getByText(term, { selector: 'dt' })).toBeTruthy();
  }
  for (const value of ['Anna de Vries', 'anna@example.test', 'Dorpsstraat 1', '1234 AB', 'Voorbeeldstad']) {
    expect(scope.getByText(value, { selector: 'dd' })).toBeTruthy();
  }
  fireEvent.click(scope.getByRole('button', { name: 'Versturen' }));
  await scope.findAllByText('Bevestig de gegevens om te versturen.');
});

test('stappenformulier/AC-14 voorbeeld importeert alleen uit de app-barrel en is vindbaar in de bronindex', () => {
  const source = Object.values(sources)[0] ?? '';
  const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  expect(imports.length).toBeGreaterThan(0);
  expect(imports.filter((path) => path !== 'react' && path !== 'zod')).toStrictEqual(['#web/ui/index.ts']);
  expect(exampleTarget('Wizard')).toMatchObject({ id: 'example-wizard', vak: 'patronen' });
});

test('stappenformulier/AC-15 gewijzigde invoer: verlaten opent de guard met de vaste teksten', async () => {
  const scope = await renderExample();
  type(scope, 'Naam', 'Anna');
  fireEvent.click(scope.getByRole('link', { name: 'Terug naar accounts' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Pagina verlaten?' });
  expect(within(dialog).getByText('Je hebt onopgeslagen wijzigingen. Bij verlaten gaan deze verloren.')).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Wijzigingen verwerpen en verlaten' })).toBeTruthy();
});

test('stappenformulier/AC-15 zonder wijziging opent de guard niet', async () => {
  const scope = await renderExample();
  fireEvent.click(scope.getByRole('link', { name: 'Terug naar accounts' }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('stappenformulier/AC-15 na een geslaagde verzending opent de guard niet', async () => {
  const scope = await renderExample();
  await fillAll(scope);
  await submit(scope);
  fireEvent.click(scope.getByRole('link', { name: 'Terug naar accounts' }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('stappenformulier/AC-16 succesmelding krijgt focus; Nieuwe aanmelding zet alles leeg terug op stap 1', async () => {
  const scope = await renderExample();
  await fillAll(scope);
  const notice = await submit(scope);
  await waitFor(() => {
    expect(document.activeElement?.contains(notice)).toBe(true);
  });
  expect(document.activeElement).not.toBe(document.body);
  fireEvent.click(scope.getByRole('button', { name: 'Nieuwe aanmelding' }));
  const first = await scope.findByRole('heading', { name: 'Stap 1 van 3: Gegevens' });
  const region = screen.getByRole('region', { name: 'Stappenformulier' });
  const values = [...region.querySelectorAll('input')].map((input) =>
    input.type === 'checkbox' ? String(input.checked) : input.value,
  );
  expect(values).toStrictEqual(['', '', '', '', '', 'false']);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(document.activeElement).not.toBe(first);
  const items = within(scope.getByRole('list', { name: 'Voortgang aanmelding' })).getAllByRole('listitem');
  expect(items[0]?.getAttribute('aria-current')).toBe('step');
});
