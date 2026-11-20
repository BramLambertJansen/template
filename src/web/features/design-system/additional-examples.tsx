import { useState } from 'react';
import { ApiError } from '#core/web/lib/api-client.ts';
import { ForbiddenError } from '#core/web/lib/guard.ts';
import { AsyncStatesExample } from './async-states-example.tsx';
import { CenteredCard, ErrorReference, NotFound, RouteError, Section } from '#web/ui/index.ts';

// Fictieve requestId: alleen voorbeelddata (R-WEB-08), zoals de server hem geeft (spec foutreferentie).
const exampleReferenceError = new ApiError('INTERNAL_ERROR', 500, '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64');

function ErrorExamples() {
  const [retried, setRetried] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <RouteError
        preview
        error={new Error('Voorbeeld')}
        reset={() => {
          setRetried(true);
        }}
      />
      {retried ? <p role="status">Opnieuw geprobeerd (voorbeeld).</p> : null}
      <RouteError preview error={new ForbiddenError()} reset={() => undefined} />
      <NotFound preview />
    </div>
  );
}

// Eigen sectie: CopyButton rendert altijd een (lege) status, die hoort niet in de regio "RouteError en NotFound".
function ErrorReferenceExamples() {
  return (
    <div className="flex flex-col gap-4">
      <RouteError preview error={exampleReferenceError} reset={() => undefined} />
      <ErrorReference error={exampleReferenceError} />
    </div>
  );
}

export function CenteredCardSection() {
  return (
    <Section
      id="example-centered"
      title="CenteredCard"
      description="Een scherm zonder app-layout, zoals inloggen."
      framed
    >
      <CenteredCard preview title="Inloggen" description="Een voorbeeld van een scherm zonder app-layout.">
        <p>De inhoud van de kaart.</p>
      </CenteredCard>
    </Section>
  );
}

export function AsyncAndErrorSections() {
  return (
    <>
      <Section
        id="example-async"
        title="AsyncView"
        description="Laden, fout, leeg en resultaat op één manier tonen."
        framed
      >
        <AsyncStatesExample />
      </Section>
      <Section
        id="example-errors"
        title="RouteError en NotFound"
        description="Foutschermen: iets ging mis, geen toegang, niet gevonden."
        framed
      >
        <ErrorExamples />
      </Section>
      <Section
        id="example-error-reference"
        title="ErrorReference"
        description="Een serverfout met referentie die de gebruiker kan kopiëren voor support."
        framed
      >
        <ErrorReferenceExamples />
      </Section>
    </>
  );
}
