import { useNavigate } from '@tanstack/react-router';
import { newPasswordInput } from '#shared/schemas/auth.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { copy } from '#web/copy/ui.ts';
import { auth } from '#web/lib/auth.ts';
import { CenteredCard, Form, FormField, Input, Notice, useZodForm } from '#web/ui/index.ts';

// Uitnodiging accepteren (spec accounts/AC-6): wachtwoord instellen met het token uit de mail, daarna naar /login met de
// bevestiging. Verlopen, gebruikt of onbekend token: één melding (INVITATION_INVALID). Via een resetlink (soort 'reset', spec
// accountbeheer-uitbreiding) dezelfde velden met eigen titel, foutcode (RESET_LINK_INVALID) en melding na gelukt.
export function InvitationPage({
  token,
  soort = 'uitnodiging',
}: {
  readonly token: string | undefined;
  readonly soort?: 'uitnodiging' | 'reset';
}) {
  const navigate = useNavigate();
  const form = useZodForm(newPasswordInput, { wachtwoord: '', herhaal: '' });
  const reset = soort === 'reset';
  const title = reset ? copy.invitation.resetTitle : copy.invitation.title;

  if (token === undefined) {
    return (
      <CenteredCard title={title}>
        <Notice tone="error">{reset ? errorTexts.RESET_LINK_INVALID : errorTexts.INVITATION_INVALID}</Notice>
      </CenteredCard>
    );
  }
  const submit = async ({ wachtwoord }: { wachtwoord: string }) => {
    await auth.setPassword(token, wachtwoord, soort);
    await navigate({ to: '/login', search: reset ? { gewijzigd: true } : { ingesteld: true } });
  };
  return (
    <CenteredCard title={title}>
      <Form form={form} onSubmit={submit} submitLabel={copy.invitation.submit}>
        <FormField
          form={form}
          name="wachtwoord"
          label={copy.invitation.passwordLabel}
          description={copy.invitation.help}
        >
          {(field) => <Input {...field} type="password" autoComplete="new-password" autoFocus />}
        </FormField>
        <FormField form={form} name="herhaal" label={copy.invitation.repeat}>
          {(field) => <Input {...field} type="password" autoComplete="new-password" />}
        </FormField>
      </Form>
    </CenteredCard>
  );
}
