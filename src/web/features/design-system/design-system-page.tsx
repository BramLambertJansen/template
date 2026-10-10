import { Bell } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '#web/copy/ui.ts';
import {
  Button,
  buttonVariantMap,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DropdownMenu,
  Form,
  FormField,
  Input,
  Notice,
  PageHeader,
  QrCode,
  Section,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useZodForm,
} from '#web/ui/index.ts';

// Catalogus van de basiskit (framework §7, spec design-system), ook in productie achter guard('design-system:read'). Elke
// component met elke variant; de e2e-test draait axe op 375 en 1280 px, in licht en donker. De teksten zijn voorbeelden, geen
// app-teksten. Alleen voorbeelddata en geen API-aanroepen: de chunk is statisch en voor iedereen te downloaden (AC-10).
// AppShell, CenteredCard en ThemeToggle staan er niet los in: de eerste twee zijn een heel scherm met een eigen main, de
// themaschakelaar staat al in de topbalk (uitzonderingen in scripts/kit/catalogus.mjs).

function isVariant(value: string): value is keyof typeof buttonVariantMap.variant {
  return value in buttonVariantMap.variant;
}

const voorbeeld = z.object({
  naam: z.string().min(1, 'Vul een naam in.'),
  email: z.email('Vul een geldig e-mailadres in.'),
  rol: z.enum(['user', 'admin']),
});

function FormExample() {
  const form = useZodForm(voorbeeld, { naam: '', email: '', rol: 'user' });
  return (
    <Form form={form} onSubmit={() => Promise.resolve()} submitLabel="Versturen">
      <FormField form={form} name="naam" label="Naam">
        {(field) => <Input {...field} autoComplete="name" />}
      </FormField>
      <FormField form={form} name="email" label="E-mailadres" description="We sturen hier een uitnodiging heen.">
        {(field) => <Input {...field} type="email" autoComplete="email" />}
      </FormField>
      <FormField form={form} name="rol" label="Rol">
        {(field) => (
          <Select
            {...field}
            options={[
              { value: 'user', label: 'Gebruiker' },
              { value: 'admin', label: 'Beheerder' },
            ]}
          />
        )}
      </FormField>
    </Form>
  );
}

function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Dialoog openen
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Account uitnodigen"
        description="Een voorbeeld van een dialoog met knoppen."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Annuleren
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              Bevestigen
            </Button>
          </>
        }
      >
        <p>De inhoud van de dialoog.</p>
      </Dialog>
    </>
  );
}

export function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={copy.designSystem.title} />

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          {Object.keys(buttonVariantMap.variant)
            .filter(isVariant)
            .map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          <Button disabled>Uitgeschakeld</Button>
          <Button size="icon" variant="outline" aria-label="Meldingen">
            <Bell aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section title="Form, Field en Input">
        <div className="max-w-sm">
          <FormExample />
        </div>
      </Section>

      <Section title="PageHeader en Notice">
        <PageHeader title="Accounts" documentTitle={false} actions={<Button>Account uitnodigen</Button>} />
        <Notice>Uitnodiging verstuurd naar anna@example.test.</Notice>
        <Notice tone="error">Er ging iets mis. Probeer het later opnieuw.</Notice>
      </Section>

      <Section title="Table">
        <Table label="Voorbeeldtabel">
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>E-mailadres</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Anna de Vries</TableCell>
              <TableCell>anna@example.test</TableCell>
              <TableCell>Beheerder</TableCell>
              <TableCell>Actief</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Bert Jansen</TableCell>
              <TableCell>bert@example.test</TableCell>
              <TableCell>Gebruiker</TableCell>
              <TableCell>Uitgenodigd</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="QrCode">
        <QrCode value="otpauth://totp/voorbeeld?secret=JBSWY3DPEHPK3PXP" label="Voorbeeld-QR-code" />
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Kaarttitel</CardTitle>
            <CardDescription>Een korte beschrijving.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Inhoud van de kaart.</p>
          </CardContent>
          <CardFooter>
            <Button variant="secondary">Actie</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Dialog">
        <DialogExample />
      </Section>

      <Section title="DropdownMenu">
        <DropdownMenu
          align="start"
          trigger={<Button variant="outline">Menu openen</Button>}
          items={[
            { label: 'Profiel', onSelect: () => undefined },
            { label: 'Uitloggen', onSelect: () => undefined },
          ]}
        />
      </Section>
    </div>
  );
}
