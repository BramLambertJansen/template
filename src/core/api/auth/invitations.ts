import type { Auth } from './auth.ts';

// Uitnodigen via de reset-flow van Better Auth (ADR 0013): de gebruiker bestaat meteen, zonder credential-account
// (status "uitgenodigd"), en krijgt een eenmalige link om zijn wachtwoord in te stellen. De rol volgt in stuk 4c.

export class AccountAlreadyActiveError extends Error {
  constructor() {
    super('Dit account is al actief');
  }
}

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account bestaat niet');
  }
}

export async function inviteUser(auth: Auth, input: { name: string; email: string }): Promise<{ userId: string }> {
  const context = await auth.$context;
  // Uniek op e-mail in de database: van twee gelijktijdige uitnodigingen slaagt er één.
  const user = await context.internalAdapter.createUser(
    { name: input.name, email: input.email.toLowerCase(), emailVerified: false },
    { method: 'admin' },
  );
  await auth.api.requestPasswordReset({ body: { email: user.email } });
  return { userId: user.id };
}

export async function reinviteUser(auth: Auth, userId: string): Promise<void> {
  const context = await auth.$context;
  const user = await context.internalAdapter.findUserById(userId);
  if (user === null) throw new AccountNotFoundError();
  if ((await context.internalAdapter.findCredentialAccount(userId)) !== null) throw new AccountAlreadyActiveError();
  // Alleen de nieuwste link werkt: oude reset-tokens van deze gebruiker gaan eerst weg.
  await context.adapter.deleteMany({
    model: 'verification',
    where: [
      { field: 'value', value: userId },
      { field: 'identifier', operator: 'starts_with', value: 'reset-password:' },
    ],
  });
  await auth.api.requestPasswordReset({ body: { email: user.email } });
}
