import type { z } from 'zod';
import type { CanActor, Decision, Permissions } from '../../shared/can.ts';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { Contract, Method } from '../../shared/contract.ts';
import type { PrepareContext, RouteContext } from './context.ts';
import { AppError } from '../errors.ts';
import { partnerDef, type PartnerDef, type PartnerHandlerContext, type PartnerStep } from './partner.ts';

// defineRoute en definePartnerRoute (framework §1, §6; ADR 0040): de enige manieren om een route te maken. createApp
// accepteert alleen wat hier vandaan komt (ROUTE), parseert de input, haalt de actor uit de sessie, draait alles in één
// withUser-transactie (met partnerstap: twee, spec partnerstap) en controleert de permissie en de output.
export const ROUTE: unique symbol = Symbol('defineRoute');

export type { AuditFn };
export type { PrepareContext, RouteActor, RouteContext } from './context.ts';
export type { PartnerStep } from './partner.ts';

export interface RouteDef<C extends Contract = Contract, Services = unknown> {
  readonly [ROUTE]: true;
  readonly contract: C;
  readonly check: (actor: CanActor) => Decision;
  // De auditacties van de app waarmee de route gemaakt is; createApp bouwt er ctx.audit mee.
  readonly audit: AuditActions;
  readonly handler: (
    ctx: RouteContext<z.output<C['input']>, Services>,
  ) => z.input<C['output']> | Promise<z.input<C['output']>>;
  // Alleen bij defineRoute met prepare (spec bestandsopslag, "Route kit in twee fasen"): draait buiten elke transactie en
  // geeft de handler terug met ctx.prepared erin gebonden; een fout uit prepare wordt bewaard, nooit gegooid. createApp
  // roept dan die handler aan in plaats van `handler` (src/core/api/http/prepare-route.ts).
  readonly prepare?: (
    ctx: PrepareContext<z.output<C['input']>, Services>,
  ) => Promise<BoundPrepare<RouteContext<z.output<C['input']>, Services>, z.input<C['output']>>>;
  // Alleen bij definePartnerRoute (spec partnerstap): createApp kiest dan het pad van src/core/api/http/partner-route.ts.
  readonly partner?: PartnerDef<z.output<C['input']>, z.input<C['output']>, Services>;
}

// De handler van een route met prepare loopt via route.prepare; createApp roept deze nooit aan.
function prepareOnly(): never {
  throw new Error('defineRoute: de handler van een route met prepare loopt alleen via prepare (createApp)');
}

// De handler van een partnerroute loopt via route.partner; createApp roept deze nooit aan.
function partnerOnly(): never {
  throw new Error('definePartnerRoute: de handler loopt alleen via de partnerstap (createApp)');
}

// ctx.prepared(): de waarde uit prepare, of pas hier de bewaarde fout (rol, permissie, MFA en eigen-rijcontrole gaan voor).
export interface Prepared<Result> {
  readonly prepared: () => Promise<Result>;
}

export interface RouteOptions<Input, Services, Result> {
  readonly prepare: (ctx: PrepareContext<Input, Services>) => Promise<Result>;
}

// De handler met ctx.prepared gebonden, en na het request de fout uit prepare die niemand ophaalde en geen AppError is
// (die logt createApp; een niet opgehaalde AppError blijft stil).
export interface BoundPrepare<Ctx, Output> {
  readonly handler: (ctx: Ctx) => Output | Promise<Output>;
  readonly unclaimedError: () => { readonly error: unknown } | null;
}

type Settled<Result> = { readonly ok: true; readonly value: Result } | { readonly ok: false; readonly error: unknown };

// Voert prepare uit en bewaart de uitkomst; geeft de handler terug met ctx.prepared gebonden aan die uitkomst.
function bindPrepare<Input, Services, Audit extends AuditActions, Result, Output>(
  options: RouteOptions<Input, Services, Result>,
  handler: (ctx: RouteContext<Input, Services, Audit> & Prepared<Result>) => Output | Promise<Output>,
) {
  return async (ctx: PrepareContext<Input, Services>) => {
    const settled: Settled<Result> = await Promise.resolve()
      .then(() => options.prepare(ctx))
      .then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    let claimed = false;
    const prepared = (): Promise<Result> =>
      Promise.resolve().then(() => {
        claimed = true;
        if (!settled.ok) throw settled.error;
        return settled.value;
      });
    return {
      handler: (routeCtx: RouteContext<Input, Services, Audit>) => handler({ ...routeCtx, prepared }),
      unclaimedError: () =>
        settled.ok || claimed || settled.error instanceof AppError ? null : { error: settled.error },
    };
  };
}

