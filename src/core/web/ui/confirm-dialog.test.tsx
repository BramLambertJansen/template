import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog.tsx';

// Bevestigen vóór een onomkeerbare actie (roadmap 3f). jsdom kent showModal niet; de stub opent alleen.
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
afterEach(() => {
  cleanup();
});

function renderConfirm(props: { busy?: boolean; destructive?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Account blokkeren?"
      description="Ada kan niet meer inloggen; alle sessies worden beëindigd."
      confirmLabel="Blokkeren"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

test('opent met de focus op Annuleren, niet op de actie', () => {
  renderConfirm();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuleren' }));
  expect(screen.getByRole('dialog', { name: 'Account blokkeren?' })).toBeTruthy();
});

test('Annuleren sluit zonder de actie; de actieknop roept onConfirm aan', () => {
  const { onConfirm, onOpenChange } = renderConfirm();
  fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Blokkeren' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('destructief is standaard rood; destructive={false} is primair', () => {
  renderConfirm();
  expect(screen.getByRole('button', { name: 'Blokkeren' }).className).toContain('bg-destructive');
  cleanup();
  renderConfirm({ destructive: false });
  expect(screen.getByRole('button', { name: 'Blokkeren' }).className).toContain('bg-primary');
});

test('tijdens busy: knoppen uit, "Bezig…", en Esc sluit niet', () => {
  const { onConfirm, onOpenChange } = renderConfirm({ busy: true });
  const confirm = screen.getByRole('button', { name: 'Bezig…' });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Annuleren' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Sluiten' }).hasAttribute('disabled')).toBe(true);
  const cancel = new Event('cancel', { cancelable: true });
  screen.getByRole('dialog').dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
});
