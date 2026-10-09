import { Bell, Home, LayoutDashboard } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import {
  AppShell,
  Button,
  buttonVariantMap,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CenteredCard,
  Dialog,
  DropdownMenu,
  Form,
  FormField,
  Input,
  useZodForm,
} from '#web/ui/index.ts';

// Catalogus van de basiskit (framework §7), alleen in dev. Elke component met elke variant; de e2e-test draait axe op
// 375 en 1280 px, in licht en donker. De teksten zijn voorbeelden, geen app-teksten.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sectie-${title}`} className="flex flex-col gap-4">
      <h2 id={`sectie-${title}`} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function isVariant(value: string): value is keyof typeof buttonVariantMap.variant {
  return value in buttonVariantMap.variant;
}

const voorbeeld = z.object({
  naam: z.string().min(1, 'Vul een naam in.'),
  email: z.email('Vul een geldig e-mailadres in.'),
});

function FormExample() {
  const form = useZodForm(voorbeeld, { naam: '', email: '' });
  return (
    <Form form={form} onSubmit={() => Promise.resolve()} submitLabel="Versturen">
      <FormField form={form} name="naam" label="Naam">
        {(field) => <Input {...field} autoComplete="name" />}
      </FormField>
      <FormField form={form} name="email" label="E-mailadres" description="We sturen hier een uitnodiging heen.">
        {(field) => <Input {...field} type="email" autoComplete="email" />}
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
        <p className="text-sm">De inhoud van de dialoog.</p>
      </Dialog>
    </>
  );
}

const nav = [
  { label: 'Home', href: '/design-system', permission: 'app.use', icon: Home },
  { label: 'Dashboard', href: '/design-system/dashboard', permission: 'app.use', icon: LayoutDashboard },
] as const;

export function DesignSystemPage() {
  const [dark, setDark] = useState(false);
  const toggleTheme = () => {
    document.documentElement.dataset['theme'] = dark ? 'light' : 'dark';
    setDark(!dark);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Design system</h1>
        <Button variant="outline" onClick={toggleTheme} aria-pressed={dark}>
          Donker thema
        </Button>
      </header>

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

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Kaarttitel</CardTitle>
            <CardDescription>Een korte beschrijving.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Inhoud van de kaart.</p>
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

      <Section title="CenteredCard">
        <div className="overflow-hidden rounded-lg border">
          <CenteredCard title="Inloggen" description="Voorbeeld van een scherm zonder app-layout.">
            <p className="text-sm">Hier staat het formulier.</p>
          </CenteredCard>
        </div>
      </Section>

      <Section title="AppShell">
        <div className="overflow-hidden rounded-lg border">
          <AppShell nav={nav} userName="Anna de Vries" menuItems={[{ label: 'Uitloggen', onSelect: () => undefined }]}>
            <h3 className="text-2xl font-semibold">Home</h3>
          </AppShell>
        </div>
      </Section>
    </div>
  );
}
