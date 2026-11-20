import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ENV_EXAMPLE, ROOT, SCRIPT, laadModule, luister, ruimOp, tijdelijk, vrijePoort } from './nieuwe-app-kit.ts';

// Tests voor de poortcontrole van scripts/dev.mjs (spec nieuwe-app-script, AC-14), geschreven vóór de bouw. De nep-`docker`
// op PATH logt elke aanroep; `docker info` slaagt, `docker compose …` mislukt zodat een run die de poortcontrole passeert
// meteen stopt. Echte listeners in het testproces; de IPv6-gevallen ook met een geïnjecteerde bind-functie (nieuwe-app.mjs).
// De standaardpoorten van de stack toetsen we met NIEUWE_APP_BEZETTE_POORTEN: echte listeners daarop racen met andere
// testbestanden die dezelfde poorten even bezetten (leerpunt #856).
afterEach(ruimOp);
const mod = await laadModule();
const DEV = path.join(ROOT, 'scripts/dev.mjs');

function fixture(envLocal: string | null): { root: string; log: string } {
  expect(existsSync(SCRIPT), 'scripts/kit/nieuwe-app.mjs bestaat: dev.mjs importeert zijn vrij-functie').toBe(true);
  const root = tijdelijk('dev-');
  mkdirSync(path.join(root, 'scripts/kit'), { recursive: true });
  mkdirSync(path.join(root, 'bin'));
  cpSync(DEV, path.join(root, 'scripts/dev.mjs'));
  cpSync(SCRIPT, path.join(root, 'scripts/kit/nieuwe-app.mjs'));
  writeFileSync(path.join(root, '.env.example'), ENV_EXAMPLE);
  if (envLocal !== null) writeFileSync(path.join(root, '.env.local'), envLocal);
  const log = path.join(root, 'docker.log');
  writeFileSync(log, '');
  writeFileSync(
    path.join(root, 'bin/docker'),
    '#!/bin/bash\nprintf "%s\\n" "$1" >> "$STUB_LOG"\nif [[ "$1" == info ]]; then exit 0; fi\nexit 1\n',
  );
  chmodSync(path.join(root, 'bin/docker'), 0o755);
  return { root, log };
}

/**
 * `bezet`: zet NIEUWE_APP_BEZETTE_POORTEN, zodat dev.mjs alleen die poorten bezet ziet en niet wat er op de host draait (een
 * andere stack, de database van check:new-resource in CI, of een parallelle test die even een standaardpoort houdt).
 */
function draai(root: string, log: string, bezet?: number[]) {
  const testBind = bezet === undefined ? {} : { NIEUWE_APP_BEZETTE_POORTEN: bezet.join(',') };
  const r = spawnSync(process.execPath, ['scripts/dev.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: { PATH: path.join(root, 'bin'), HOME: root, STUB_LOG: log, ...testBind },
  });
  return { status: r.status, uit: `${r.stdout}\n${r.stderr}`, docker: readFileSync(log, 'utf8') };
}

function envMet(api: number, web: number): string {
  return ENV_EXAMPLE.replace(/^API_PORT=.*$/m, `API_PORT=${String(api)}`).replace(
    /^WEB_PORT=.*$/m,
    `WEB_PORT=${String(web)}`,
  );
}

