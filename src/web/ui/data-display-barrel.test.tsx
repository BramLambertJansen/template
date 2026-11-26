import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  DataTable,
  Gallery,
  ListToolbar,
  Tabs,
  type DataTableColumn,
  type GalleryItem,
  type ListToolbarFilter,
  type TabItem,
} from './index.ts';

afterEach(cleanup);

type Row = { readonly id: string; readonly name: string };
const columns: readonly DataTableColumn<Row>[] = [{ id: 'name', header: 'Naam', cell: (row) => row.name }];
const tabs: readonly TabItem[] = [{ id: 'a', label: 'Overzicht', content: 'Inhoud' }];
const images: readonly GalleryItem[] = [{ id: 'a', src: '/land.svg', alt: 'Bergen' }];

// ui-data-display/AC-1
test('componenten en types komen uit de app-barrel en werken zonder optionele props', () => {
  render(
    <DataTable rows={[{ id: 'a', name: 'Anna' }]} getRowId={(row) => row.id} columns={columns} label="Personen" />,
  );
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  render(<Tabs label="Voorbeeld" items={tabs} />);
  expect(screen.getByRole('tab', { name: 'Overzicht' }).getAttribute('aria-selected')).toBe('true');
  render(<Gallery label="Foto’s" items={images} unavailableText="Niet beschikbaar" />);
  expect(screen.getByRole('list', { name: 'Foto’s' })).toBeTruthy();
});

// ui-data-display/AC-1
test('ListToolbar houdt zonder nieuwe opties de bestaande Select-filters en toont geen chips', () => {
  const filter: ListToolbarFilter = {
    id: 'rol',
    label: 'Rol',
    value: '',
    onChange: vi.fn(),
    options: [
      { value: '', label: 'Alle rollen' },
      { value: 'admin', label: 'Beheerder' },
    ],
  };
  render(
    <ListToolbar
      searchLabel="Zoeken"
      query="anna"
      onQueryChange={vi.fn()}
      sortLabel="Sorteren"
      sort="naam"
      sortOptions={[{ value: 'naam', label: 'Naam' }]}
      onSortChange={vi.fn()}
      onClear={vi.fn()}
      filters={[filter]}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Rol' }).tagName).toBe('SELECT');
  expect(screen.queryByRole('list', { name: 'Actieve filters' })).toBeNull();
});
