import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Carousel } from './carousel.tsx';

const items = [
  { id: '__proto__', label: 'Een', content: <input aria-label="Invoer" defaultValue="blijft" /> },
  { id: 'constructor', label: 'Twee', content: <p>Tweede inhoud</p> },
];
const capture = Object.getOwnPropertyDescriptor(Element.prototype, 'setPointerCapture');
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
});
afterAll(() => {
  if (capture === undefined) Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  else Object.defineProperty(Element.prototype, 'setPointerCapture', capture);
});
afterEach(cleanup);

test('navigatie respecteert grenzen, behoudt inhoud en kondigt alleen gebruikerswissels aan', () => {
  render(<Carousel label="Voorbeelden" items={items} />);
  expect(screen.getByRole('status').textContent).toBe('');
  expect(screen.getByRole('button', { name: 'Vorige dia' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Volgende dia' }));
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('2 van 2: Twee');
  expect(screen.getByRole('status').textContent).toBe('2 van 2: Twee');
  expect(screen.getByLabelText('Invoer').closest('[hidden]')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Volgende dia' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Toon dia 1: Een' }));
  expect(screen.getByRole('textbox', { name: 'Invoer' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Toon dia 1: Een' }).getAttribute('aria-current')).toBe('true');
});

test('controlled onbekende waarde heeft herstelcontrol; ouderwijziging herstelt verborgen focus', () => {
  const onValueChange = vi.fn();
  const { rerender } = render(
    <Carousel label="Voorbeelden" items={items} value="missing" onValueChange={onValueChange} />,
  );
  expect(screen.queryByRole('group')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toon dia 1: Een' }));
  expect(onValueChange).toHaveBeenCalledWith('__proto__');
  expect(screen.queryByRole('group')).toBeNull();
  rerender(<Carousel label="Voorbeelden" items={items} value="__proto__" onValueChange={onValueChange} />);
  screen.getByRole('textbox').focus();
  rerender(<Carousel label="Voorbeelden" items={items} value="constructor" onValueChange={onValueChange} />);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Toon dia 2: Twee' }));
});

test('leeg en één item vermijden navigatie, onbekende enkele waarde blijft herstelbaar', () => {
  const { rerender } = render(<Carousel label="Voorbeelden" items={[]} emptyContent="Leeg" />);
  expect(screen.getByText('Leeg')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<Carousel key="single" label="Voorbeelden" items={items.slice(0, 1)} defaultValue="__proto__" />);
  expect(screen.queryByRole('button', { name: 'Vorige dia' })).toBeNull();
  rerender(<Carousel label="Voorbeelden" items={items.slice(0, 1)} value="missing" onValueChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Toon dia 1: Een' })).toBeTruthy();
});

test('ids blijven uniek per instantie en lege/dubbele ids falen', () => {
  const { unmount } = render(
    <>
      <Carousel label="Een" items={items} />
      <Carousel label="Twee" items={items} />
    </>,
  );
  const ids = Array.from(document.querySelectorAll('[id]'), (node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  unmount();
  expect(() => render(<Carousel label="Dubbel" items={[...items.slice(0, 1), ...items.slice(0, 1)]} />)).toThrow();
  expect(() => render(<Carousel label="Leeg" items={[{ id: '', label: 'Leeg', content: null }]} />)).toThrow();
});

function pointer(target: Element, type: string, [x, y]: readonly [number, number]) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    isPrimary: { value: true },
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: y },
  });
  fireEvent(target, event);
}

test('swipe gebruikt horizontale drempel, negeert inputs, verticale beweging en cancel', () => {
  render(<Carousel label="Voorbeelden" items={items} />);
  const input = screen.getByRole('textbox');
  pointer(input, 'pointerdown', [150, 50]);
  pointer(input, 'pointerup', [50, 50]);
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('1 van 2: Een');
  const background = screen.getByRole('group');
  pointer(background, 'pointerdown', [150, 50]);
  pointer(background, 'pointerup', [80, 150]);
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('1 van 2: Een');
  pointer(background, 'pointerdown', [150, 50]);
  pointer(background, 'pointercancel', [50, 50]);
  pointer(background, 'pointerup', [50, 50]);
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('1 van 2: Een');
  pointer(background, 'pointerdown', [150, 50]);
  pointer(background, 'pointerup', [101, 50]);
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('1 van 2: Een');
  pointer(background, 'pointerdown', [150, 50]);
  pointer(background, 'pointerup', [100, 50]);
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('2 van 2: Twee');
});

test('controlled geweigerde wissel kondigt geen onzichtbare dia aan; geaccepteerde wissel wel', () => {
  const onValueChange = vi.fn();
  const { rerender } = render(
    <Carousel label="Voorbeelden" items={items} value="__proto__" onValueChange={onValueChange} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Volgende dia' }));
  expect(onValueChange).toHaveBeenCalledWith('constructor');
  expect(screen.getByRole('group').getAttribute('aria-label')).toBe('1 van 2: Een');
  expect(screen.getByRole('status').textContent).toBe('');
  rerender(<Carousel label="Voorbeelden" items={items} value="constructor" onValueChange={onValueChange} />);
  expect(screen.getByRole('status').textContent).toBe('2 van 2: Twee');
});

test('verwijderde gefocuste dia herstelt naar container zonder actieve waarde', () => {
  const { rerender } = render(<Carousel label="Voorbeelden" items={items} value="__proto__" onValueChange={vi.fn()} />);
  screen.getByRole('textbox').focus();
  rerender(<Carousel label="Voorbeelden" items={items.slice(1)} value="__proto__" onValueChange={vi.fn()} />);
  expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Voorbeelden' }));
  expect(screen.queryByRole('group')).toBeNull();
  expect(screen.getByRole('button', { name: 'Toon dia 1: Twee' })).toBeTruthy();
});
