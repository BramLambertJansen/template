import type { Context } from 'hono';
import type { Contract } from '../../shared/contract.ts';
import type { SessionInfo } from '../auth/auth.ts';
import { createAuditFn } from '../db/audit.ts';
import type { RateLimit, WithUser } from '../db/types.ts';
import { AppError } from '../errors.ts';
import { timeDatabase } from '../obs/request-log.ts';
import { guardWithUser } from '../outbound/index.ts';
import type { RouteDef } from '../route/kit.ts';
import { authorize } from './partner-route.ts';
import { createRouteEffects } from './route-effects.ts';

// Het pad van een route met prepare (spec bestandsopslag, "Route kit in twee fasen", OV-20; src/core/api/db blijft
// ongewijzigd). createApp doet stap 1 (sessie, ruwe input) en geeft hier door:
// 2. eerste withUser met een lege work: alleen de rate limit telt (RATE_LIMITED);
// 3. inputvalidatie buiten de database (VALIDATION);
// 4. prepare zonder open transactie en zonder verbinding; een fout wordt als waarde bewaard (kit.ts, bindPrepare);
// 5. tweede withUser zonder rate limit: rol, permissie en MFA, dan de handler met ctx.prepared, dan de outputcontrole.
// De extra lege transactie is een bewuste kost en geldt alleen voor routes met prepare.

type Route<Services> = RouteDef<Contract, Services>;

export interface PreparedRequest<Services> {
  readonly withUser: WithUser;
  readonly session: SessionInfo;
  // Ruwe input plus padparameters; parsen gebeurt na de telling (ook een ongeldig verzoek telt mee).
  readonly rawInput: () => unknown;
  readonly services: Services;
  readonly rateLimit: RateLimit;
}

export async function runPreparedRoute<Services>(
  c: Context,
  route: Route<Services>,
  request: PreparedRequest<Services>,
): Promise<unknown> {
  const { prepare, contract } = route;
  if (prepare === undefined) throw new Error('runPreparedRoute: alleen voor routes met prepare');
  const { session, services } = request;
  const requestId = c.get('requestId');
  const actor = { userId: session.userId, sessionStrength: session.sessionStrength };
  const withUser = guardWithUser(request.withUser);
  await timeDatabase(c.get('requestFacts'), () =>
    withUser(actor, () => Promise.resolve(), { readOnly: true, rateLimit: request.rateLimit, requestId }),
  );
  const parsed = contract.input.safeParse(request.rawInput());
  if (!parsed.success) throw new AppError('VALIDATION');
  const handler = await prepare({ input: parsed.data, actor, services });
  const effects = createRouteEffects({ requestId, route: `${contract.method} /api${contract.path}` });
  return effects.run(() =>
    timeDatabase(c.get('requestFacts'), () =>
      withUser(
        actor,
        async (tx, { role }) => {
          // Rol, permissie en MFA vóór de handler: een fout uit prepare komt pas via ctx.prepared() naar buiten.
          const routeActor = authorize(route, session, role);
          const result = await handler({
            input: parsed.data,
            actor: routeActor,
            tx,
            services,
            audit: createAuditFn(tx, route.audit),
            headers: c.req.raw.headers,
            afterCommit: effects.afterCommit,
            afterRollback: effects.afterRollback,
          });
          // Een output die niet bij het contract past, is een bug: INTERNAL_ERROR, nooit de data.
          return contract.output.parse(result);
        },
        { readOnly: contract.method === 'GET', requestId, onTransactionOutcome: effects.onTransactionOutcome },
      ),
    ),
  );
}
