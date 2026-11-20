import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { coreErrorTexts } from '../copy/errors.ts';
import { ApiError } from '../lib/api-client.ts';
import { FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';
import { Wizard, wizardStep, type WizardStep } from './wizard.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const personal = z.object({ name: z.string().min(1, 'Vul een naam in.') }).strict();
const address = z.object({ city: z.string().min(2, 'Vul een plaats in.') }).strict();
const review = z.object({ note: z.string().min(1, 'Vul een notitie in.') }).strict();

interface HarnessProps {
  readonly onSubmit?: () => Promise<unknown>;
  readonly count?: number;
  readonly summaries?: boolean;
  readonly submitLabel?: string;
  readonly label?: string;
  readonly codeToField?: boolean;
}

function summary<Name extends string>(name: Name, label: string) {
  return { title: 'Controleer de invoer', fields: [{ name, label }] };
}

function Harness(props: HarnessProps) {
  const { onSubmit = () => Promise.resolve(), count = 3, summaries = true, label = 'Voortgang' } = props;
  const first = useZodForm(personal, { name: '' });
  const second = useZodForm(address, { city: '' });
  const third = useZodForm(review, { note: '' });
  const steps: WizardStep[] = [
    wizardStep({
      id: 'gegevens',
      title: 'Gegevens',
      form: first,
      errorSummary: summaries ? summary('name', 'Naam') : undefined,
      content: (
        <FormField form={first} name="name" label="Naam">
          {(field) => <Input {...field} />}
        </FormField>
      ),
    }),
    wizardStep({
      id: 'adres',
      title: 'Adres',
      form: second,
      errorSummary: summaries ? summary('city', 'Plaats') : undefined,
      content: (
        <FormField form={second} name="city" label="Plaats">
          {(field) => <Input {...field} />}
        </FormField>
      ),
    }),
    wizardStep({
      id: 'controleren',
      title: 'Controleren',
      form: third,
      errorSummary: summaries ? summary('note', 'Notitie') : undefined,
      fieldForCode: props.codeToField === true ? { VALIDATION: 'note' } : undefined,
      content: (
        <FormField form={third} name="note" label="Notitie">
          {(field) => <Input {...field} />}
        </FormField>
      ),
    }),
  ];
  return (
    <>
      <p>Pogingen stap 2: {second.formState.submitCount}</p>
      <Wizard
        label={label}
        steps={steps.slice(0, count)}
        onSubmit={onSubmit}
        {...(props.submitLabel === undefined ? {} : { submitLabel: props.submitLabel })}
      />
    </>
  );
}

function heading(name: string) {
  return screen.getByRole('heading', { name });
}

async function fillAndNext(fieldLabel: string, value: string, scope: Pick<typeof screen, 'getByRole'> = screen) {
  fireEvent.change(scope.getByRole('textbox', { name: fieldLabel }), { target: { value } });
  fireEvent.click(scope.getByRole('button', { name: 'Volgende' }));
  await act(async () => {
    await Promise.resolve();
  });
}

async function toLastStep() {
  await fillAndNext('Naam', 'Anna de Vries');
  await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  await fillAndNext('Plaats', 'Voorbeeldstad');
  return screen.findByRole('heading', { name: 'Stap 3 van 3: Controleren' });
}

async function flushMicrotasks() {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

test('stappenformulier/AC-1 eerste render: kop, benoemde lijst, aria-current alleen op stap 1, geen focusroof', () => {
  render(<Harness />);
  expect(heading('Stap 1 van 3: Gegevens').tagName).toBe('H2');
  const list = screen.getByRole('list', { name: 'Voortgang' });
  expect(list.tagName).toBe('OL');
  const items = within(list).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toStrictEqual(['1Gegevens', '2Adres', '3Controleren']);
  expect(items.map((item) => item.getAttribute('aria-current'))).toStrictEqual(['step', null, null]);
  expect(document.activeElement).toBe(document.body);
});

test('stappenformulier/AC-2 ongeldige stap blijft actief en focust de foutsamenvatting (klik en Enter)', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
  const title = await screen.findByRole('heading', { name: 'Controleer de invoer' });
  await waitFor(() => {
    expect(document.activeElement).toBe(title.parentElement);
  });
  expect(screen.getAllByText('Vul een naam in.').length).toBeGreaterThan(0);
  expect(heading('Stap 1 van 3: Gegevens')).toBeTruthy();
  const name = screen.getByRole('textbox', { name: 'Naam' });
  name.focus();
  fireEvent.submit(name.closest('form') ?? name);
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Controleer de invoer' }).parentElement);
  });
  expect(heading('Stap 1 van 3: Gegevens')).toBeTruthy();
});

test('stappenformulier/AC-2 zonder errorSummary krijgt het eerste ongeldige veld de focus', async () => {
  render(<Harness summaries={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
  await screen.findByText('Vul een naam in.');
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Naam' }));
  });
  expect(heading('Stap 1 van 3: Gegevens')).toBeTruthy();
});

