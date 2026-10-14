import { useState } from 'react';
import { Button, Carousel, Input, Section } from '#web/ui/index.ts';

export function CarouselExamples() {
  const [value, setValue] = useState('landscape');
  const [message, setMessage] = useState('');
  const items = [
    {
      id: 'landscape',
      label: 'Landschap',
      content: <p>Groene bergen met een gele zon. Veeg horizontaal over deze tekst of gebruik de knoppen.</p>,
    },
    {
      id: 'architecture',
      label: 'Architectuur',
      content: (
        <div className="flex flex-col gap-3">
          <Input aria-label="Dia-invoer" />
          <Button
            onClick={() => {
              setMessage('Bekijken');
            }}
          >
            Bekijken
          </Button>
        </div>
      ),
    },
    {
      id: 'detail',
      label: 'Detail',
      content: (
        <p>Een langere beschrijving blijft binnen de dia passen op een smal scherm. Er is geen automatisch afspelen.</p>
      ),
    },
  ];
  return (
    <Section id="example-carousel" title="Carousel">
      <Carousel label="Voorbeeldcarrousel" items={items} />
      <Carousel label="Bestuurde carrousel" items={items} value={value} onValueChange={setValue} />
      <Carousel label="Eén dia" items={items.slice(0, 1)} />
      <Carousel label="Lege carrousel" items={[]} emptyContent="Geen resultaten." />
      <p role="status" aria-label="Dia-actie">
        {message}
      </p>
    </Section>
  );
}