export function isRouteDef(value: unknown): value is RouteDef {
  return typeof value === 'object' && value !== null && ROUTE in value;
}

interface KitConfig<Permission extends string, Audit extends AuditActions> {
  readonly permissions: Permissions<Permission>;
  readonly audit: Audit;
}

function createDefineRoute<Permission extends string, Services, Audit extends AuditActions>(
  config: KitConfig<Permission, Audit>,
) {
  // Zonder options gedraagt de route zich als voorheen (één withUser); met prepare loopt ze in twee fasen.
  function defineRoute<const M extends Method, const P extends string, I extends z.ZodObject, O extends z.ZodType>(
    contract: Contract<M, P, I, O, Permission>,
    handler: (ctx: RouteContext<z.output<I>, Services, Audit>) => z.input<O> | Promise<z.input<O>>,
  ): RouteDef<Contract<M, P, I, O, Permission>, Services>;
  function defineRoute<
    const M extends Method,
    const P extends string,
    I extends z.ZodObject,
    O extends z.ZodType,
    Result,
  >(
    contract: Contract<M, P, I, O, Permission>,
    handler: (ctx: RouteContext<z.output<I>, Services, Audit> & Prepared<Result>) => z.input<O> | Promise<z.input<O>>,
    options: RouteOptions<z.output<I>, Services, Result>,
  ): RouteDef<Contract<M, P, I, O, Permission>, Services>;
  function defineRoute<
    const M extends Method,
    const P extends string,
    I extends z.ZodObject,
    O extends z.ZodType,
    Result,
  >(
    // Een unie van de twee overloads: de lengte onderscheidt ze zonder cast.
    ...args:
      | [
          Contract<M, P, I, O, Permission>,
          (ctx: RouteContext<z.output<I>, Services, Audit>) => z.input<O> | Promise<z.input<O>>,
        ]
      | [
          Contract<M, P, I, O, Permission>,
          (ctx: RouteContext<z.output<I>, Services, Audit> & Prepared<Result>) => z.input<O> | Promise<z.input<O>>,
          RouteOptions<z.output<I>, Services, Result>,
        ]
  ): RouteDef<Contract<M, P, I, O, Permission>, Services> {
    const contract = args[0];
    const base = {
      [ROUTE]: true as const,
      contract,
      check: (actor: CanActor) => config.permissions.check(actor, contract.permission),
      audit: config.audit,
    };
    if (args.length === 2) return { ...base, handler: args[1] };
    return { ...base, handler: prepareOnly, prepare: bindPrepare(args[2], args[1]) };
  }
  return defineRoute;
}

export function createRouteKit<
  Permission extends string,
  Services = unknown,
  Audit extends AuditActions = AuditActions,
>(config: KitConfig<Permission, Audit>) {
  return {
    defineRoute: createDefineRoute<Permission, Services, Audit>(config),
    // Spec partnerstap: Loaded volgt uit load (zonder load undefined), Result uit call; de handler krijgt ctx.partner.
    definePartnerRoute: <
      const M extends Method,
      const P extends string,
      I extends z.ZodObject,
      O extends z.ZodType,
      Result,
      Loaded = undefined,
    >(
      contract: Contract<M, P, I, O, Permission>,
      partner: PartnerStep<z.output<I>, Services, Loaded, Result>,
      handler: (ctx: PartnerHandlerContext<z.output<I>, Services, Result, Audit>) => z.input<O> | Promise<z.input<O>>,
    ): RouteDef<Contract<M, P, I, O, Permission>, Services> => ({
      [ROUTE]: true,
      contract,
      check: (actor) => config.permissions.check(actor, contract.permission),
      audit: config.audit,
      handler: partnerOnly,
      partner: partnerDef(partner, handler),
    }),
  };
}
