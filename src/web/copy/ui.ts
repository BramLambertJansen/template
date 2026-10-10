import type { Role } from '#core/shared/can.ts';

// Zichtbare teksten van de schermen, letterlijk uit de spec accountbeheer waar die een tekst geeft. Teksten die de spec
// niet noemt (toegankelijke namen, validatie), staan met "(niet in spec)" erbij.
// Naam per rol: Record<Role, …>, dus een nieuwe rol in ROLES zonder naam is een typefout (accounts, rolwisselaar).
export const roleLabels = { user: 'Gebruiker', admin: 'Beheerder' } as const satisfies Record<Role, string>;

export const copy = {
  login: {
    title: 'Inloggen',
    email: 'E-mailadres',
    passwordLabel: 'Wachtwoord',
    submit: 'Inloggen',
    passwordSet: 'Je wachtwoord is ingesteld. Log in om verder te gaan.',
    sessionExpired: 'Je sessie is verlopen. Log opnieuw in.',
  },
  totp: {
    title: 'Verificatiecode',
    explanation: 'Voer de 6-cijferige code uit je authenticator-app in.',
    code: 'Code',
    submit: 'Bevestigen',
  },
  totpSetup: {
    title: 'Tweestapsverificatie instellen',
    explanation: 'Scan de QR-code met je authenticator-app en voer daarna de code in.',
    showKey: 'Kan je niet scannen? Toon de sleutel',
    code: 'Code',
    submit: 'Activeren',
    // (niet in spec) toegankelijke naam van de QR-code en het label van de sleutel.
    qrLabel: 'QR-code voor je authenticator-app',
    keyLabel: 'Sleutel',
  },
  invitation: {
    title: 'Wachtwoord instellen',
    passwordLabel: 'Wachtwoord',
    repeat: 'Wachtwoord herhalen',
    help: 'Minstens 12 tekens.',
    submit: 'Wachtwoord instellen',
  },
  nav: { home: 'Home', dashboard: 'Dashboard' },
  menu: { logout: 'Uitloggen' },
  home: { title: 'Home' },
  dashboard: { title: 'Dashboard', accounts: 'Accounts' },
  accounts: {
    title: 'Accounts',
    name: 'Naam',
    email: 'E-mailadres',
    role: 'Rol',
    status: 'Status',
    // (niet in spec) kop van de kolom met "Opnieuw uitnodigen"; alleen voor schermlezers.
    actions: 'Acties',
    roles: roleLabels,
    statuses: { actief: 'Actief', uitgenodigd: 'Uitgenodigd' },
    reinvite: 'Opnieuw uitnodigen',
    invite: 'Account uitnodigen',
    empty: 'Nog geen accounts.',
    more: 'Meer laden',
  },
  inviteDialog: {
    title: 'Account uitnodigen',
    name: 'Naam',
    email: 'E-mailadres',
    role: 'Rol',
    submit: 'Uitnodiging versturen',
    cancel: 'Annuleren',
    sent: (email: string) => `Uitnodiging verstuurd naar ${email}.`,
    exists: 'Er bestaat al een account met dit e-mailadres.',
  },
} as const;
