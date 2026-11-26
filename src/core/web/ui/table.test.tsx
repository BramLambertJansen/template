import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, test } from 'vitest';
import { Table, TableBody, TableCell, TableRow } from './table.tsx';

afterEach(cleanup);

function renderTable(regionRef?: ReturnType<typeof createRef<HTMLDivElement>>) {
  render(
    <Table label="Personen" regionRef={regionRef}>
      <TableBody>
        <TableRow>
          <TableCell>Anna</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

test('regionRef wijst naar de focusbare region-omhulling met naam en focusring', () => {
  const ref = createRef<HTMLDivElement>();
  renderTable(ref);
  const region = screen.getByRole('region', { name: 'Personen' });
  expect(ref.current).toBe(region);
  expect(region.tabIndex).toBe(0);
  expect(region.className).toContain('focus-visible:ring-2');
  ref.current?.focus();
  expect(document.activeElement).toBe(region);
});

test('de tabel zelf heeft geen eigen naam of tabIndex: geen dubbele toegankelijke naam', () => {
  renderTable();
  const table = screen.getByRole('table');
  expect(table.hasAttribute('aria-label')).toBe(false);
  expect(table.hasAttribute('tabindex')).toBe(false);
  expect(screen.queryByRole('table', { name: 'Personen' })).toBeNull();
});
