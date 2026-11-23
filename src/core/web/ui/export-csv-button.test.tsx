import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { toCsv, type CsvColumn } from './csv.ts';
import { ExportCsvButton } from './export-csv-button.tsx';

interface Person {
  readonly name: string;
  readonly roleLabel: string;
}

const rows: readonly Person[] = [
  { name: 'Anna de Vries', roleLabel: 'Gebruiker' },
  { name: 'Bert Jansen', roleLabel: 'Beheerder' },
];
const columns: readonly CsvColumn<Person>[] = [
  { header: 'Naam', value: (row) => row.name },
  { header: 'Rol', value: (row) => row.roleLabel },
];
const DONE = 'CSV-bestand aangemaakt.';
const FAILED = 'Exporteren is niet gelukt. Probeer het opnieuw.';

interface Clicked {
  readonly download: string;
  readonly href: string;
  readonly connected: boolean;
  readonly element: HTMLAnchorElement;
}

let blobs: Blob[] = [];
let clicks: Clicked[] = [];
const create = vi.fn((blob: Blob) => {
  blobs.push(blob);
  return `blob:test/${String(blobs.length)}`;
});
const revoke = vi.fn();

beforeEach(() => {
  blobs = [];
  clicks = [];
  create.mockClear();
  revoke.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href, connected: this.isConnected, element: this });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function button(name = 'CSV exporteren'): HTMLElement {
  return screen.getByRole('button', { name });
}

test('csv-export/AC-6: één Blob met CSV-type en toCsv-inhoud, één ankerklik, anker weg, URL daarna vrijgegeven', async () => {
  vi.useFakeTimers();
  render(<ExportCsvButton rows={rows} columns={columns} filename="voorbeeldgegevens" />);
  fireEvent.click(button());
  expect(blobs).toHaveLength(1);
  const blob = blobs[0];
  expect(blob?.type).toBe('text/csv;charset=utf-8');
  // Bytes vergelijken: Blob.text() laat de BOM weg.
  const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0));
  expect([...bytes]).toStrictEqual([...new TextEncoder().encode(toCsv(rows, columns))]);
  expect(clicks).toHaveLength(1);
  const click = clicks[0];
  expect(click?.download).toBe('voorbeeldgegevens.csv');
  expect(click?.href).toBe('blob:test/1');
  expect(click?.connected).toBe(true);
  expect(click?.element.isConnected).toBe(false);
  expect(document.querySelector('a[download]')).toBeNull();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test/1');
});

test.each([
  ['rapport', 'rapport.csv'],
  [' rapport.csv ', 'rapport.csv'],
  ['Rapport.CSV', 'Rapport.CSV'],
])('csv-export/AC-7: bestandsnaam %j wordt %j', (filename, expected) => {
  render(<ExportCsvButton rows={rows} columns={columns} filename={filename} />);
  fireEvent.click(button());
  expect(clicks.map((click) => click.download)).toStrictEqual([expected]);
});

test('csv-export/AC-7: lege bestandsnaam, lege kolommen of lege kop gooit tijdens render', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<ExportCsvButton rows={rows} columns={columns} filename="  " />)).toThrow();
  expect(() => render(<ExportCsvButton rows={rows} columns={[]} filename="rapport" />)).toThrow();
  expect(() =>
    render(<ExportCsvButton rows={rows} columns={[{ header: ' ', value: (row) => row.name }]} filename="rapport" />),
  ).toThrow();
  expect(create).not.toHaveBeenCalled();
});

test('csv-export/AC-9: na een geslaagde export staat de status er en is de alert leeg', () => {
  render(<ExportCsvButton rows={rows} columns={columns} filename="rapport" />);
  expect(screen.getByRole('status').textContent).toBe('');
  expect(screen.getByRole('alert').textContent).toBe('');
  fireEvent.click(button());
  expect(screen.getByRole('status').textContent).toBe(DONE);
  expect(screen.getByRole('alert').textContent).toBe('');
});

test('csv-export/AC-9: een gooiende value-functie geeft de alert, geen status en geen ankerklik', () => {
  const failing: readonly CsvColumn<Person>[] = [
    {
      header: 'Naam',
      value: () => {
        throw new Error('kapot');
      },
    },
  ];
  render(<ExportCsvButton rows={rows} columns={failing} filename="rapport" />);
  fireEvent.click(button());
  expect(screen.getByRole('alert').textContent).toBe(FAILED);
  expect(screen.getByRole('status').textContent).toBe('');
  expect(clicks).toHaveLength(0);
});

test('csv-export/AC-9: een falende createObjectURL geeft de alert; de volgende klik vervangt de melding', () => {
  create.mockImplementationOnce(() => {
    throw new Error('geen URL');
  });
  render(<ExportCsvButton rows={rows} columns={columns} filename="rapport" />);
  fireEvent.click(button());
  expect(screen.getByRole('alert').textContent).toBe(FAILED);
  expect(screen.getByRole('status').textContent).toBe('');
  expect(clicks).toHaveLength(0);
  fireEvent.click(button());
  expect(screen.getByRole('alert').textContent).toBe('');
  expect(screen.getByRole('status').textContent).toBe(DONE);
  create.mockImplementationOnce(() => {
    throw new Error('geen URL');
  });
  fireEvent.click(button());
  expect(screen.getByRole('status').textContent).toBe('');
  expect(screen.getByRole('alert').textContent).toBe(FAILED);
});

test('csv-export/AC-9: eigen label, doneLabel en errorLabel vervangen de standaardteksten', () => {
  create.mockImplementationOnce(() => {
    throw new Error('geen URL');
  });
  render(
    <ExportCsvButton
      rows={rows}
      columns={columns}
      filename="rapport"
      label="Download lijst"
      doneLabel="Lijst klaar."
      errorLabel="Lijst mislukt."
    />,
  );
  fireEvent.click(button('Download lijst'));
  expect(screen.getByRole('alert').textContent).toBe('Lijst mislukt.');
  fireEvent.click(button('Download lijst'));
  expect(screen.getByRole('status').textContent).toBe('Lijst klaar.');
});

test('csv-export/AC-10: disabled is native disabled en levert geen Blob of download', () => {
  render(<ExportCsvButton rows={rows} columns={columns} filename="rapport" disabled />);
  const target = button();
  expect(target).toHaveProperty('disabled', true);
  fireEvent.click(target);
  expect(create).not.toHaveBeenCalled();
  expect(clicks).toHaveLength(0);
});

// Enter en Spatie activeren een native knop met een klik; jsdom simuleert die activering niet, de e2e doet het echt.
test('csv-export/AC-10: een native knop van type button, één Tab-stop, en de focus blijft na de export', () => {
  render(<ExportCsvButton rows={rows} columns={columns} filename="rapport" />);
  const target = button();
  expect(target.tagName).toBe('BUTTON');
  expect(target.getAttribute('type')).toBe('button');
  expect(target.tabIndex).toBe(0);
  target.focus();
  fireEvent.click(target);
  expect(clicks).toHaveLength(1);
  expect(document.activeElement).toBe(target);
});
