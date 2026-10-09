// Better Auth in de API (ADR 0003, 0010, 0013). Ingang voor de app; de opties zelf staan in options.ts.
export {
  authGateway,
  createAuth,
  type Auth,
  type AuthGateway,
  type CreateAuthConfig,
  type SessionInfo,
} from './auth.ts';
export { AccountAlreadyActiveError, AccountNotFoundError, inviteUser, reinviteUser } from './invitations.ts';
export type { Invitation } from './options.ts';
