import { useState } from 'react';
import { ApiError } from '#core/web/lib/api-client.ts';
import { backupCodeInput, loginInput, totpInput } from '#shared/schemas/auth.ts';
import { copy } from '#web/copy/ui.ts';
import { auth } from '#web/lib/auth.ts';
import {
  Button,
  CenteredCard,
  Form,
  FormField,
  Input,
  PasswordInput,
  Notice,
  QrCode,
  useZodForm,
} from '#web/ui/index.ts';
import { BackupCodesList } from '../account/backup-codes-list.tsx';
import { useFinishLogin } from './queries.ts';

// Inloggen (spec accountbeheer) in stappen binnen één route: wachtwoord → code (admin met TOTP) of instellen (admin zonder
// TOTP). Wachtwoord, TOTP-sleutel en herstelcodes blijven in het geheugen van deze pagina, nooit in de URL of opslag. Herstelcodes
// (ADR 0113): na de eerste juiste code bij instellen het scherm "Herstelcodes"; bij inloggen kan een herstelcode TOTP vervangen.

type Step =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'totp' }
  | { readonly kind: 'backupCode' }
  | { readonly kind: 'setup'; readonly totpURI: string; readonly backupCodes: readonly string[] }
  | { readonly kind: 'backupCodes'; readonly codes: readonly string[] };

export interface LoginPageProps {
  readonly notice: 'ingesteld' | 'gewijzigd' | 'verlopen' | null;
  readonly redirect: string | undefined;
}

function Credentials({ onStep, finish }: { onStep: (step: Step) => void; finish: () => Promise<void> }) {
  const form = useZodForm(loginInput, { email: '', password: '' });
  const submit = async ({ email, password }: { email: string; password: string }) => {
    if ((await auth.signIn(email, password)) === 'totp') {
      onStep({ kind: 'totp' });
      return;
    }
    try {
      await finish();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'MFA_REQUIRED')) throw error;
      // Admin zonder TOTP (spec accounts/AC-4): eerst instellen; Better Auth vraagt daarvoor het wachtwoord.
      onStep({ kind: 'setup', ...(await auth.enableTotp(password)) });
    }
  };
  return (
    <Form form={form} onSubmit={submit} submitLabel={copy.login.submit}>
      <FormField form={form} name="email" label={copy.login.email}>
        {(field) => <Input {...field} type="email" autoComplete="username" autoFocus />}
      </FormField>
      <FormField form={form} name="password" label={copy.login.passwordLabel}>
        {(field) => (
          <PasswordInput {...field} autoComplete="current-password" visibilityLabel={copy.login.visibilityLabel} />
        )}
      </FormField>
    </Form>
  );
}

// autoFocus alleen als het veld het eerste op het scherm is (bij instellen staat de QR-code eerst).
function CodeForm({
  submitLabel,
  finish,
  autoFocus = true,
}: {
  submitLabel: string;
  finish: () => Promise<void>;
  autoFocus?: boolean;
}) {
  const form = useZodForm(totpInput, { code: '' });
  const submit = async ({ code }: { code: string }) => {
    await auth.verifyTotp(code);
    await finish();
  };
  return (
    <Form form={form} onSubmit={submit} submitLabel={submitLabel}>
      <FormField form={form} name="code" label={copy.totp.code}>
        {(field) => (
          <Input {...field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={autoFocus} />
        )}
      </FormField>
    </Form>
  );
}

// Inloggen met een herstelcode in plaats van TOTP; dezelfde afronding als na een TOTP-code.
function BackupCodeForm({ finish, onStep }: { finish: () => Promise<void>; onStep: (step: Step) => void }) {
  const form = useZodForm(backupCodeInput, { code: '' });
  const submit = async ({ code }: { code: string }) => {
    await auth.verifyBackupCode(code);
    await finish();
  };
  return (
    <div className="flex flex-col gap-4">
      <Form form={form} onSubmit={submit} submitLabel={copy.backupCode.submit}>
        <FormField form={form} name="code" label={copy.backupCode.code}>
          {(field) => <Input {...field} autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus />}
        </FormField>
      </Form>
      <Button
        variant="ghost"
        onClick={() => {
          onStep({ kind: 'totp' });
        }}
      >
        {copy.backupCode.useTotp}
      </Button>
    </div>
  );
}

function TotpSetup({ totpURI, finish }: { totpURI: string; finish: () => Promise<void> }) {
  const [showKey, setShowKey] = useState(false);
  const secret = new URL(totpURI).searchParams.get('secret') ?? '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <QrCode value={totpURI} label={copy.totpSetup.qrLabel} />
      </div>
      {showKey ? (
        <Notice>
          {copy.totpSetup.keyLabel}: <code className="break-all">{secret}</code>
        </Notice>
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            setShowKey(true);
          }}
        >
          {copy.totpSetup.showKey}
        </Button>
      )}
      <CodeForm submitLabel={copy.totpSetup.submit} finish={finish} autoFocus={false} />
    </div>
  );
}

export function LoginPage({ notice, redirect }: LoginPageProps) {
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const finish = useFinishLogin(redirect);

  if (step.kind === 'totp') {
    return (
      <CenteredCard title={copy.totp.title} description={copy.totp.explanation}>
        <div className="flex flex-col gap-4">
          <CodeForm submitLabel={copy.totp.submit} finish={finish} />
          <Button
            variant="ghost"
            onClick={() => {
              setStep({ kind: 'backupCode' });
            }}
          >
            {copy.totp.useBackupCode}
          </Button>
        </div>
      </CenteredCard>
    );
  }
  if (step.kind === 'backupCode') {
    return (
      <CenteredCard title={copy.backupCode.title} description={copy.backupCode.explanation}>
        <BackupCodeForm finish={finish} onStep={setStep} />
      </CenteredCard>
    );
  }
  if (step.kind === 'setup') {
    const { backupCodes } = step;
    // Pas na de eerste juiste TOTP-code: dan is TOTP actief en gelden de codes.
    const showCodes = () => {
      setStep({ kind: 'backupCodes', codes: backupCodes });
      return Promise.resolve();
    };
    return (
      <CenteredCard title={copy.totpSetup.title} description={copy.totpSetup.explanation}>
        <TotpSetup totpURI={step.totpURI} finish={showCodes} />
      </CenteredCard>
    );
  }
  if (step.kind === 'backupCodes') {
    return (
      <CenteredCard title={copy.backupCodes.title} description={copy.backupCodes.explanation}>
        <BackupCodesList codes={step.codes} onDone={finish} />
      </CenteredCard>
    );
  }
  return (
    <CenteredCard title={copy.login.title}>
      <div className="flex flex-col gap-6">
        {notice === 'ingesteld' ? <Notice>{copy.login.passwordSet}</Notice> : null}
        {notice === 'gewijzigd' ? <Notice>{copy.login.passwordChanged}</Notice> : null}
        {notice === 'verlopen' ? <Notice>{copy.login.sessionExpired}</Notice> : null}
        <Credentials onStep={setStep} finish={finish} />
      </div>
    </CenteredCard>
  );
}
