import type { z } from 'zod';
import type { CanActor, Decision, Permissions, Role, SessionStrength } from '../../shared/can.ts';
import type { Contract, Method } from '../../shared/contract.ts';
import type { Tx } from '../db/types.ts';

// defineRoute (framework §1, §6; ADR 0008): de enige manier om een route te maken. createApp accepteert alleen wat hier
// vandaan komt (ROUTE), parseert de input, haalt de actor uit de sessie, draait alles in één withUser-transactie en
// controleert de permissie en de output.
export const ROUTE: unique symbol = Symbol('defineRoute');

export interface RouteActor {
  readonly userId: string;
  readonly role: Role;
  readonly sessionStrength: SessionStrength;
  readonly name: string;
  readonly email: string;
}

export interface RouteContext<Input> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly tx: Tx;
}

export interface RouteDef<C extends Contract = Contract> {
  readonly [ROUTE]: true;
  readonly contract: C;
  readonly check: (actor: CanActor) => Decision;
  readonly handler: (ctx: RouteContext<z.output<C['input']>>) => z.input<C['output']> | Promise<z.input<C['output']>>;
}

export function isRouteDef(value: unknown): value is RouteDef {
  return typeof value === 'object' && value !== null && ROUTE in value;
}

export function createRouteKit<Permission extends string>(config: { permissions: Permissions<Permission> }) {
  return {
    defineRoute: <const M extends Method, const P extends string, I extends z.ZodObject, O extends z.ZodType>(
      contract: Contract<M, P, I, O, Permission>,
      handler: (ctx: RouteContext<z.output<I>>) => z.input<O> | Promise<z.input<O>>,
    ): RouteDef<Contract<M, P, I, O, Permission>> => ({
      [ROUTE]: true,
      contract,
      check: (actor) => config.permissions.check(actor, contract.permission),
      handler,
    }),
  };
}
