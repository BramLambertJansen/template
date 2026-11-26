import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import * as limits from '../../src/core/shared/limits.ts';
import { inviteContract } from '../../src/shared/contracts/accounts.ts';
import { APP_ORIGIN, Browser, freshTotp, uniqueEmail } from '../auth/harness.ts';
import {
  countMails,
  createAccountTestApp,
  json,
  mailCountNow,
  mailsTo,
  NEW_PASSWORD,
  PASSWORD,
} from './account-harness.ts';

// Resetlink sturen (spec accountbeheer-uitbreiding, namespace accounts): accounts/AC-16 en het resetlinkdeel van
// accounts/AC-19, de statusmapping, de TTL, de race van twee aanvragen, de sessie- en TOTP-regels na de reset en de
// auditregel core.account.reset_link, tegen de echte database, Better Auth en Mailpit (`pnpm test:db`).
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const RESET = (id: string) => `POST /api/accounts/${id}/reset-link`;
const INVITE = 'POST /api/accounts/invite';
const BLOCK = (id: string) => `POST /api/accounts/${id}/block`;
const DEACTIVATE = (id: string) => `POST /api/accounts/${id}/deactivate`;
const RESET_SUBJECT = `Nieuw wachtwoord instellen voor ${new URL(APP_ORIGIN).hostname}`;

// De TTL staat pas na de bouw in limits.ts; tot dan faalt de eerste assertie hier, niet een import.
function resetTtl(): number {
  const value: unknown = Reflect.get(limits, 'RESET_LINK_TTL_SECONDS');
  expect(value).toBe(3600);
  return Number(value);
}

async function mfaAdmin(name = 'Beheerder') {
  const admin = await t.account('admin', name);
  await t.enableTotp(admin.browser);
  return admin;
}

// De resetmail heeft de link `/uitnodiging?token=…&soort=reset`; tokenFrom uit de harness zou `&soort=reset` meenemen.
function resetTokenFrom(text: string): string {
  const match = /\/uitnodiging\?token=([^&\s]+)&soort=reset/.exec(text);
  if (match?.[1] === undefined) throw new Error('geen resetlink (soort=reset) in de mail');
  return decodeURIComponent(match[1]);
}

// Wacht tot er `count` resetmails aan het adres zijn en geeft ze (nieuwste eerst).
async function resetMails(email: string, count = 1) {
  await expect.poll(() => mailCountNow(email, RESET_SUBJECT), { timeout: 10_000 }).toBeGreaterThanOrEqual(count);
  return (await mailsTo(email)).filter((mail) => mail.subject === RESET_SUBJECT);
}

async function requestReset(admin: Browser, id: string): Promise<Response> {
  return t.call(admin, RESET(id), {});
}

const applyReset = (token: string) =>
  new Browser(t.app).post('/api/auth/reset-password', { token, newPassword: NEW_PASSWORD });

async function tokenRows(token: string): Promise<number> {
  const { rows } = await t.authDb.query('select 1 from verification where identifier = $1', [
    `reset-password:${token}`,
  ]);
  return rows.length;
}

// Is de tokenrij uiterlijk nu + TTL verlopen (databasetijd)?
async function expiresWithin(token: string, seconds: number): Promise<boolean | undefined> {
  const { rows } = await t.authDb.query<{ ok: boolean }>(
    `select "expiresAt" <= now() + make_interval(secs => $2) as ok from verification where identifier = $1`,
    [`reset-password:${token}`, seconds],
  );
  return rows[0]?.ok;
}