test('stappenformulier/AC-3 geldige stap gaat door, verschuift aria-current en focust de nieuwe stapkop', async () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  render(<Harness onSubmit={onSubmit} />);
  await fillAndNext('Naam', 'Anna de Vries');
  const next = await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  await waitFor(() => {
    expect(document.activeElement).toBe(next);
  });
  const items = within(screen.getByRole('list', { name: 'Voortgang' })).getAllByRole('listitem');
  expect(items.map((item) => item.getAttribute('aria-current'))).toStrictEqual([null, 'step', null]);
  expect(onSubmit).not.toHaveBeenCalled();
});

test('stappenformulier/AC-4 Vorige valideert niet, focust de vorige stapkop en bewaart alle invoer', async () => {
  render(<Harness />);
  await fillAndNext('Naam', 'Anna de Vries');
  await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Plaats' }), { target: { value: 'V' } });
  const previous = screen.getByRole('button', { name: 'Vorige' });
  expect(fireEvent.pointerDown(previous, { button: 0, cancelable: true })).toBe(false);
  fireEvent.click(previous);
  const back = await screen.findByRole('heading', { name: 'Stap 1 van 3: Gegevens' });
  await waitFor(() => {
    expect(document.activeElement).toBe(back);
  });
  expect(screen.getByRole('textbox', { name: 'Naam' })).toHaveProperty('value', 'Anna de Vries');
  expect(screen.getByText('Pogingen stap 2: 0')).toBeTruthy();
  expect(screen.queryByText('Controleer de invoer')).toBeNull();
  await fillAndNext('Naam', 'Anna de Vries');
  await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  expect(screen.getByRole('textbox', { name: 'Plaats' })).toHaveProperty('value', 'V');
});

