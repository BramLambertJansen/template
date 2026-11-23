import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import * as ui from '#web/ui/index.ts';
import { DataDisplayExamples } from './data-display-examples.tsx';
import { exampleTarget } from './example-targets.ts';

afterEach(cleanup);

test('csv-export/AC-11: ExportCsvButton en toCsv komen uit de barrel src/web/ui/index.ts', () => {
  expect(typeof ui.ExportCsvButton).toBe('function');
  expect(ui.toCsv([], [{ header: 'Naam', value: (row: string) => row }])).toBe('﻿Naam');
  // Typen bestaan alleen bij compileren: deze toewijzingen falen in typecheck als de barrel ze niet exporteert.
  const column: ui.CsvColumn<string> = { header: 'Naam', value: (row) => row };
  const props: ui.ExportCsvButtonProps<string> = { rows: [], columns: [column], filename: 'leeg' };
  expect(props.columns).toStrictEqual([column]);
});

test('csv-export/AC-11: het voorbeeld staat binnen #example-data-table, vóór de tabel', () => {
  expect(exampleTarget('ExportCsvButton')).toStrictEqual({
    names: ['DataTable', 'DataTableHeading', 'ExportCsvButton'],
    id: 'example-data-table',
    vak: 'gegevens',
    text: 'Zoek, filter, sorteer, selecteer en laad lokale rijen; exporteer de getoonde rijen als CSV.',
  });
  const { container } = render(<DataDisplayExamples />);
  const section = container.querySelector('#example-data-table');
  if (!(section instanceof HTMLElement)) throw new Error('#example-data-table ontbreekt');
  const button = within(section).getByRole('button', { name: 'CSV exporteren' });
  const table = within(section).getByRole('region', { name: 'Voorbeeldgegevens' });
  expect(button.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
