import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { accountsListContract, inviteContract } from '../../src/shared/contracts/accounts.ts';
import { Browser, latestMailTo, tokenFrom, uniqueEmail } from '../auth/harness.ts';
import { createAccountTestApp, json, mailCountNow, NEW_PASSWORD } from './account-harness.ts';

// Uitnodiging intrekken (spec accountbeheer-uitbreiding, namespace accounts): accounts/AC-15 en het intrekdeel van
// accounts/AC-19, de RLS-vangnetten, de auditregel core.account.revoke en de races (a) t/m (d) uit het Testplan, tegen de
// echte database, Better Auth en Mailpit (`pnpm test:db`). Resetlink (AC-16) valt erbuiten.
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const INVITE = 'POST /api/accounts/invite';
const REVOKE = (id: string) => `DELETE /api/accounts/${id}/invitation`;
const BLOCK = (id: string) => `POST /api/accounts/${id}/block`;
const DEACTIVATE = (id: string) => `POST /api/accounts/${id}/deactivate`;

async function mfaAdmin(name = 'Beheerder') {
  const admin = await t.account('admin', name);
  await t.enableTotp(admin.browser);
  return admin;
}

// Een uitnodiging via de route (rol en mail zoals in productie), met het token uit de mail.
async function invited(admin: Browser, email = uniqueEmail('intrekken')) {
  const response = await t.call(admin, INVITE, { naam: 'Nog Niet Actief', email, rol: 'user' });
  expect(response.status).toBe(200);
  const { id } = inviteContract.output.parse(await json(response));
  const token = tokenFrom((await latestMailTo(email)).text);
  return { id, email, token };
}

async function listed(admin: Browser, email: string) {
  const response = await t.call(admin, `GET /api/accounts?q=${encodeURIComponent(email)}`);
  expect(response.status).toBe(200);
  return accountsListContract.output.parse(await json(response)).items.find((item) => item.email === email);
}

const accept = (token: string) =>
  new Browser(t.app).post('/api/auth/reset-password', { token, newPassword: NEW_PASSWORD });

async function userExists(id: string): Promise<boolean> {
  const { rows } = await t.authDb.query('select 1 from "user" where id = $1', [id]);
  return rows.length === 1;
}

async function accountRows(userId: string): Promise<number> {
  const { rows } = await t.authDb.query('select 1 from account where "userId" = $1', [userId]);
  return rows.length;
}

async function tokenRows(token: string): Promise<number> {
  const { rows } = await t.authDb.query('select 1 from verification where identifier = $1', [
    `reset-password:${token}`,
  ]);
  return rows.length;
}

const auditRow = z.object({
  action: z.string(),
  actor_id: z.string().nullable(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});

// Zoals test/api/accounts-audit.int.test.ts: lezen als app_definer (policy audit_log_definer_select).
async function auditRowsFor(requestId: string) {
  const client = await t.migrator.connect();
  try {
    await client.query('begin');
    await client.query('set local role app_definer');
    const { rows } = await client.query(
      'select action, actor_id, target_type, target_id, details from app.audit_log where request_id = $1 order by action',
      [requestId],
    );
    return rows.map((row) => auditRow.parse(row));
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

function requestIdOf(response: Response): string {
  const id = response.headers.get('x-request-id');
  if (id === null) throw new Error('geen X-Request-Id in de response');
  return id;
}

describe('DELETE /api/accounts/:id/invitation: rechten en invoer (spec accounts/AC-19)', () => {
  test('niet ingelogd: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), REVOKE('x'), {});

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('accounts/AC-19: user: 403 FORBIDDEN, ook met TOTP; de uitnodiging blijft staan', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    const user = await t.account('user', 'Gewone Gebruiker');
    await t.enableTotp(user.browser);

    const response = await t.call(user.browser, REVOKE(target.id), {});

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
    expect((await listed(admin.browser, target.email))?.status).toBe('uitgenodigd');
    expect(await tokenRows(target.token)).toBe(1);
  });

  test('accounts/AC-19: admin zonder MFA: 403 MFA_REQUIRED; de uitnodiging blijft staan', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    const zonderMfa = await t.account('admin', 'Zonder MFA');

    const response = await t.call(zonderMfa.browser, REVOKE(target.id), {});

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect((await listed(admin.browser, target.email))?.status).toBe('uitgenodigd');
    expect(await tokenRows(target.token)).toBe(1);
  });

  test.each([
    // DELETE negeert de body (create-app.ts), dus het extra veld gaat als query mee; .strict() weigert het.
    ['extra veld in de query', `${REVOKE('iets')}?rol=admin`],
    ['een id van meer dan 200 tekens', REVOKE('x'.repeat(201))],
  ])('accounts/AC-15: %s: 400 VALIDATION, vóór de handler', async (_case, request) => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, request);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });
});

