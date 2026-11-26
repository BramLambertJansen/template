import { useState } from 'react';
import { generateBackupCodesInput } from '#shared/schemas/auth.ts';
import { copy } from '#web/copy/ui.ts';
import { Card, CardContent, Form, FormField, PasswordInput, Section, Text, useZodForm } from '#web/ui/index.ts';
import { BackupCodesList } from './backup-codes-list.tsx';
import { useGenerateBackupCodes } from './queries.ts';

const empty = { huidig: '' };
// Losse constante: Betterleaks (generic-password) leest `WRONG_PASSWORD: '…'` als een geheim (zoals in src/web/copy/errors.ts).
const currentField = 'huidig';

// Spec accountbeheer-uitbreiding, accounts/AC-18 en AC-21 (ADR 0113): nieuwe herstelcodes met het wachtwoord; de server eist
// een mfa-sessie. De nieuwe codes staan alleen in de state van dit component en vervangen het formulier tot "Ik heb ze bewaard".
export function BackupCodesSection() {
  const generate = useGenerateBackupCodes();
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const form = useZodForm(generateBackupCodesInput, empty);
  const submit = async ({ huidig }: { huidig: string }) => {
    const created = await generate.mutateAsync(huidig);
    form.reset(empty);
    setCodes(created);
  };
  const texts = copy.account.backupCodes;
  return (
    <Section title={texts.title}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {codes === null ? (
            <>
              <Text tone="muted">{texts.explanation}</Text>
              <Form
                form={form}
                onSubmit={submit}
                submitLabel={texts.submit}
                fieldForCode={{ WRONG_PASSWORD: currentField }}
              >
                <FormField form={form} name="huidig" label={texts.current}>
                  {(field) => (
                    <PasswordInput
                      {...field}
                      autoComplete="current-password"
                      visibilityLabel={copy.login.visibilityLabel}
                    />
                  )}
                </FormField>
              </Form>
            </>
          ) : (
            <>
              <Text tone="muted">{copy.backupCodes.explanation}</Text>
              <BackupCodesList
                codes={codes}
                onDone={() => {
                  setCodes(null);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
