import type { SessionStrength } from '../../shared/can.ts';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { UserId } from '../../shared/ids.ts';
import type { Tx } from '../db/types.ts';

// Wat een handler en de partnerstap van de kit krijgen. Een eigen bestand zodat kit.ts (RouteDef) en partner.ts
// (PartnerStep) het allebei gebruiken zonder elkaar in een kring te importeren; kit.ts exporteert het opnieuw.

export interface RouteActor {
  readonly userId: UserId;
  // De sessie van dit verzoek (niet het token): voor routes die sessies tonen of beëindigen.
  readonly sessionId: string;
  // De rol uit user_roles; de permissiecontrole heeft al vastgesteld dat het register van de app hem kent.
  readonly role: string;
  readonly sessionStrength: SessionStrength;
  readonly name: string;
  readonly email: string;
  // TOTP ingesteld (twoFactorEnabled uit de sessie); false als de gateway het niet levert (spec accountbeheer-uitbreiding).
  readonly twoFactorEnabled: boolean;
}

// Wat prepare krijgt (spec bestandsopslag, "Route kit in twee fasen"): de gevalideerde input, de actor zonder rol (de rol
// komt pas in de tweede withUser) en services; geen tx, want prepare draait zonder transactie en zonder verbinding.
export interface PrepareContext<Input, Services = unknown> {
  readonly input: Input;
  readonly actor: { readonly userId: UserId; readonly sessionStrength: SessionStrength };
  readonly services: Services;
}

// services: wat de app in createApp meegeeft (bijv. uitnodigen via Better Auth); getypt via createRouteKit<…, Services>.
export interface RouteContext<Input, Services = unknown, Audit extends AuditActions = AuditActions> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly tx: Tx;
  readonly services: Services;
  readonly audit: AuditFn<Audit>;
  // De headers van het verzoek, voor een aanroep van Better Auth namens deze gebruiker (auth.api.* leest de sessie eruit).
  readonly headers: Headers;
  // Externe gevolgen pas na commit; compensatie pas na rollback en vrijgeven van de verbinding.
  readonly afterCommit: (effect: () => Promise<unknown>) => void;
  readonly afterRollback: (effect: () => Promise<unknown>) => void;
}
