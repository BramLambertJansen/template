import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { PLUS_TIEN, ROOT, envLocalVoor, git, ruimOp, tijdelijk, vindCommando } from './nieuwe-app-kit.ts';

// Tests voor het resultaatbestand van scripts/doctor.sh (spec nieuwe-app-script, AC-13), geschreven vóór de bouw. Aanvulling op
// test/scripts/doctor.test.ts (daar blijft alles ongewijzigd); dezelfde nep-commando's, maar de fixture is een echte git-repo
// zodat `head` een sha kan zijn. De afbreking vóór de telling komt van een sysctl-stub die een onzin-waarde geeft: `((watches
// >= 524288))` met `set -u` stopt het script dan midden in de controles, buiten elke ok/fail.
afterEach(ruimOp);

const Uitslag = z.object({
  schema: z.literal(1),
  tijd: z.string(),
  head: z.string().nullable(),
  uitslag: z.enum(['ok', 'fout']),
  stappen: z.array(z.unknown()),
});

function stub(root: string, naam: string, body: string): void {
  const bestand = path.join(root, 'bin', naam);
  writeFileSync(bestand, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(bestand, 0o755);
}

function fixture(): string {
  const root = tijdelijk('doctor-resultaat-');
  for (const map of ['bin', 'scripts', '.template']) mkdirSync(path.join(root, map), { recursive: true });
  for (const bestand of ['mise.toml', 'package.json', 'scripts/doctor.sh'])
    cpSync(path.join(ROOT, bestand), path.join(root, bestand));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fixture');
  writeFileSync(path.join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nlefthook run pre-commit\n');
  chmodSync(path.join(root, '.git/hooks/pre-commit'), 0o755);
  writeFileSync(path.join(root, 'os-release'), 'ID=ubuntu\nVERSION_ID="24.04"\n');
  symlinkSync(vindCommando('git'), path.join(root, 'bin/git'));
  stub(
    root,
    'mise',
    `if [[ "\${1:-}" != exec || "\${4:-}" != --version && "\${4:-}" != version ]]; then exit 0; fi
tool="$3"
if [[ "$tool" == pnpm ]]; then sed -nE 's/.*"packageManager": "pnpm@([^"]+)".*/\\1/p' package.json
else
  version=$(sed -nE 's/^'"$tool"' = "([^"]+)"/\\1/p' mise.toml)
  [[ "$tool" == node ]] && printf v
  printf '%s\\n' "$version"
fi`,
  );
  stub(root, 'sysctl', '[[ "$*" == *max_user_watches* ]] && echo "${STUB_WATCHES:-524288}" || echo 0');
  stub(root, 'timeout', '[[ "$STUB_STACK" == up ]]');
  for (const tool of ['bwrap', 'docker', 'gh', 'jq', 'socat']) stub(root, tool, 'true');
  return root;
}

interface Opties {
  stack?: boolean;
  watches?: string;
}

function draai(root: string, args: string[], opties: Opties = {}) {
  const r = spawnSync('bash', [path.join(root, 'scripts/doctor.sh'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: root,
      PATH: `${root}/bin:/usr/bin:/bin`,
      STUB_STACK: opties.stack === true ? 'up' : 'down',
      STUB_WATCHES: opties.watches ?? '524288',
      DOCTOR_OS_RELEASE: path.join(root, 'os-release'),
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function leesUitslag(root: string, naam: string): z.infer<typeof Uitslag> {
  const bestand = path.join(root, '.template', naam);
  expect(existsSync(bestand), `${naam} bestaat`).toBe(true);
  return Uitslag.parse(JSON.parse(readFileSync(bestand, 'utf8')));
}

function schrijfEnvLocal(root: string, tekst: string): void {
  writeFileSync(path.join(root, '.env.local'), tekst);
}

const MET_VERSCHIL = envLocalVoor(PLUS_TIEN).replace(/^(DATABASE_URL=.*):54332\//m, '$1:54322/');

describe('nieuwe-app-script/AC-13: doctor controleert de poortsamenhang en schrijft een resultaatbestand', () => {
  test.each([
    { args: ['--machine'], naam: 'doctor-machine.json', opties: {} },
    { args: [], naam: 'doctor-full.json', opties: { stack: true } },
  ])(
    'nieuwe-app-script/AC-13 een poort in DATABASE_URL die niet bij PG_PORT past geeft exit 1 ($naam fout)',
    ({ args, naam, opties }) => {
      const root = fixture();
      schrijfEnvLocal(root, MET_VERSCHIL);
      expect(MET_VERSCHIL, 'de fixture wijkt echt af').not.toBe(envLocalVoor(PLUS_TIEN));
      const r = draai(root, args, opties);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toContain('✗ .env.local: poort in DATABASE_URL past niet bij PG_PORT');
      expect(r.stdout).toContain(
        '→ node scripts/kit/nieuwe-app.mjs poorten; .env.local alleen met akkoord van de eigenaar aanpassen',
      );
      expect(leesUitslag(root, naam).uitslag).toBe('fout');
      for (const geheim of ['api_user:api_user', 'local-demo-secret'])
        expect(`${r.stdout}${r.stderr}`, 'alleen poorten, nooit waarden').not.toContain(geheim);
    },
  );

  test.each([
    { args: ['--machine'], naam: 'doctor-machine.json', opties: {} },
    { args: [], naam: 'doctor-full.json', opties: { stack: true } },
  ])(
    'nieuwe-app-script/AC-13 een samenhangende .env.local geeft exit 0 en uitslag ok in $naam',
    ({ args, naam, opties }) => {
      const root = fixture();
      schrijfEnvLocal(root, envLocalVoor(PLUS_TIEN));
      const r = draai(root, args, opties);
      expect(r.status, r.stdout).toBe(0);
      const uitslag = leesUitslag(root, naam);
      expect(uitslag.uitslag).toBe('ok');
      expect(uitslag.head).toBe(git(root, 'rev-parse', 'HEAD'));
      expect(Date.parse(uitslag.tijd)).not.toBeNaN();
    },
  );

  test('nieuwe-app-script/AC-13 zonder .env.local geen poortmelding en uitslag ok', () => {
    const root = fixture();
    const r = draai(root, ['--machine']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).not.toContain('.env.local');
    expect(leesUitslag(root, 'doctor-machine.json').uitslag).toBe('ok');
  });

  test('nieuwe-app-script/AC-13 de poortcontrole noemt ook APP_ORIGIN als de webpoort niet klopt', () => {
    const root = fixture();
    schrijfEnvLocal(root, envLocalVoor(PLUS_TIEN).replace(/^APP_ORIGIN=.*$/m, 'APP_ORIGIN=http://localhost:5173'));
    const r = draai(root, ['--machine']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('✗ .env.local: poort in APP_ORIGIN past niet bij WEB_PORT');
  });

  test('nieuwe-app-script/AC-13 --quick schrijft geen bestand en laat een bestaand bestand staan', () => {
    const root = fixture();
    const bestand = path.join(root, '.template', 'doctor-full.json');
    writeFileSync(bestand, '{"oud":true}');
    const voor = readdirSync(path.join(root, '.template'));
    const r = draai(root, ['--quick']);
    expect(r.status).toBe(0);
    expect(readdirSync(path.join(root, '.template'))).toStrictEqual(voor);
    expect(readFileSync(bestand, 'utf8')).toBe('{"oud":true}');
  });

  test('nieuwe-app-script/AC-13 een doctor die vóór de telling afbreekt zet een oud ok-bestand op fout met een nieuwe tijd', () => {
    const root = fixture();
    const bestand = path.join(root, '.template', 'doctor-full.json');
    const oudeTijd = '2020-01-01T00:00:00.000Z';
    writeFileSync(
      bestand,
      JSON.stringify({
        schema: 1,
        commando: 'doctor-full',
        tijd: oudeTijd,
        head: null,
        dryRun: false,
        uitslag: 'ok',
        stappen: [],
      }),
    );
    const r = draai(root, [], { stack: true, watches: 'abc' });
    expect(r.status, 'de doctor brak af').not.toBe(0);
    expect(r.stdout, 'de doctor brak af vóór de telling').not.toContain('probleem/problemen');
    const uitslag = leesUitslag(root, 'doctor-full.json');
    expect(uitslag.uitslag).toBe('fout');
    expect(Date.parse(uitslag.tijd)).toBeGreaterThan(Date.parse(oudeTijd));
  });

  test('nieuwe-app-script/AC-13 een afbreking in --machine laat ook doctor-machine.json op fout staan', () => {
    const root = fixture();
    writeFileSync(
      path.join(root, '.template', 'doctor-machine.json'),
      JSON.stringify({
        schema: 1,
        commando: 'doctor-machine',
        tijd: '2020-01-01T00:00:00.000Z',
        head: null,
        dryRun: false,
        uitslag: 'ok',
        stappen: [],
      }),
    );
    const r = draai(root, ['--machine'], { watches: 'abc' });
    expect(r.status).not.toBe(0);
    expect(leesUitslag(root, 'doctor-machine.json').uitslag).toBe('fout');
  });
});
