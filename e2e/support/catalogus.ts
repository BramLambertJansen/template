import { expect, type Page } from '@playwright/test';

// De tabbladen van /design-system in volgorde (spec designsystem-toolbox). Een sectie buiten het open tabblad is verborgen;
// open eerst het tabblad (of ga direct naar `/design-system?vak=<id>`).
export const VAKKEN = [
  { id: 'basis', label: 'Basis' },
  { id: 'acties', label: 'Acties' },
  { id: 'formulieren', label: 'Formulieren' },
  { id: 'meldingen', label: 'Meldingen en status' },
  { id: 'gegevens', label: 'Gegevens tonen' },
  { id: 'layout', label: 'Navigatie en layout' },
  { id: 'patronen', label: 'Patronen' },
] as const;

export async function openVak(page: Page, label: string): Promise<void> {
  const tab = page
    .getByRole('tablist', { name: 'Onderdelen per soort' })
    .getByRole('tab', { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
