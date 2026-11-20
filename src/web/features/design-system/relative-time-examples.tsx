import { DescriptionList, RelativeTime, Section, type DescriptionItem } from '#web/ui/index.ts';

// Vaste referentietijd, zodat de catalogus altijd dezelfde teksten toont (spec relatieve-tijd).
const NOW = new Date('2026-11-13T10:00:00Z');

const examples: readonly (readonly [string, string])[] = [
  ['Zojuist', '2026-11-13T09:59:30Z'],
  ['Minuten geleden', '2026-11-13T09:57:00Z'],
  ['Vandaag', '2026-11-13T07:00:00Z'],
  ['Gisteren', '2026-11-12T09:00:00Z'],
  ['Vorige week', '2026-11-05T10:00:00Z'],
  ['Maanden geleden', '2026-08-13T10:00:00Z'],
  ['Jaren geleden', '2023-11-13T10:00:00Z'],
  ['Morgen', '2026-11-14T10:00:00Z'],
  ['Over 2 weken', '2026-11-27T10:00:00Z'],
];

const items: readonly DescriptionItem[] = examples.map(([term, iso]) => ({
  id: iso,
  term,
  value: <RelativeTime iso={iso} now={NOW} />,
}));

export function RelativeTimeSection() {
  return (
    <Section
      id="example-relative-time"
      title="RelativeTime"
      description="Een tijdstip ten opzichte van nu, met de volledige datum voor schermlezers en als tooltip."
      framed
    >
      <DescriptionList items={items} />
    </Section>
  );
}
