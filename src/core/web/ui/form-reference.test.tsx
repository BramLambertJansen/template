import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { ErrorTextsProvider } from './error-texts.tsx';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';

afterEach(cleanup);

const id = '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64';
const other = 'b7e1d2c3-4a5f-4b6c-8d7e-9f0a1b2c3d4e';
const schema = z.object({ name: z.string() }).strict();

function Example({ submit }: { readonly submit: () => Promise<unknown> }) {
  const form = useZodForm(schema, { name: 'Ada' });
  return (
    <Form form={form} onSubmit={submit} submitLabel="Opslaan" fieldForCode={{ ALREADY_EXISTS: 'name' }}>
      <FormField form={form} name="name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
    </Form>
  );
}

function show(submit: () => Promise<unknown>) {
  render(
    <ErrorTextsProvider texts={{ INTERNAL_ERROR: 'Er ging iets mis.', ALREADY_EXISTS: 'Bestaat al.' }}>
      <Example submit={submit} />
    </ErrorTextsProvider>,
  );
}

function reference(value: string) {
  return screen.queryByText((_, element) => element?.tagName === 'P' && element.textContent === `Referentie: ${value}`);
}

// De eerstvolgende focusbare knop of het eerstvolgende veld na `from` in documentvolgorde (wat Tab doet).
function nextFocusable(from: Element): Element | undefined {
  const focusable = [...document.querySelectorAll('button:not([disabled]), input:not([disabled])')];
  return focusable.find((element) => (from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
}

describe('Form: foutreferentie', () => {
  test('foutreferentie/AC-12: de melding krijgt focus, de referentie staat erna en Tab gaat naar de kopieerknop', async () => {
    show(() => Promise.reject(new ApiError('INTERNAL_ERROR', 500, id)));
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

    const alert = await screen.findByText('Er ging iets mis.');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
    const text = reference(id);
    expect(text).not.toBeNull();
    expect(alert.contains(text)).toBe(false);
    expect(alert.nextElementSibling?.contains(text)).toBe(true);
    expect(nextFocusable(alert)).toBe(screen.getByRole('button', { name: 'Referentie kopiëren' }));
  });

  test('foutreferentie/AC-13: een fout die naar een veld gaat, toont nergens een referentie', async () => {
    show(() => Promise.reject(new ApiError('ALREADY_EXISTS', 500, id)));
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

    await screen.findByText('Bestaat al.');
    expect(document.body.textContent).not.toContain('Referentie');
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
  });

  test('foutreferentie/AC-14: opnieuw verzenden met succes wist melding en referentie', async () => {
    let calls = 0;
    show(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new ApiError('INTERNAL_ERROR', 500, id)) : Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await screen.findByText('Er ging iets mis.');

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => {
      expect(screen.queryByText('Er ging iets mis.')).toBeNull();
    });
    expect(reference(id)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
  });

  test('foutreferentie/AC-14: opnieuw falen met een andere id toont alleen de nieuwe id', async () => {
    let calls = 0;
    show(() => {
      calls += 1;
      return Promise.reject(new ApiError('INTERNAL_ERROR', 500, calls === 1 ? id : other));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => {
      expect(reference(id)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => {
      expect(reference(other)).not.toBeNull();
    });
    expect(reference(id)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Referentie kopiëren' })).toHaveLength(1);
  });
});
