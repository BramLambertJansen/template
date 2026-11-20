import { format } from '../lib/format.ts';

export interface RelativeTimeProps {
  readonly iso: string;
  // Referentietijdstip; standaard het moment van renderen. Geef het door voor live tekst of een vaste weergave.
  readonly now?: Date;
}

// Statisch bij render (spec relatieve-tijd): geen timer of live-verversing. De volledige datum staat in de tooltip en,
// omdat `title` niet toegankelijk is, als verborgen tekst voor schermlezers. Kleur en typografie erft het van de ouder.
export function RelativeTime({ iso, now = new Date() }: RelativeTimeProps) {
  const full = format.dateTime(iso);
  return (
    <time dateTime={iso} title={full}>
      {format.relative(iso, now)}
      <span className="sr-only"> ({full})</span>
    </time>
  );
}