test('stappenformulier/AC-5 geen Vorige op stap 1; Volgende tussendoor; submitLabel op de laatste stap', async () => {
  render(<Harness submitLabel="Aanmelden" />);
  expect(screen.queryByRole('button', { name: 'Vorige' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Volgende' })).toBeTruthy();
  await toLastStep();
  expect(screen.getByRole('button', { name: 'Aanmelden' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Vorige' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Volgende' })).toBeNull();
});

test('stappenformulier/AC-5 standaard submitLabel is Versturen', async () => {
  render(<Harness />);
  await toLastStep();
  expect(screen.getByRole('button', { name: 'Versturen' })).toBeTruthy();
});

test('stappenformulier/AC-6 verzenden roept onSubmit één keer aan; Bezig… schakelt verzenden en Vorige uit', async () => {
  let finish: (value: unknown) => void = () => undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness onSubmit={onSubmit} />);
  await toLastStep();
  fireEvent.change(screen.getByRole('textbox', { name: 'Notitie' }), { target: { value: 'Klopt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  const busy = await screen.findByRole('button', { name: 'Bezig…' });
  expect(busy).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Vorige' })).toHaveProperty('disabled', true);
  fireEvent.click(busy);
  await flushMicrotasks();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(undefined);
    await Promise.resolve();
  });
  await screen.findByRole('button', { name: 'Versturen' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test('stappenformulier/AC-7 verworpen onSubmit: laatste stap blijft, waarden intact, melding en knop weer bruikbaar', async () => {
  render(<Harness onSubmit={() => Promise.reject(new Error('mislukt'))} />);
  await toLastStep();
  fireEvent.change(screen.getByRole('textbox', { name: 'Notitie' }), { target: { value: 'Klopt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(coreErrorTexts.INTERNAL_ERROR);
  expect(heading('Stap 3 van 3: Controleren')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Versturen' })).toHaveProperty('disabled', false);
  expect(screen.getByRole('textbox', { name: 'Notitie' })).toHaveProperty('value', 'Klopt');
  const hidden = [...document.querySelectorAll('input')].map((input) => input.value);
  expect(hidden).toStrictEqual(['Anna de Vries', 'Voorbeeldstad', 'Klopt']);
});

test('stappenformulier/AC-7 verworpen onSubmit met fieldForCode toont de veldfout op de laatste stap', async () => {
  render(<Harness codeToField onSubmit={() => Promise.reject(new ApiError('VALIDATION', 400))} />);
  await toLastStep();
  fireEvent.change(screen.getByRole('textbox', { name: 'Notitie' }), { target: { value: 'Klopt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Notitie' }).getAttribute('aria-invalid')).toBe('true');
  });
  expect(heading('Stap 3 van 3: Controleren')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Versturen' })).toHaveProperty('disabled', false);
});

test('stappenformulier/AC-8 ongeldige laatste stap verstuurt niet en focust de foutsamenvatting', async () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  render(<Harness onSubmit={onSubmit} />);
  await toLastStep();
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  const title = await screen.findByRole('heading', { name: 'Controleer de invoer' });
  await waitFor(() => {
    expect(document.activeElement).toBe(title.parentElement);
  });
  expect(onSubmit).not.toHaveBeenCalled();
});

function single(id: string, title: string) {
  return { id, title, render: () => <p>{title}</p> };
}

test.each([
  ['een lege lijst', []],
  ['een lege id', [single('', 'Leeg')]],
  ['dubbele ids', [single('a', 'Een'), single('a', 'Twee')]],
])('stappenformulier/AC-9 %s faalt met een assert', (_name, steps) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Wizard label="Voortgang" steps={steps} onSubmit={() => Promise.resolve()} />)).toThrow();
});

test('stappenformulier/AC-10 één stap: kop 1 van 1, geen Vorige, knop submitLabel', () => {
  render(<Harness count={1} />);
  expect(heading('Stap 1 van 1: Gegevens')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Vorige' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Versturen' })).toBeTruthy();
});

test('stappenformulier/AC-11 ingekorte lijst maakt de laatste bestaande stap actief zonder verzenden of focus', async () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  const view = render(<Harness onSubmit={onSubmit} />);
  const last = await toLastStep();
  await waitFor(() => {
    expect(document.activeElement).toBe(last);
  });
  view.rerender(<Harness onSubmit={onSubmit} count={2} />);
  const second = heading('Stap 2 van 2: Adres');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(document.activeElement).not.toBe(second);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Versturen' })).toBeTruthy();
});

test('stappenformulier/AC-12 twee instanties: unieke ids, eigen kop- en lijstverwijzingen, onafhankelijke stappen', async () => {
  render(
    <>
      <div data-testid="a">
        <Harness label="Voortgang A" />
      </div>
      <div data-testid="b">
        <Harness label="Voortgang B" />
      </div>
    </>,
  );
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const [testId, label] of [
    ['a', 'Voortgang A'],
    ['b', 'Voortgang B'],
  ] as const) {
    const root = screen.getByTestId(testId);
    const list = within(root).getByRole('list', { name: label });
    const sections = [...root.querySelectorAll('section')];
    expect(sections).toHaveLength(3);
    for (const section of sections) {
      const title = document.getElementById(section.getAttribute('aria-labelledby') ?? '');
      expect(title !== null && section.contains(title)).toBe(true);
      expect(title?.getAttribute('aria-describedby')).toBe(list.id);
    }
  }
  const a = within(screen.getByTestId('a'));
  const b = within(screen.getByTestId('b'));
  await fillAndNext('Naam', 'Anna de Vries', a);
  await a.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  expect(b.getByRole('heading', { name: 'Stap 1 van 3: Gegevens' })).toBeTruthy();
  expect(b.getAllByRole('listitem')[0]?.getAttribute('aria-current')).toBe('step');
});

test('stappenformulier/AC-13 een eerder geldige stap valideert opnieuw na Vorige', async () => {
  render(<Harness />);
  await fillAndNext('Naam', 'Anna de Vries');
  await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  fireEvent.click(screen.getByRole('button', { name: 'Vorige' }));
  await screen.findByRole('heading', { name: 'Stap 1 van 3: Gegevens' });
  await fillAndNext('Naam', '');
  await screen.findByRole('heading', { name: 'Controleer de invoer' });
  expect(heading('Stap 1 van 3: Gegevens')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Stap 2 van 3: Adres' })).toBeNull();
});

test('stappenformulier/AC-18 terugkeer naar een ongeldige stap: de stapkop houdt de focus na alle timers', async () => {
  vi.useFakeTimers();
  render(<Harness />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Naam' }), { target: { value: 'Anna de Vries' } });
  fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
  await flushMicrotasks();
  act(() => {
    vi.runAllTimers();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
  await flushMicrotasks();
  expect(screen.getByRole('heading', { name: 'Controleer de invoer' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Vorige' }));
  await flushMicrotasks();
  fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
  await flushMicrotasks();
  act(() => {
    vi.runAllTimers();
  });
  const step = heading('Stap 2 van 3: Adres');
  expect(document.activeElement).toBe(step);
  expect(screen.getByRole('heading', { name: 'Controleer de invoer' })).toBeTruthy();
});

test('stappenformulier/AC-19 alle stappen gemount als secties; alleen de actieve zonder hidden', async () => {
  const { container } = render(<Harness />);
  const sections = () => [...container.querySelectorAll('section')];
  expect(sections()).toHaveLength(3);
  for (const section of sections()) {
    const title = document.getElementById(section.getAttribute('aria-labelledby') ?? '');
    expect(title?.tabIndex).toBe(-1);
    expect(title !== null && section.contains(title)).toBe(true);
  }
  expect(sections().map((section) => section.hidden)).toStrictEqual([false, true, true]);
  await fillAndNext('Naam', 'Anna de Vries');
  await screen.findByRole('heading', { name: 'Stap 2 van 3: Adres' });
  expect(sections().map((section) => section.hidden)).toStrictEqual([true, false, true]);
});
