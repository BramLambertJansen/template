import { meContract, renameContract } from '#shared/contracts/me.ts';
import { defineRoute } from '../kit.ts';

// De actor komt uit de sessie en de rol uit de database (createApp); geen eigen query nodig.
export const meRoute = defineRoute(meContract, ({ actor }) => ({
  id: actor.userId,
  naam: actor.name,
  email: actor.email,
  rol: actor.role,
}));

// Spec eigen-account: altijd het eigen account (ctx.actor), via Better Auth (better_auth."user" is van auth_service).
export const renameRoute = defineRoute(renameContract, async ({ actor, input, services }) => {
  await services.profile.rename(actor.userId, input.naam);
  return null;
});