describe('intrekken (accounts/AC-15)', () => {
  test('het account verdwijnt uit de lijst, de link geeft een 400 (INVITATION_INVALID in de web), hetzelfde adres kan opnieuw', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    expect((await listed(admin.browser, target.email))?.status).toBe('uitgenodigd');

    const response = await t.call(admin.browser, REVOKE(target.id), {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect(await listed(admin.browser, target.email)).toBeUndefined();
    expect(await userExists(target.id)).toBe(false);
    expect(await tokenRows(target.token)).toBe(0);
    expect((await accept(target.token)).status).toBe(400);

    const mailsBefore = await mailCountNow(target.email);
    const again = await t.call(admin.browser, INVITE, { naam: 'Opnieuw', email: target.email, rol: 'user' });
    expect(again.status).toBe(200);
    expect(inviteContract.output.parse(await json(again)).id).not.toBe(target.id);
    await expect.poll(() => mailCountNow(target.email)).toBe(mailsBefore + 1);
    expect((await listed(admin.browser, target.email))?.status).toBe('uitgenodigd');
  });

  test('de rol-toewijzing van het account is mee verwijderd (cascade op user_roles)', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    await t.call(admin.browser, REVOKE(target.id), {});

    const { rows } = await t.migrator.query('select 1 from public.user_roles where user_id = $1', [target.id]);
    expect(rows).toHaveLength(0);
  });

  test('een tweede keer intrekken: 404 NOT_FOUND (onbekend of al verwijderd)', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    expect((await t.call(admin.browser, REVOKE(target.id), {})).status).toBe(200);

    const response = await t.call(admin.browser, REVOKE(target.id), {});

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
  });

  test('een onbekend id: 404 NOT_FOUND', async () => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, REVOKE('bestaat-niet'), {});

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
  });

  test('de audit-regel core.account.revoke: doelaccount, actor en request_id; account en regel staan in dezelfde commit', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);

    const response = await t.call(admin.browser, REVOKE(target.id), {});

    expect(response.status).toBe(200);
    expect(await auditRowsFor(requestIdOf(response))).toStrictEqual([
      {
        action: 'core.account.revoke',
        actor_id: admin.userId,
        target_type: 'account',
        target_id: target.id,
        details: {},
      },
    ]);
  });
});

describe('intrekken van een account dat niet uitgenodigd is (RLS-vangnet, randgevallen)', () => {
  test('actief: 409 ALREADY_ACTIVE, het account en zijn sessie blijven', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Actief Account');

    const response = await t.call(admin.browser, REVOKE(user.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
    expect(await userExists(user.userId)).toBe(true);
    expect((await user.browser.get('/api/me')).status).toBe(200);
  });

  test('geblokkeerd: 409 ALREADY_ACTIVE, het account blijft bestaan', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geblokkeerd Account');
    expect((await t.call(admin.browser, BLOCK(user.userId), {})).status).toBe(200);

    const response = await t.call(admin.browser, REVOKE(user.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
    expect(await userExists(user.userId)).toBe(true);
    expect((await listed(admin.browser, user.email))?.status).toBe('geblokkeerd');
  });

  test('gedeactiveerd: 409 ALREADY_ACTIVE, het account blijft bestaan', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Gedeactiveerd Account');
    expect((await t.call(admin.browser, DEACTIVATE(user.userId), {})).status).toBe(200);

    const response = await t.call(admin.browser, REVOKE(user.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
    expect(await userExists(user.userId)).toBe(true);
  });

  test('een geweigerde intrekking (ALREADY_ACTIVE) schrijft geen auditregel', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geen Regel');

    const response = await t.call(admin.browser, REVOKE(user.userId), {});

    expect(response.status).toBe(409);
    expect(await auditRowsFor(requestIdOf(response))).toStrictEqual([]);
  });
});

describe('intrekken tegen accepteren (races a t/m d, spec Testplan)', () => {
  test('(a) credential eerst: 409 ALREADY_ACTIVE, het account blijft en kan inloggen', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    expect((await accept(target.token)).status).toBe(200);

    const response = await t.call(admin.browser, REVOKE(target.id), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
    expect(await userExists(target.id)).toBe(true);
    const back = await t.signIn(target.email, NEW_PASSWORD);
    expect((await back.get('/api/me')).status).toBe(200);
  });

  test('(b) intrekken eerst: het token is weg en accepteren geeft 400, geen 500, geen account', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    expect((await t.call(admin.browser, REVOKE(target.id), {})).status).toBe(200);

    expect(await tokenRows(target.token)).toBe(0);
    const response = await accept(target.token);

    expect(response.status).toBe(400);
    expect(await userExists(target.id)).toBe(false);
  });

  test('(c) USER_NOT_FOUND: verification-rij blijft, user weg, dan reset-password: 400, geen 500', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    await t.authDb.query('delete from "user" where id = $1', [target.id]);
    expect(await tokenRows(target.token)).toBe(1);

    const response = await accept(target.token);

    expect(response.status).toBe(400);
    expect(await userExists(target.id)).toBe(false);
  });

  test('(d) hook: een open intrekking houdt de user-rij vast; reset-password wacht, daarna 400 INVALID_TOKEN, geen 500', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);
    const revoking = await t.authDb.connect();
    try {
      await revoking.query('begin');
      await revoking.query('select 1 from "user" where id = $1 for update', [target.id]);
      await revoking.query('delete from "user" where id = $1', [target.id]);

      let settled = false;
      const pending = accept(target.token).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(settled).toBe(false);

      await revoking.query('commit');
      const response = await pending;

      expect([response.status, await json(response)]).toMatchObject([400, { code: 'INVALID_TOKEN' }]);
    } finally {
      await revoking.query('rollback').catch(() => undefined);
      revoking.release();
    }
    expect(await userExists(target.id)).toBe(false);
  });

  test('accepteren en intrekken tegelijk: óf accepteren 200 met intrekken 409, óf accepteren 400 met intrekken 200; accepteren 500 in het restvenster (23503), intrekken 200; dan is de user weg en is er geen half account', async () => {
    const admin = await mfaAdmin();
    const target = await invited(admin.browser);

    const [accepted, revoked] = await Promise.all([accept(target.token), t.call(admin.browser, REVOKE(target.id), {})]);

    const outcome = [accepted.status, revoked.status];
    expect([
      [200, 409],
      [400, 200],
      [500, 200],
    ]).toContainEqual(outcome);
    if (revoked.status === 200) {
      expect(await userExists(target.id)).toBe(false);
      expect(await accountRows(target.id)).toBe(0);
    } else expect(await json(revoked)).toMatchObject({ code: 'ALREADY_ACTIVE' });
  });
});
