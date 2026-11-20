import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';
import { Wizard, wizardStep } from './wizard.tsx';

afterEach(cleanup);

const note = z.object({ note: z.string().min(1, 'Vul een notitie in.') }).strict();

function Single({ onSubmit }: { readonly onSubmit: () => Promise<unknown> }) {
  const form = useZodForm(note, { note: '' });
  const steps = [
    wizardStep({
      id: 'controleren',
      title: 'Controleren',
      form,
      content: (
        <FormField form={form} name="note" label="Notitie">
          {(field) => <Input {...field} />}
        </FormField>
      ),
    }),
  ];
  return <Wizard label="Voortgang" steps={steps} onSubmit={onSubmit} />;
}

async function flushMicrotasks() {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

// De verzendknop is tijdens "Bezig…" disabled, maar een submit van het formulier zelf (Enter in een veld, of een
// script) komt daar langs; ook dan mag onSubmit niet nog eens lopen.
test('stappenformulier/AC-6 opnieuw versturen van het formulier tijdens Bezig… roept onSubmit niet nog eens aan', async () => {
  let finish: (value: unknown) => void = () => undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Single onSubmit={onSubmit} />);
  const field = screen.getByRole('textbox', { name: 'Notitie' });
  fireEvent.change(field, { target: { value: 'Klopt' } });
  const form = field.closest('form') ?? field;
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Bezig…' });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await flushMicrotasks();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(undefined);
    await Promise.resolve();
  });
  await screen.findByRole('button', { name: 'Versturen' });
  fireEvent.submit(form);
  await flushMicrotasks();
  expect(onSubmit).toHaveBeenCalledTimes(2);
});
