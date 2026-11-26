import type { Role } from '#shared/roles.ts';

// Nederlandse schermteksten, inclusief toegankelijke namen en validatie. Specs en featurebeschrijvingen leggen het
// bijbehorende gedrag vast.
// Naam per rol: Record<Role, …>, dus een nieuwe rol in het register (src/shared/roles.ts) zonder naam is een typefout
// (accounts, rolwisselaar).
export const roleLabels = { user: 'Gebruiker', admin: 'Beheerder' } as const satisfies Record<Role, string>;

// De naam van een rol zoals de API hem geeft (tekst); een rol zonder naam (alleen in de database) toont zijn eigen naam.
export function roleLabel(rol: string): string {
  const labels: Readonly<Record<string, string>> = roleLabels;
  return labels[rol] ?? rol;
}

export const copy = {
  login: {
    title: 'Inloggen',
    email: 'E-mailadres',
    passwordLabel: 'Wachtwoord',
    visibilityLabel: 'Wachtwoord tonen',
    submit: 'Inloggen',
    passwordSet: 'Je wachtwoord is ingesteld. Log in om verder te gaan.',
    sessionExpired: 'Je sessie is verlopen. Log opnieuw in.',
  },
  totp: {
    title: 'Verificatiecode',
    explanation: 'Voer de 6-cijferige code uit je authenticator-app in.',
    code: 'Code',
    submit: 'Bevestigen',
    useBackupCode: 'Gebruik een herstelcode',
  },
  // Spec accountbeheer-uitbreiding (ADR 0113): inloggen met een herstelcode in plaats van TOTP.
  backupCode: {
    title: 'Herstelcode',
    explanation: 'Voer een van je herstelcodes in.',
    code: 'Herstelcode',
    submit: 'Bevestigen',
    useTotp: 'Gebruik je authenticator-app',
  },
  // De codes zelf, één keer getoond: na inschrijven en na opnieuw maken op /account.
  backupCodes: {
    title: 'Herstelcodes',
    explanation:
      'Bewaar deze codes op een veilige plek. Elke code werkt één keer, als je je authenticator-app niet bij de hand hebt. Je ziet ze maar één keer.',
    saved: 'Ik heb ze bewaard',
  },
  totpSetup: {
    title: 'Tweestapsverificatie instellen',
    explanation: 'Scan de QR-code met je authenticator-app en voer daarna de code in.',
    showKey: 'Kan je niet scannen? Toon de sleutel',
    code: 'Code',
    submit: 'Activeren',
    // Toegankelijke naam van de QR-code en het label van de sleutel.
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
  menu: { account: 'Mijn account', logout: 'Uitloggen' },
  home: { title: 'Home' },
  dashboard: { title: 'Dashboard', accounts: 'Accounts', designSystem: 'Design system' },
  // Spec design-system: de paginatitel; de voorbeeldteksten staan bij de catalogus.
  designSystem: { title: 'Design system' },
  // Spec schillen: de schilwissel op /design-system (vak Schillen) en de voorbeeldnavigatie in de gekozen schil.
  schillen: {
    schilLabel: 'Schil',
    sidebar: 'Sidebar',
    topbalk: 'Topbalk',
    itemsLabel: 'Aantal navigatie-items',
    items3: '3 items',
    items9: '9 items',
    gewoneNavigatie: 'Gewone navigatie',
    voorbeeld: {
      schillen: 'Schillen',
      basis: 'Basis',
      acties: 'Acties',
      formulieren: 'Formulieren',
      meldingen: 'Meldingen en status',
      tabellen: 'Tabellen',
      kaarten: 'Kaarten',
      layout: 'Navigatie en layout',
      patronen: 'Patronen',
    },
  },
  accounts: {
    title: 'Accounts',
    name: 'Naam',
    email: 'E-mailadres',
    role: 'Rol',
    status: 'Status',
    lastLogin: 'Laatst ingelogd',
    unknownLogin: 'Onbekend',
    // Kop van de kolom met het menu per rij; alleen voor schermlezers.
    actions: 'Acties',
    roleName: roleLabel,
    statuses: {
      actief: 'Actief',
      uitgenodigd: 'Uitgenodigd',
      geblokkeerd: 'Geblokkeerd',
      gedeactiveerd: 'Gedeactiveerd',
    },
    reinvite: 'Opnieuw uitnodigen',
    // Spec accountbeheer-uitbreiding: menu per rij en de blokkeerdialoog.
    rowActions: (naam: string) => `Acties voor ${naam}`,
    block: 'Blokkeren',
    unblock: 'Deblokkeren',
    deactivate: 'Deactiveren',
    activate: 'Activeren',
    blockDialog: {
      title: (naam: string) => `${naam} blokkeren?`,
      description: (naam: string) =>
        `${naam} wordt direct overal uitgelogd en kan niet meer inloggen tot je het account deblokkeert.`,
    },
    blocked: (naam: string) => `${naam} is geblokkeerd.`,
    unblocked: (naam: string) => `${naam} is gedeblokkeerd.`,
    deactivateDialog: {
      title: (naam: string) => `${naam} deactiveren?`,
      description:
        'Dit account krijgt direct geen toegang meer. De gegevens blijven bewaard. Activeren heft een eventuele blokkade niet op.',
    },
    deactivated: (naam: string) => `${naam} is gedeactiveerd.`,
    activated: (naam: string) => `${naam} is geactiveerd. Een eventuele blokkade blijft gelden.`,
    // Spec accountbeheer-uitbreiding: uitnodiging intrekken; ALREADY_ACTIVE heeft hier een eigen tekst (de algemene blijft
    // voor opnieuw uitnodigen).
    revoke: 'Uitnodiging intrekken',
    revokeDialog: {
      title: 'Uitnodiging intrekken?',
      description: (email: string) => `De link aan ${email} werkt niet meer en het account verdwijnt uit de lijst.`,
      confirm: 'Intrekken',
      alreadyActive: 'Dit account is inmiddels actief; de uitnodiging is al gebruikt.',
    },
    revoked: (email: string) => `De uitnodiging aan ${email} is ingetrokken.`,
    invite: 'Account uitnodigen',
    empty: 'Nog geen accounts.',
    more: 'Meer laden',
    // Spec lijstpagina: alle zichtbare tekst van zoeken, filteren en sorteren.
    search: 'Zoeken',
    searchHint: 'Zoek op naam of e-mailadres.',
    allRoles: 'Alle rollen',
    allStatuses: 'Alle statussen',
    sort: 'Sorteren',
    sorts: {
      nieuwste: 'Nieuwste eerst',
      oudste: 'Oudste eerst',
      'naam-az': 'Naam A–Z',
      'naam-za': 'Naam Z–A',
    },
    emptyFiltered: 'Geen accounts gevonden. Pas je zoekopdracht of filters aan.',
    loading: 'Bezig met laden…',
    shown: (count: number, more: boolean) => `${String(count)} accounts getoond.${more ? ' Er zijn er meer.' : ''}`,
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
  // Spec eigen-account: /account, letterlijk uit de tabel "Alle zichtbare tekst".
  account: {
    title: 'Mijn account',
    name: {
      title: 'Naam',
      label: 'Naam',
      submit: 'Naam opslaan',
      saved: 'Je naam is opgeslagen.',
    },
    password: {
      title: 'Wachtwoord',
      current: 'Huidig wachtwoord',
      new: 'Nieuw wachtwoord',
      repeat: 'Nieuw wachtwoord herhalen',
      help: 'Minstens 12 tekens. Je wordt op je andere apparaten uitgelogd.',
      submit: 'Wachtwoord wijzigen',
      changed: 'Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd.',
    },
    backupCodes: {
      title: 'Herstelcodes',
      explanation: 'Nieuwe codes maken maakt de oude ongeldig.',
      current: 'Wachtwoord',
      submit: 'Nieuwe herstelcodes maken',
    },
    sessions: {
      title: 'Sessies',
      device: 'Apparaat',
      createdAt: 'Ingelogd op',
      lastActive: 'Laatst actief',
      current: 'Dit apparaat',
      revoke: 'Beëindigen',
      revokeOthers: 'Alle andere sessies beëindigen',
      unknownDevice: 'Onbekend apparaat',
      // Kop van de kolom met "Beëindigen"; alleen voor schermlezers.
      actions: 'Acties',
      revokeDialog: {
        title: 'Sessie beëindigen?',
        description: (device: string) => `Het apparaat ${device} wordt uitgelogd.`,
        confirm: 'Beëindigen',
        done: 'De sessie is beëindigd.',
      },
      revokeOthersDialog: {
        title: 'Alle andere sessies beëindigen?',
        description: 'Je blijft alleen op dit apparaat ingelogd.',
        confirm: 'Beëindigen',
        done: 'Je andere sessies zijn beëindigd.',
      },
    },
    email: {
      title: 'E-mailadres',
      current: (email: string) => `Huidig e-mailadres: ${email}`,
      label: 'Nieuw e-mailadres',
      submit: 'E-mailadres wijzigen',
      requested: (email: string) =>
        `We hebben een bevestigingslink gestuurd naar ${email}. Daarna volgt een link naar het nieuwe adres.`,
      same: 'Dit is al je e-mailadres.',
    },
    confirmEmail: {
      title: 'E-mailadres bevestigen',
      submit: 'Bevestigen',
      oldDone: 'Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd.',
      newDone: 'Je e-mailadres is gewijzigd.',
      toAccount: 'Naar Mijn account',
    },
  },
} as const;