const auditRow = z.object({
  action: z.string(),
  actor_id: z.string().nullable(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});

// Zoals test/api/account-revoke.int.test.ts: lezen als app_definer (policy audit_log_definer_select).
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

describe('POST /api/accounts/:id/reset-link: rechten en invoer (spec accounts/AC-19)', () => {
  test('niet ingelogd: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), RESET('x'), {});

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('accounts/AC-19: user, ook met TOTP: 403 FORBIDDEN en geen mail', async () => {
    const target = await t.account('user', 'Doelwit');
    const user = await t.account('user', 'Gewone Gebruiker');
    await t.enableTotp(user.browser);
    const before = await mailCountNow(target.email, RESET_SUBJECT);

    const response = await requestReset(user.browser, target.userId);

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
    expect(await countMails(target.email, RESET_SUBJECT)).toBe(before);
  });

  test('accounts/AC-19: admin zonder MFA: 403 MFA_REQUIRED en geen mail', async () => {
    const target = await t.account('user', 'Doelwit');
    const zonderMfa = await t.account('admin', 'Zonder MFA');
    const before = await mailCountNow(target.email, RESET_SUBJECT);

    const response = await requestReset(zonderMfa.browser, target.userId);

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect(await countMails(target.email, RESET_SUBJECT)).toBe(before);
  });

  test.each([
    ['extra veld in de query', 'iets?rol=admin'],
    ['een id van meer dan 200 tekens', 'x'.repeat(201)],
  ])('accounts/AC-16: %s: 400 VALIDATION, vóór de handler', async (_case, id) => {
    const admin = await mfaAdmin();

    const response = await requestReset(admin.browser, id);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('accounts/AC-16: een onbekend id: 404 NOT_FOUND', async () => {
    const admin = await mfaAdmin();

    const response = await requestReset(admin.browser, 'bestaat-niet');

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
  });
});

describe('statusmapping (RLS-vangnet, randgevallen)', () => {
  test('uitgenodigd: 409 ACCOUNT_INVITED en geen resetmail', async () => {
    const admin = await mfaAdmin();
    const email = uniqueEmail('reset-uitgenodigd');
    const invite = await t.call(admin.browser, INVITE, { naam: 'Nog Niet Actief', email, rol: 'user' });
    const { id } = inviteContract.output.parse(await json(invite));

    const response = await requestReset(admin.browser, id);

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ACCOUNT_INVITED' }]);
    expect(await countMails(email, RESET_SUBJECT)).toBe(0);
  });

  test('geblokkeerd: 409 ACCOUNT_BLOCKED en geen resetmail', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geblokkeerd');
    expect((await t.call(admin.browser, BLOCK(user.userId), {})).status).toBe(200);

    const response = await requestReset(admin.browser, user.userId);

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ACCOUNT_BLOCKED' }]);
    expect(await countMails(user.email, RESET_SUBJECT)).toBe(0);
  });

  test('gedeactiveerd: 409 ACCOUNT_DEACTIVATED en geen resetmail', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Gedeactiveerd');
    expect((await t.call(admin.browser, DEACTIVATE(user.userId), {})).status).toBe(200);

    const response = await requestReset(admin.browser, user.userId);

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ACCOUNT_DEACTIVATED' }]);
    expect(await countMails(user.email, RESET_SUBJECT)).toBe(0);
  });

  test('een geweigerde aanvraag schrijft geen auditregel', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geblokkeerd');
    await t.call(admin.browser, BLOCK(user.userId), {});

    const response = await requestReset(admin.browser, user.userId);

    expect(response.status).toBe(409);
    expect(await auditRowsFor(requestIdOf(response))).toStrictEqual([]);
  });
});

describe('resetlink sturen (accounts/AC-16)', () => {
  test('accounts/AC-16: de resetmail staat in Mailpit met een link naar /uitnodiging?token=…&soort=reset', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');

    const response = await requestReset(admin.browser, user.userId);

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    const [mail] = await resetMails(user.email);
    expect(mail?.text).toContain(
      'Een beheerder heeft een link voor je aangevraagd om een nieuw wachtwoord in te stellen.',
    );
    expect(mail?.text).toContain('De link is 1 uur geldig.');
    expect(mail?.text).toContain(`${APP_ORIGIN}/uitnodiging?token=`);
    expect(mail?.text).toContain('&soort=reset');
  });

  test('accounts/AC-16: een eerdere resetlink werkt niet meer na een nieuwe', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');
    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);
    const first = resetTokenFrom((await resetMails(user.email))[0]?.text ?? '');

    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);
    const [latest] = await resetMails(user.email, 2);
    const second = resetTokenFrom(latest?.text ?? '');

    expect(second).not.toBe(first);
    expect(await tokenRows(first)).toBe(0);
    expect((await applyReset(first)).status).toBe(400);
    expect((await applyReset(second)).status).toBe(200);
  });

  test('accounts/AC-16: de tokenrij verloopt uiterlijk nu + RESET_LINK_TTL_SECONDS, ook direct nadat de mail binnen is', async () => {
    const ttl = resetTtl();
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');
    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);

    const token = resetTokenFrom((await resetMails(user.email))[0]?.text ?? '');

    expect(await expiresWithin(token, ttl)).toBe(true);
  });

  test('accounts/AC-16: twee gelijktijdige aanvragen: geen enkele tokenrij verloopt later dan nu + TTL', async () => {
    const ttl = resetTtl();
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');

    const [one, two] = await Promise.all([
      requestReset(admin.browser, user.userId),
      requestReset(admin.browser, user.userId),
    ]);

    expect([one.status, two.status]).toStrictEqual([200, 200]);
    // Na de commit lopen beide aanvragen door elkaar: de tweede kan de tokenrij van de eerste wissen, waarna die eerste fail-closed
    // geen mail stuurt. Het aantal mails is dus één of twee; de TTL-eis geldt voor elke rij die overblijft.
    await resetMails(user.email, 1);
    const { rows } = await t.authDb.query(
      `select 1 from verification where identifier like 'reset-password:%' and value = $1
         and "expiresAt" > now() + make_interval(secs => $2)`,
      [user.userId, ttl],
    );
    expect(rows).toHaveLength(0);
  });

  test('accounts/AC-16: na het instellen zijn de oude sessies weg, het oude wachtwoord werkt niet en het nieuwe wel', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');
    const second = await t.signIn(user.email);
    expect((await user.browser.get('/api/me')).status).toBe(200);
    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);
    // Het huidige wachtwoord blijft werken tot de reset.
    expect((await t.signIn(user.email)).cookies.size).toBeGreaterThan(0);

    const token = resetTokenFrom((await resetMails(user.email))[0]?.text ?? '');
    expect((await applyReset(token)).status).toBe(200);

    expect((await user.browser.get('/api/me')).status).toBe(401);
    expect((await second.get('/api/me')).status).toBe(401);
    expect(
      (await new Browser(t.app).post('/api/auth/sign-in/email', { email: user.email, password: PASSWORD })).status,
    ).not.toBe(200);
    const back = await t.signIn(user.email, NEW_PASSWORD);
    expect((await back.get('/api/me')).status).toBe(200);
  });

  test('accounts/AC-16: een inlogpoging met het oude wachtwoord vóór de reset (TOTP-uitdaging open) geeft daarna geen sessie', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Tessa Totp');
    const totpURI = await t.enableTotp(user.browser);
    const pending = new Browser(t.app);
    const attempt = await pending.post('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });
    expect(await json(attempt)).toMatchObject({ twoFactorRedirect: true });
    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);
    const token = resetTokenFrom((await resetMails(user.email))[0]?.text ?? '');
    expect((await applyReset(token)).status).toBe(200);

    const verify = await pending.post('/api/auth/two-factor/verify-totp', { code: freshTotp(totpURI) });

    expect(verify.status).not.toBe(200);
    expect((await pending.get('/api/me')).status).toBe(401);
  });

  test('accounts/AC-16: een reset wijzigt alleen het wachtwoord: TOTP blijft gevraagd bij het inloggen', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Tessa Totp');
    const totpURI = await t.enableTotp(user.browser);
    expect((await requestReset(admin.browser, user.userId)).status).toBe(200);
    const token = resetTokenFrom((await resetMails(user.email))[0]?.text ?? '');
    expect((await applyReset(token)).status).toBe(200);

    const login = new Browser(t.app);
    const response = await login.post('/api/auth/sign-in/email', { email: user.email, password: NEW_PASSWORD });

    expect(await json(response)).toMatchObject({ twoFactorRedirect: true });
    expect((await login.get('/api/me')).status).toBe(401);
    const verify = await login.post('/api/auth/two-factor/verify-totp', { code: freshTotp(totpURI) });
    expect(verify.status).toBe(200);
    expect((await login.get('/api/me')).status).toBe(200);
  });

  test('accounts/AC-16: de API staat een resetlink voor het eigen account toe', async () => {
    const admin = await mfaAdmin();

    const response = await requestReset(admin.browser, admin.userId);

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect(await resetMails(admin.email)).toHaveLength(1);
  });

  test('de audit-regel core.account.reset_link: doelaccount, actor en request_id', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Rita Reset');

    const response = await requestReset(admin.browser, user.userId);

    expect(response.status).toBe(200);
    expect(await auditRowsFor(requestIdOf(response))).toStrictEqual([
      {
        action: 'core.account.reset_link',
        actor_id: admin.userId,
        target_type: 'account',
        target_id: user.userId,
        details: {},
      },
    ]);
  });
});
