import { useId, type ReactNode } from 'react';

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

// Een sectie met een h2 als titel en toegankelijke naam (role region), bijvoorbeeld per onderdeel van de catalogus.
// Id via useId: een titel met spaties ("Form, Field en Input") als id leest aria-labelledby als meerdere id's.
export function Section({ title, children }: SectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
