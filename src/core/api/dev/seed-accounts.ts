// Vaste lokale accounts (spec accountbeheer: "altijd iemand binnen"). Alleen voor APP_ENV=local: scripts/seed.mjs weigert
// elders, en de dev-switcher (PR 7) bestaat buiten local niet. Demo-waarden, bewust in de repo; nergens anders geldig.
export const SEED_DEMO_WACHTWOORD = 'lokaal-demo-wachtwoord';

// Vast TOTP-geheim van de lokale admin (32 tekens, zoals Better Auth ze maakt); de otpauth-URI staat in de README.
export const SEED_ADMIN_TOTP_SLEUTEL = 'lokaal-demo-totp-sleutel-0000000';

export interface SeedAccount {
  readonly email: string;
  readonly name: string;
  readonly role: 'user' | 'admin';
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: 'admin@template.test', name: 'Lokale Beheerder', role: 'admin' },
  { email: 'gebruiker@template.test', name: 'Lokale Gebruiker', role: 'user' },
];
