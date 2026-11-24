import { useNavigate, useSearch } from '@tanstack/react-router';
import { copy } from '#web/copy/ui.ts';
import { schilKeuze, SCHIL_PATH, type SchilKeuze } from '#web/features/layout/schil-voorbeeld.ts';
import { RadioGroup, Section } from '#web/ui/index.ts';

const STANDAARD: SchilKeuze = { schil: 'sidebar', items: 3 };

// Spec schillen: een schil binnen een schil kan niet (twee main, twee skip-links), dus wisselt de hele pagina van schil.
// De keuze staat in de URL (?schil=topbalk&items=9); AppLayout rendert dan SidebarShell of TopbarShell met
// voorbeeldnavigatie. Zonder schil in de URL staat de gewone navigatie er.
export function SchillenSection() {
  const navigate = useNavigate();
  const search: unknown = useSearch({ strict: false });
  // Zonder schil in de URL is geen keuze gemaakt: de gewone navigatie, geen schil aangevinkt.
  const actief = schilKeuze(SCHIL_PATH, search, true);
  const keuze = actief ?? STANDAARD;
  const kies = (wijziging: Partial<SchilKeuze>) => {
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, ...keuze, ...wijziging }),
    });
  };
  return (
    <Section
      id="example-schillen"
      title="Schillen"
      description="De indeling rondom elke pagina: SidebarShell met navigatie links of TopbarShell met navigatie in de balk. Beide staan op ShellFrame (skip-link, focus, offlinemelding, afdrukken)."
      framed
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <RadioGroup
          label={copy.schillen.schilLabel}
          value={actief?.schil ?? ''}
          options={[
            { value: 'sidebar', label: copy.schillen.sidebar },
            { value: 'topbalk', label: copy.schillen.topbalk },
          ]}
          onValueChange={(value) => {
            kies({ schil: value === 'topbalk' ? 'topbalk' : 'sidebar' });
          }}
        />
        <RadioGroup
          label={copy.schillen.itemsLabel}
          value={String(keuze.items)}
          options={[
            { value: '3', label: copy.schillen.items3 },
            { value: '9', label: copy.schillen.items9 },
          ]}
          onValueChange={(value) => {
            kies({ items: value === '9' ? 9 : 3 });
          }}
        />
      </div>
    </Section>
  );
}
