import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  Button,
  DescriptionList,
  FormCheckboxField,
  FormField,
  Input,
  NavLink,
  Notice,
  Section,
  UnsavedChangesGuard,
  useZodForm,
  Wizard,
  wizardStep,
} from '#web/ui/index.ts';

const personal = z
  .object({ name: z.string().min(1, 'Vul een naam in.'), email: z.email('Vul een geldig e-mailadres in.') })
  .strict();
const address = z
  .object({
    street: z.string().min(1, 'Vul een straat en huisnummer in.'),
    postcode: z.string().regex(/^\d{4} ?[A-Za-z]{2}$/, 'Vul een geldige postcode in, bijvoorbeeld 1234 AB.'),
    city: z.string().min(1, 'Vul een plaats in.'),
  })
  .strict();
const confirmation = z
  .object({ confirmed: z.boolean().refine((value) => value, 'Bevestig de gegevens om te versturen.') })
  .strict();
const title = 'Controleer de invoer';

function useRegistrationForms() {
  const first = useZodForm(personal, { name: '', email: '' });
  const second = useZodForm(address, { street: '', postcode: '', city: '' });
  const third = useZodForm(confirmation, { confirmed: false });
  const details = first.watch();
  const place = second.watch();
  const steps = [
    wizardStep({
      id: 'gegevens',
      title: 'Gegevens',
      form: first,
      errorSummary: {
        title,
        fields: [
          { name: 'name', label: 'Naam' },
          { name: 'email', label: 'E-mailadres' },
        ],
      },
      content: (
        <>
          <FormField form={first} name="name" label="Naam">
            {(field) => <Input {...field} autoComplete="name" />}
          </FormField>
          <FormField form={first} name="email" label="E-mailadres">
            {(field) => <Input {...field} type="email" autoComplete="email" />}
          </FormField>
        </>
      ),
    }),
    wizardStep({
      id: 'adres',
      title: 'Adres',
      form: second,
      errorSummary: {
        title,
        fields: [
          { name: 'street', label: 'Straat en huisnummer' },
          { name: 'postcode', label: 'Postcode' },
          { name: 'city', label: 'Plaats' },
        ],
      },
      content: (
        <>
          <FormField form={second} name="street" label="Straat en huisnummer">
            {(field) => <Input {...field} autoComplete="street-address" />}
          </FormField>
          <FormField form={second} name="postcode" label="Postcode" description="Bijvoorbeeld 1234 AB.">
            {(field) => <Input {...field} autoComplete="postal-code" />}
          </FormField>
          <FormField form={second} name="city" label="Plaats">
            {(field) => <Input {...field} autoComplete="address-level2" />}
          </FormField>
        </>
      ),
    }),
    wizardStep({
      id: 'controleren',
      title: 'Controleren',
      form: third,
      errorSummary: { title, fields: [{ name: 'confirmed', label: 'Ik bevestig dat deze gegevens kloppen.' }] },
      content: (
        <>
          <DescriptionList
            items={[
              { id: 'name', term: 'Naam', value: details.name },
              { id: 'email', term: 'E-mailadres', value: details.email },
              { id: 'street', term: 'Straat en huisnummer', value: place.street },
              { id: 'postcode', term: 'Postcode', value: place.postcode },
              { id: 'city', term: 'Plaats', value: place.city },
            ]}
          />
          <FormCheckboxField form={third} name="confirmed" label="Ik bevestig dat deze gegevens kloppen." />
        </>
      ),
    }),
  ];
  const forms = [first, second, third] as const;
  return {
    steps,
    dirty: forms.some((form) => form.formState.isDirty),
    busy: third.formState.isSubmitting,
    reset: () => {
      for (const form of forms) form.reset();
    },
  };
}

export function WizardExample() {
  const registration = useRegistrationForms();
  const [sent, setSent] = useState(false);
  const [round, setRound] = useState(0);
  const success = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sent) success.current?.focus();
  }, [sent]);
  return (
    <Section
      id="example-wizard"
      title="Stappenformulier"
      description="Meerstaps-invoer met voortgang, validatie per stap en terugbladeren zonder dataverlies."
      framed
    >
      <p>Vul drie stappen in; Vorige bewaart je invoer. Dit voorbeeld bewaart niets buiten de browser.</p>
      {sent ? (
        <div ref={success} tabIndex={-1} className="flex flex-col items-start gap-4">
          <Notice tone="success">Aanmelding verstuurd. Dit voorbeeld bewaart niets.</Notice>
          <Button
            variant="outline"
            onClick={() => {
              registration.reset();
              setRound((value) => value + 1);
              setSent(false);
            }}
          >
            Nieuwe aanmelding
          </Button>
        </div>
      ) : (
        <Wizard
          key={round}
          label="Voortgang aanmelding"
          headingLevel={3}
          steps={registration.steps}
          onSubmit={() => {
            setSent(true);
            return Promise.resolve();
          }}
        />
      )}
      <NavLink href="/admin/accounts">Terug naar accounts</NavLink>
      <UnsavedChangesGuard
        when={!sent && registration.dirty}
        busy={registration.busy}
        title="Pagina verlaten?"
        description="Je hebt onopgeslagen wijzigingen. Bij verlaten gaan deze verloren."
        discardLabel="Wijzigingen verwerpen en verlaten"
      />
    </Section>
  );
}
