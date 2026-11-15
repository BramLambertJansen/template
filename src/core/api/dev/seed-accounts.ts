// Vaste lokale waarden voor de seed-accounts (spec accountbeheer: "altijd iemand binnen"). Alleen voor APP_ENV=local:
// scripts/seed.mjs weigert elders, en de dev-rolwisselaar bestaat buiten local niet. Demo-waarden, bewust in de repo; nergens
// anders geldig. De accounts zelf (één per rol van het register) levert de app: src/api/dev/seed-accounts.ts (spec
// rollenregister).
export const SEED_DEMO_WACHTWOORD = 'lokaal-demo-wachtwoord';

// Vast TOTP-geheim (32 tekens, zoals Better Auth ze maakt) van het seed-account van elke beheerrol; de otpauth-URI staat in
// de README.
export const SEED_ADMIN_TOTP_SLEUTEL = 'lokaal-demo-totp-sleutel-0000000';

export interface SeedAccount {
  readonly email: string;
  readonly name: string;
}

// Eén account per rol (spec accountbeheer: één account heeft één rol). De app typt haar tabel als SeedAccounts<Role>: een rol
// in het register zonder seed-account is een typefout, zodat de dev-rolwisselaar elke rol kan tonen.
export type SeedAccounts<Name extends string> = Readonly<Record<Name, SeedAccount>>;
