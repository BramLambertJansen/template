import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Dialog } from './dialog.tsx';
import { Input } from './input.tsx';

// jsdom kent showModal niet; de stub opent de dialoog alleen (focus en modaliteit test de e2e in een echte browser).
const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterAll(() => {
  if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
});

// Spec accountbeheer: een dialoog met een formulier opent met de focus op het eerste veld, niet op de sluitknop.
test('bij openen staat de focus op het eerste veld', () => {
  render(
    <Dialog open onOpenChange={() => undefined} title="Uitnodigen">
      <Input aria-label="Naam" />
      <Input aria-label="E-mailadres" />
    </Dialog>,
  );

  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Naam' }));
});
