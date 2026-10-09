// Lokale seed (spec accountbeheer): vaste accounts per rol, de admin met vast TOTP-geheim. Idempotent; draait in `pnpm dev`
// na de migraties en via `pnpm db:seed`. Weigert buiten APP_ENV=local of tegen een niet-lokale database.
import { symmetricEncrypt } from 'better-auth/crypto';
import pg from 'pg';
import { createAuth } from '../src/core/api/auth/index.ts';
import { SEED_ACCOUNTS, SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from '../src/core/api/dev/seed-accounts.ts';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt (.env.local)`);
  return value;
}

const authUrl = required('AUTH_DATABASE_URL');
const migratorUrl = required('MIGRATOR_DATABASE_URL');
if (process.env['APP_ENV'] !== 'local')
  throw new Error(`seed weigert: APP_ENV is '${String(process.env['APP_ENV'])}', alleen 'local'`);
for (const url of [authUrl, migratorUrl]) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`seed weigert: database op '${host}' is niet lokaal`);
}

const auth = createAuth({
  origin: required('APP_ORIGIN'),
  secret: required('AUTH_SECRET'),
  databaseUrl: authUrl,
  sendInvitation: async () => undefined,
});
const context = await auth.$context;
const migrator = new pg.Pool({ connectionString: migratorUrl, max: 1 });

try {
  for (const account of SEED_ACCOUNTS) {
    let user = await context.internalAdapter.findUserByEmail(account.email);
    if (user === null) {
      const created = await context.internalAdapter.createUser(
        { email: account.email, name: account.name, emailVerified: true },
        { method: 'admin' },
      );
      await context.internalAdapter.createAccount({
        userId: created.id,
        providerId: 'credential',
        accountId: created.id,
        password: await context.password.hash(SEED_DEMO_WACHTWOORD),
      });
      user = { user: created, accounts: [] };
    }
    if (account.role === 'admin') await ensureTotp(user.user.id);
    await migrator.query('select app.assign_role($1, $2)', [user.user.id, account.role]);
    console.info(`✓ ${account.email} (${account.role})`);
  }
} finally {
  await migrator.end();
}
// De pool van Better Auth zit in createAuth en zou het proces nog openhouden.
process.exit(process.exitCode ?? 0);

/** @param {string} userId */
async function ensureTotp(userId) {
  const existing = await context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: userId }] });
  if (existing !== null) return;
  await context.adapter.create({
    model: 'twoFactor',
    data: {
      userId,
      secret: await symmetricEncrypt({ key: context.secretConfig, data: SEED_ADMIN_TOTP_SLEUTEL }),
      backupCodes: '[]',
      verified: true,
    },
  });
  await context.internalAdapter.updateUser(userId, { twoFactorEnabled: true });
}
