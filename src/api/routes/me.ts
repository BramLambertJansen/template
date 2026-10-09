import { meContract } from '#shared/contracts/me.ts';
import { defineRoute } from '../kit.ts';

// De actor komt uit de sessie en de rol uit de database (createApp); geen eigen query nodig.
export const meRoute = defineRoute(meContract, ({ actor }) => ({
  id: actor.userId,
  naam: actor.name,
  email: actor.email,
  rol: actor.role,
}));
