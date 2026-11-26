import type { Pool } from 'pg';
import { describe, expect, test, vi } from 'vitest';
import * as limits from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Mail } from '../mail/smtp.ts';
import { createAuthOptions } from './options.ts';

// sendResetPassword (spec accountbeheer-uitbreiding, accounts/AC-16): met credential-account de resetmail met TTL, zonder de
// uitnodiging (7 dagen). Zonder database: een nagebootste pool beantwoordt de twee queries uit de spec (credential-check en de
// `update … "expiresAt" = least(…)`), herkend aan hun SQL.
const ORIGIN = 'https://app.example.test';
const USER = { id: 'u1', email: 'rita@example.test', name: 'Rita' };

// De TTL staat pas na de bouw in limits.ts; tot dan faalt deze assertie, niet een import.
function resetTtl(): number {
  const value: unknown = Reflect.get(limits, 'RESET_LINK_TTL_SECONDS');
  expect(value).toBe(3600);
  return Number(value);
}

interface Fixture {
  readonly send: (token: string) => Promise<void>;
  readonly events: string[];
  readonly queries: { sql: string; params: readonly unknown[] }[];
  readonly sendMail: ReturnType<typeof vi.fn<(mail: Mail) => Promise<void>>>;
  readonly sendInvitation: ReturnType<typeof vi.fn<(invitation: { url: string }) => Promise<void>>>;
}

function fixture(options: { credential?: boolean; updated?: boolean; mail?: boolean } = {}): Fixture {
  const { credential = true, updated = true, mail = true } = options;
  const events: string[] = [];
  const queries: Fixture['queries'] = [];
  const query = (sql: string, params: readonly unknown[] = []) => {
    queries.push({ sql, params });
    if (/^\s*update/i.test(sql)) {
      events.push('update');
      return Promise.resolve({ rows: [], rowCount: updated ? 1 : 0 });
    }
    events.push('select');
    return Promise.resolve({ rows: credential ? [{}] : [], rowCount: credential ? 1 : 0 });
  };
  const client = { query, release: () => undefined };
  const pool = unsafeCast<Pool>(
    { query, connect: () => Promise.resolve(client) },
    'test: alleen query en connect worden gebruikt',
  );
  const sendMail = vi.fn<(mail: Mail) => Promise<void>>(() => {
    events.push('mail');
    return Promise.resolve();
  });
  const sendInvitation = vi.fn<(invitation: { url: string }) => Promise<void>>(() => {
    events.push('invitation');
    return Promise.resolve();
  });
  const config = {
    origin: ORIGIN,
    secret: 'x'.repeat(32),
    sendInvitation,
    appName: 'Voorbeeld',
    ...(mail ? { sendMail } : {}),
  };
  const sendResetPassword = createAuthOptions(config, pool).emailAndPassword.sendResetPassword;
  type Arg = Parameters<typeof sendResetPassword>[0];
  const send = (token: string) =>
    sendResetPassword(unsafeCast<Arg>({ user: USER, url: '', token }, 'test: alleen user en token worden gelezen'));
  return { send, events, queries, sendMail, sendInvitation };
}

describe('sendResetPassword: keuze tussen resetmail en uitnodiging', () => {
  test('accounts/AC-16: RESET_LINK_TTL_SECONDS is 1 uur', () => {
    expect(resetTtl()).toBe(3600);
  });

  test('accounts/AC-16: met een credential-account: eerst de expiresAt verkorten tot de TTL, dan de resetmail met soort=reset', async () => {
    const ttl = resetTtl();
    const { send, events, queries, sendMail, sendInvitation } = fixture();

    await send('tok en/1');

    const update = queries.find((query) => /^\s*update/i.test(query.sql));
    expect(update).toBeDefined();
    expect(JSON.stringify([update?.sql, update?.params])).toContain(String(ttl));
    expect(update?.sql).toContain('least');
    expect(events.indexOf('update')).toBeLessThan(events.indexOf('mail'));
    expect(sendInvitation).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledOnce();
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail?.to).toBe(USER.email);
    expect(mail?.subject).toBe('Nieuw wachtwoord instellen voor Voorbeeld');
    expect(mail?.text).toContain(
      'Een beheerder heeft een link voor je aangevraagd om een nieuw wachtwoord in te stellen.',
    );
    expect(mail?.text).toContain('De link is 1 uur geldig.');
    expect(mail?.text).toContain(`${ORIGIN}/uitnodiging?token=${encodeURIComponent('tok en/1')}&soort=reset`);
    expect(mail?.html).toContain('Wachtwoord instellen');
  });

  test('accounts/AC-16: zonder credential-account (uitnodiging): de uitnodiging van 7 dagen, geen update en geen resetmail', async () => {
    const { send, queries, sendMail, sendInvitation } = fixture({ credential: false });

    await send('abc');

    expect(sendInvitation).toHaveBeenCalledWith(expect.objectContaining({ url: `${ORIGIN}/uitnodiging?token=abc` }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(queries.some((query) => /^\s*update/i.test(query.sql))).toBe(false);
  });

  test('accounts/AC-16: geeft de update geen rij, dan een fout en geen mail (fail-closed)', async () => {
    const { send, sendMail, sendInvitation } = fixture({ updated: false });

    await expect(send('abc')).rejects.toThrow();

    expect(sendMail).not.toHaveBeenCalled();
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  test('accounts/AC-16: met credential maar zonder sendMail een fout, geen terugval op de uitnodiging', async () => {
    const { send, sendInvitation } = fixture({ mail: false });

    await expect(send('abc')).rejects.toThrow();

    expect(sendInvitation).not.toHaveBeenCalled();
  });
});
