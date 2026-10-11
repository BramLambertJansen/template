import {
  AccountAlreadyActiveError,
  AccountExistsError,
  AccountNotFoundError,
  inviteUser,
  reinviteUser,
  renameUser,
  type Auth,
} from '#core/api/auth/index.ts';
import { AppError } from '#core/api/errors.ts';

// Wat handlers via ctx.services krijgen (ADR 0008): uitnodigen via Better Auth (ADR 0013). De fouten van core worden hier
// foutcodes uit het register; de handler vangt niets af.
export interface AppServices {
  readonly invitations: {
    readonly invite: (
      input: { readonly name: string; readonly email: string },
      beforeMail: (userId: string) => Promise<void>,
    ) => Promise<{ userId: string }>;
    readonly reinvite: (userId: string) => Promise<void>;
  };
  // Het eigen account (spec eigen-account); userId komt altijd uit ctx.actor.
  readonly profile: {
    readonly rename: (userId: string, name: string) => Promise<void>;
  };
}

function translate(error: unknown): unknown {
  if (error instanceof AccountExistsError) return new AppError('ALREADY_EXISTS', { cause: error });
  if (error instanceof AccountNotFoundError) return new AppError('NOT_FOUND', { cause: error });
  if (error instanceof AccountAlreadyActiveError) return new AppError('ALREADY_ACTIVE', { cause: error });
  return error;
}

export function createServices(auth: Auth): AppServices {
  return {
    invitations: {
      invite: (input, beforeMail) =>
        inviteUser(auth, input, beforeMail).catch((error: unknown) => {
          throw translate(error);
        }),
      reinvite: (userId) =>
        reinviteUser(auth, userId).catch((error: unknown) => {
          throw translate(error);
        }),
    },
    profile: {
      rename: (userId, name) => renameUser(auth, userId, name),
    },
  };
}