describe('nieuwe-app-script/AC-14: dev.mjs controleert API_PORT en WEB_PORT vóór docker compose', () => {
  test.each([
    { sleutel: 'WEB_PORT', bezet: 'web' },
    { sleutel: 'API_PORT', bezet: 'api' },
  ])(
    'nieuwe-app-script/AC-14 een bezette $sleutel stopt met exit 1 en de melding, vóór docker compose',
    async ({ sleutel, bezet }) => {
      const [bezettePoort, vrij] = [await vrijePoort(), await vrijePoort()];
      expect(await luister(bezettePoort, '127.0.0.1')).toBe(true);
      const { root, log } = fixture(bezet === 'web' ? envMet(vrij, bezettePoort) : envMet(bezettePoort, vrij));
      const r = draai(root, log);
      expect(r.status, r.uit).toBe(1);
      expect(r.uit).toContain(`✗ poort ${String(bezettePoort)} (${sleutel}) is bezet`);
      expect(r.uit).toContain('→ stop de andere pnpm dev, of kies poorten met node scripts/kit/nieuwe-app.mjs poorten');
      expect(r.docker, 'geen docker compose-aanroep').not.toContain('compose');
    },
  );

  test('nieuwe-app-script/AC-14 een listener alleen op [::1] telt als bezet (als de machine IPv6 heeft)', async () => {
    const poort = await vrijePoort();
    const metIpv6 = await luister(poort, '::1');
    if (!metIpv6) {
      // Geen IPv6 op deze machine: dan bewijst de geïnjecteerde bind-functie dezelfde regel van de gedeelde vrij-functie.
      const bind = (p: number, host: string): Promise<boolean> => Promise.resolve(!(p === poort && host === '::1'));
      expect(await mod.isVrij(poort, { bind, ipv6: true })).toBe(false);
      return;
    }
    const { root, log } = fixture(envMet(await vrijePoort(), poort));
    const r = draai(root, log);
    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain(`✗ poort ${String(poort)} (WEB_PORT) is bezet`);
    expect(r.docker).not.toContain('compose');
  });

  test('nieuwe-app-script/AC-14 WEB_PORT in .env.local op een vrije poort stopt niet op de poortcontrole, ook al is 5173 bezet', async () => {
    await luister(5173, '127.0.0.1');
    const { root, log } = fixture(envMet(await vrijePoort(), await vrijePoort()));
    const r = draai(root, log);
    expect(r.uit, 'de poortcontrole gebruikt WEB_PORT uit .env.local, niet 5173').not.toContain('is bezet');
    expect(r.docker, 'hij komt bij docker compose').toContain('compose');
  });

  test('nieuwe-app-script/AC-14 dev.mjs leest alleen API_PORT en WEB_PORT uit .env.local en valt terug op 8787 en 5173', async () => {
    const zonderApi = envMet(8787, await vrijePoort())
      .split('\n')
      .filter((regel) => !regel.startsWith('API_PORT='))
      .join('\n');
    // Of de listener lukt of 8787 al bezet was: daarna is 8787 bezet.
    await luister(8787, '127.0.0.1');
    const { root, log } = fixture(zonderApi);
    const r = draai(root, log);
    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain('✗ poort 8787 (API_PORT) is bezet');
    expect(r.docker, 'geen docker compose-aanroep').not.toContain('compose');
  });

  // Keuze bij het niet-blokkerende punt van de spec-review (AC-16, kopregel van .env.example): scripts/dev.mjs blijft een ontbrekende
  // .env.local uit .env.example kopiëren (standaardpoorten, het gedrag van vandaag); de kopregel zegt dat. Maar hij controleert de
  // standaardpoorten eerst en kopieert pas daarna: bij een bezette standaardpoort blijft .env.local weg, zodat `nieuwe-app.mjs
  // poorten --env` (de herstelregel van de melding) wel een andere set kan kiezen in plaats van de bezette poorten vast te leggen.
  test('nieuwe-app-script/AC-14 een ontbrekende .env.local wordt uit .env.example gemaakt als de standaardpoorten vrij zijn', () => {
    const { root, log } = fixture(null);
    const r = draai(root, log, []);
    expect(readFileSync(path.join(root, '.env.local'), 'utf8')).toBe(ENV_EXAMPLE);
    expect(r.docker).toContain('compose');
  });

  test('nieuwe-app-script/AC-14 zonder .env.local en met een bezette standaardpoort stopt dev.mjs en maakt .env.local niet aan', () => {
    const { root, log } = fixture(null);
    // Alleen 5173 bezet: een echte listener hier zou een eigen pnpm dev op 8787 eerst laten melden (#856).
    const r = draai(root, log, [5173]);
    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain('✗ poort 5173 (WEB_PORT) is bezet');
    expect(r.docker, 'geen docker compose-aanroep').not.toContain('compose');
    expect(existsSync(path.join(root, '.env.local')), 'de bezette poorten zijn niet vastgelegd in .env.local').toBe(
      false,
    );
  });

  // dev.mjs controleert zonder .env.local ook de standaardpoorten van de stack (Postgres, Mailpit): de stack van een andere app
  // blijft draaien na haar pnpm dev, en een kopie van .env.example zou haar poorten vastleggen.
  test.for([
    { sleutel: 'PG_PORT', veld: 'pg' },
    { sleutel: 'MAIL_UI_PORT', veld: 'mailUi' },
    { sleutel: 'SMTP_PORT', veld: 'smtp' },
  ] as const)(
    'nieuwe-app-script/AC-14 zonder .env.local en met een bezette $sleutel-standaardpoort stopt dev.mjs met melding en herstelregel',
    ({ sleutel, veld }) => {
      const poort = mod.STANDAARD_POORTEN[veld];
      const { root, log } = fixture(null);
      const r = draai(root, log, [poort]);
      expect(r.status, r.uit).toBe(1);
      expect(r.uit).toContain(`✗ poort ${String(poort)} (${sleutel}) is bezet en .env.local ontbreekt`);
      expect(r.uit).toContain('poorten --env');
      expect(r.docker, 'geen docker compose-aanroep').not.toContain('compose');
      expect(readdirSync(root), 'de bezette poort is niet vastgelegd in .env.local').not.toContain('.env.local');
    },
  );

  test('nieuwe-app-script/AC-14 dev.mjs importeert de vrij-functie uit nieuwe-app.mjs en heeft geen eigen listener', () => {
    const bron = readFileSync(DEV, 'utf8');
    expect(bron).toMatch(/import\s*\{[^}]*\bisVrij\b[^}]*\}\s*from\s*'\.\/kit\/nieuwe-app\.mjs'/);
    expect(bron).not.toContain('.listen(');
    expect(bron).not.toContain('createServer');
  });

  test('nieuwe-app-script/AC-14 het importeren van nieuwe-app.mjs start de CLI niet en schrijft niets', () => {
    expect(existsSync(SCRIPT), 'scripts/kit/nieuwe-app.mjs bestaat').toBe(true);
    const root = tijdelijk('dev-import-');
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT)}); console.log('klaar')`],
      { cwd: root, encoding: 'utf8', timeout: 20_000, env: { PATH: '/nonexistent', HOME: root } },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('klaar');
    expect(existsSync(path.join(root, '.template'))).toBe(false);
  });
});
