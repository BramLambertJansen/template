import { useState } from 'react';
import { z } from 'zod';
import {
  Button,
  Checkbox,
  Form,
  FormCheckboxField,
  FormField,
  FormRadioGroupField,
  RadioGroup,
  Section,
  Textarea,
  useZodForm,
} from '#web/ui/index.ts';

const schema = z
  .object({ naam: z.string().min(1, 'Vul een naam in.'), meldingen: z.boolean(), rol: z.enum(['user', 'admin']) })
  .strict();
const roles = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];

function FormControlsExample() {
  const form = useZodForm(schema, { naam: '', meldingen: false, rol: 'user' });
  const [sent, setSent] = useState<z.output<typeof schema> | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Form
        form={form}
        submitLabel="Versturen"
        onSubmit={(values) => {
          setSent(values);
          return Promise.resolve();
        }}
        secondaryAction={
          <Button
            variant="outline"
            onClick={() => {
              form.reset();
              setSent(null);
            }}
          >
            Annuleren
          </Button>
        }
      >
        <FormField form={form} name="naam" label="Naam" description="Naam">
          {(field) => <Textarea {...field} />}
        </FormField>
        <FormCheckboxField form={form} name="meldingen" label="Meldingen" description="Meldingen" />
        <FormRadioGroupField form={form} name="rol" label="Rol" options={roles} description="Rol" />
      </Form>
      {sent === null ? null : <output>{JSON.stringify(sent)}</output>}
    </div>
  );
}

function DisabledControlsExample() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Textarea aria-label="Naam" value="Naam" disabled />
      <Checkbox label="Meldingen" defaultChecked disabled />
      <RadioGroup label="Rol" value="admin" options={roles} disabled onValueChange={() => undefined} />
    </div>
  );
}

function InvalidControlsExample() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Textarea aria-label="Naam" aria-invalid aria-describedby="textarea-example-error" defaultValue="" />
      <p id="textarea-example-error">Vul een naam in.</p>
      <Checkbox label="Meldingen" aria-invalid aria-describedby="checkbox-example-error" />
      <p id="checkbox-example-error">Vul een naam in.</p>
      <RadioGroup label="Rol" value="" options={roles} error="Vul een naam in." onValueChange={() => undefined} />
    </div>
  );
}

export function UiBasicsExamples() {
  return (
    <>
      <Section title="Textarea, Checkbox en RadioGroup">
        <FormControlsExample />
      </Section>
      <Section title="Invoervelden: disabled">
        <DisabledControlsExample />
      </Section>
      <Section title="Invoervelden: invalid">
        <InvalidControlsExample />
      </Section>
    </>
  );
}
