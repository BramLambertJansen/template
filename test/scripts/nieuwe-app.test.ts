import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ROOT,
  SCRIPT,
  draai,
  eisScript,
  git,
  leesResultaat,
  luister,
  maakFixture,
  gestarteNepCommandos,
  resultaatPad,
  ruimOp,
  stapStatus,
  stap,
  tijdelijk,
  type Fixture,
} from './nieuwe-app-kit.ts';

// Tests voor scripts/kit/nieuwe-app.mjs (spec docs/template/specs/nieuwe-app-script.md, bouwstap 1), geschreven vóór de bouw.
// Hier: AC-1 (geen docker, pnpm, npm, sudo; alleen node:-imports), AC-2 (resultaatbestand en exitcodes) en AC-12 (preflight).
// koppel staat in nieuwe-app-koppel.test.ts, poorten in nieuwe-app-poorten.test.ts, db-bewijs in nieuwe-app-db-bewijs.test.ts.
afterEach(ruimOp);

const GEBRUIK =
  'Gebruik: node scripts/kit/nieuwe-app.mjs <preflight|koppel|poorten|repo-instellingen|db-bewijs> [opties] [--dry-run]';

function bron(): string {
  eisScript();
  return readFileSync(SCRIPT, 'utf8');
}

describe('nieuwe-app-script/AC-1: geen docker, pnpm, npm of sudo, en alleen node:-imports', () => {
  const DEELCOMMANDOS: string[][] = [
    ['preflight'],
    ['koppel'],
    ['poorten'],
    ['poorten', '--env'],
    ['db-bewijs', '--pg', '54332'],
  ];

  test.each(DEELCOMMANDOS)(
    'nieuwe-app-script/AC-1 %s start geen docker, pnpm, npm of sudo, ook niet met --dry-run',
    (...args) => {
      for (const extra of [[], ['--dry-run']]) {
        const fx = maakFixture();
        draai(fx, [...args, ...extra]);
        expect(gestarteNepCommandos(fx), `${args.join(' ')} ${extra.join(' ')}: een nep-commando is gestart`).toBe('');
      }
    },
  );

  test('nieuwe-app-script/AC-1 de statische imports hebben alleen het voorvoegsel node: en er is geen dynamische import()', () => {
    const tekst = bron();
    const statisch = [...tekst.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm)].map(
      (m) => m[1] ?? '',
    );
    const kaal = [...tekst.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '');
    const imports = [...statisch, ...kaal];
    expect(imports.length, 'het script importeert minstens node:util en node:child_process').toBeGreaterThan(1);
    expect(imports.filter((naam) => !naam.startsWith('node:'))).toStrictEqual([]);
    // bouwstap 1: geen dynamische import; bouwstap 2 voegt alleen die van pr-merge.mjs toe (repo-instellingen).
    expect([...tekst.matchAll(/\bimport\s*\(/g)]).toHaveLength(0);
  });

  test('nieuwe-app-script/AC-1 het script roept docker, pnpm, npm, sudo en git push niet aan (statische bron)', () => {
    const tekst = bron();
    for (const verboden of [
      "'docker'",
      '"docker"',
      "'pnpm'",
      '"pnpm"',
      "'npm'",
      '"npm"',
      "'sudo'",
      '"sudo"',
      "'push'",
      '"push"',
    ])
      expect(tekst, `de bron noemt ${verboden}`).not.toContain(verboden);
  });
});

describe('nieuwe-app-script/AC-2: resultaatbestand, exitcode en gebruik', () => {
  function controleer(fx: Fixture, commando: string, status: number | null): void {
    const resultaat = leesResultaat(fx.repo, commando);
    expect(resultaat.commando).toBe(commando);
    expect(resultaat.head, 'head is git rev-parse HEAD na de run').toBe(git(fx.repo, 'rev-parse', 'HEAD'));
    expect(resultaat.uitslag === 'ok', `uitslag ${resultaat.uitslag} past bij exitcode ${String(status)}`).toBe(
      status === 0,
    );
    expect(resultaat.stappen.length).toBeGreaterThan(0);
    for (const s of resultaat.stappen) {
      expect(s.melding).not.toBe('');
      if (s.status === 'fout') expect(s.herstel, `stap ${s.id} is fout: herstel is niet null`).not.toBeNull();
    }
  }

  test.each([
    { commando: 'preflight', args: ['preflight'] },
    { commando: 'koppel', args: ['koppel'] },
    { commando: 'poorten', args: ['poorten'] },
    { commando: 'db-bewijs', args: ['db-bewijs', '--pg', '54332'] },
  ])(
    'nieuwe-app-script/AC-2 $commando schrijft <git-root>/.template/nieuwe-app-$commando.json, ook vanuit een submap',
    ({ commando, args }) => {
      const fx = maakFixture();
      const sub = path.join(fx.repo, 'db', 'migrations');
      const r = draai(fx, args, { cwd: sub });
      controleer(fx, commando, r.status);
      expect(readdirSync(sub), 'niet in de submap').not.toContain('.template');
      expect(r.stdout).toMatch(
        new RegExp(`^(?:✗ )?nieuwe-app ${commando}: .* → \\.template/nieuwe-app-${commando}\\.json$`, 'm'),
      );
    },
  );

  test('nieuwe-app-script/AC-2 de slotregel van een geslaagde en een mislukte run', () => {
    const ok = draai(maakFixture(), ['db-bewijs', '--pg', '54332']);
    expect(ok.status, ok.uit).toBe(0);
    expect(ok.stdout).toMatch(/^nieuwe-app db-bewijs: ok \(6 stappen\) → \.template\/nieuwe-app-db-bewijs\.json$/m);
    const fout = draai(maakFixture(), ['db-bewijs']);
    expect(fout.status).toBe(1);
    expect(fout.stdout).toMatch(/^✗ nieuwe-app db-bewijs: 1 fout\(en\) → \.template\/nieuwe-app-db-bewijs\.json$/m);
  });

  test('nieuwe-app-script/AC-2 .template/ staat in .gitignore van de template', () => {
    const r = git(ROOT, 'check-ignore', '.template/x');
    expect(r).toBe('.template/x');
  });

  test('nieuwe-app-script/AC-2 buiten een git-repo schrijft preflight naar $HOME/setup/.template/ met head null', () => {
    const fx = maakFixture();
    const buiten = tijdelijk('nieuwe-app-buiten-');
    const r = draai(fx, ['preflight'], { cwd: buiten });
    const resultaat = leesResultaat(path.join(fx.home, 'setup'), 'preflight');
    expect(resultaat.head).toBeNull();
    expect(resultaat.uitslag === 'ok', r.uit).toBe(r.status === 0);
    expect(existsSync(path.join(buiten, '.template')), 'niet in de werkmap').toBe(false);
  });

  test('nieuwe-app-script/AC-2 een onbekende optie geeft exitcode 2 en haalt het oude resultaatbestand weg', () => {
    const fx = maakFixture();
    const oud = resultaatPad(fx.repo, 'poorten');
    mkdirSync(path.dirname(oud), { recursive: true });
    writeFileSync(oud, JSON.stringify({ schema: 1, uitslag: 'ok' }));
    const r = draai(fx, ['poorten', '--onbekend']);
    expect(r.status, r.uit).toBe(2);
    expect(existsSync(oud), 'het oude bestand is weg').toBe(false);
  });

  test('nieuwe-app-script/AC-2 een onbekend deelcommando geeft exitcode 2, de gebruiksregel en geen nieuw bestand', () => {
    const fx = maakFixture();
    const map = path.join(fx.repo, '.template');
    mkdirSync(map);
    writeFileSync(path.join(map, 'nieuwe-app-poorten.json'), '{"oud":true}');
    for (const args of [['onbekend'], []]) {
      const r = draai(fx, args);
      expect(r.status, r.uit).toBe(2);
      expect(r.uit).toContain(GEBRUIK);
      expect(readdirSync(map)).toStrictEqual(['nieuwe-app-poorten.json']);
      expect(readFileSync(path.join(map, 'nieuwe-app-poorten.json'), 'utf8')).toBe('{"oud":true}');
    }
  });

  test('nieuwe-app-script/AC-2 een aflopend resultaatbestand van de vorige run is bij de start weg (afgebroken run)', () => {
    const fx = maakFixture();
    draai(fx, ['db-bewijs', '--pg', '54332']);
    const eerste = leesResultaat(fx.repo, 'db-bewijs');
    expect(eerste.uitslag).toBe('ok');
    const tweede = draai(fx, ['db-bewijs']);
    expect(tweede.status).toBe(1);
    expect(leesResultaat(fx.repo, 'db-bewijs').uitslag, 'geen oude ok blijft staan').toBe('fout');
  });
});

describe('nieuwe-app-script/AC-12: preflight', () => {
  const fixture = (extra: Parameters<typeof maakFixture>[0] = {}): Fixture => maakFixture(extra);
  const preflight = (fx: Fixture, env: Record<string, string> = {}, args: string[] = []) => {
    const r = draai(fx, ['preflight', ...args], { env });
    return { r, resultaat: leesResultaat(fx.repo, 'preflight') };
  };

  test('nieuwe-app-script/AC-12 een geldige fixture geeft exitcode 0 en de slotregel', () => {
    const { r, resultaat } = preflight(fixture(), {}, ['--slug', 'mijn-app', '--zichtbaarheid', 'public']);
    expect(r.status, r.uit).toBe(0);
    expect(r.stdout).toMatch(/^nieuwe-app preflight: ok \(\d+ stappen\) → \.template\/nieuwe-app-preflight\.json$/m);
    for (const id of ['os', 'pad', 'tools', 'inotify', 'gh-login', 'template', 'slug'])
      expect(stapStatus(resultaat, id), id).toBe('ok');
  });

  test.each([
    { naam: 'Ubuntu 22.04', inhoud: 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="22.04"\n', bevat: '22.04' },
    { naam: 'macOS (geen /etc/os-release)', inhoud: null, bevat: '' },
  ])('nieuwe-app-script/AC-12 os is fout bij $naam', ({ inhoud, bevat }) => {
    const fx = fixture();
    const env: Record<string, string> = {};
    if (inhoud === null) env['NIEUWE_APP_OS_RELEASE'] = path.join(fx.home, 'bestaat-niet');
    else writeFileSync(path.join(fx.home, 'bestanden', 'os-release'), inhoud);
    const { r, resultaat } = preflight(fx, env);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'os')).toBe('fout');
    expect(r.stdout).toContain('✗ besturingssysteem niet ondersteund: ');
    expect(r.stdout).toContain(bevat);
    expect(r.stdout).toContain('→ deze setup ondersteunt Ubuntu 24.04 en 26.04 (START-NIEUWE-APP.md)');
  });

  test.each(['24.04', '26.04'])('nieuwe-app-script/AC-12 os is ok bij Ubuntu %s', (versie) => {
    const fx = fixture();
    writeFileSync(path.join(fx.home, 'bestanden', 'os-release'), `ID=ubuntu\nVERSION_ID="${versie}"\n`);
    expect(stapStatus(preflight(fx).resultaat, 'os')).toBe('ok');
  });

  test.each(['/mnt/c/Users/bmj/code/app', '/mnt/d'])('nieuwe-app-script/AC-12 pad is fout onder %s', (werkmap) => {
    const { r, resultaat } = preflight(fixture(), { NIEUWE_APP_WERKMAP: werkmap });
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'pad')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 pad is ok op ext4 (/home/…)', () => {
    expect(stapStatus(preflight(fixture(), { NIEUWE_APP_WERKMAP: '/home/bmj/code/app' }).resultaat, 'pad')).toBe('ok');
  });

  test('nieuwe-app-script/AC-12 systemd is fout in WSL zonder systemd als PID 1', () => {
    const fx = fixture();
    writeFileSync(path.join(fx.home, 'bestanden', 'pid1'), 'init\n');
    const { r, resultaat } = preflight(fx);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'systemd')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 buiten WSL telt PID 1 niet (systemd is niet fout)', () => {
    const fx = fixture();
    writeFileSync(path.join(fx.home, 'bestanden', 'pid1'), 'init\n');
    const env = { ...fx.env };
    Reflect.deleteProperty(env, 'WSL_DISTRO_NAME');
    const r = draai({ ...fx, env }, ['preflight']);
    expect(stapStatus(leesResultaat(fx.repo, 'preflight'), 'systemd')).not.toBe('fout');
    expect(r.stdout).not.toContain('✗ systemd');
  });

  test('nieuwe-app-script/AC-12 tools is fout zonder psql, met psql in de melding', () => {
    const { r, resultaat } = preflight(fixture({ zonderPsql: true }));
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'tools')).toBe('fout');
    expect(stap(resultaat, 'tools').melding).toContain('psql');
  });

  test('nieuwe-app-script/AC-12 tools is fout zonder ~/.local/bin/mise', () => {
    const fx = maakFixture();
    rmSync(path.join(fx.home, '.local', 'bin', 'mise'));
    const r = draai(fx, ['preflight']);
    expect(r.status).toBe(1);
    const resultaat = leesResultaat(fx.repo, 'preflight');
    expect(stapStatus(resultaat, 'tools')).toBe('fout');
    expect(stap(resultaat, 'tools').melding).toContain('mise');
  });

  test('nieuwe-app-script/AC-12 inotify is fout bij 8192 en ok bij 524288', () => {
    const fx = fixture();
    writeFileSync(path.join(fx.home, 'bestanden', 'inotify'), '8192\n');
    const { r, resultaat } = preflight(fx);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'inotify')).toBe('fout');
    writeFileSync(path.join(fx.home, 'bestanden', 'inotify'), '524288\n');
    expect(stapStatus(preflight(fx).resultaat, 'inotify')).toBe('ok');
  });

  test('nieuwe-app-script/AC-12 gh-login is fout zonder de scope workflow', () => {
    const fx = fixture({
      gh: (db) => ({
        ...db,
        authStatus:
          "github.com\n  ✓ Logged in to github.com account tester (keyring)\n  - Token scopes: 'gist', 'repo'\n",
        scopes: 'gist, repo',
      }),
    });
    const { r, resultaat } = preflight(fx);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'gh-login')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 template is fout als de repo geen template is', () => {
    const fx = fixture({
      gh: (db) => ({
        ...db,
        api: { ...db.api, 'repos/owner/template': { is_template: false, full_name: 'owner/template' } },
      }),
    });
    const { r, resultaat } = preflight(fx);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'template')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 plan is fout bij null met --zichtbaarheid private, en alleen dan', () => {
    const fx = fixture({
      gh: (db) => ({ ...db, api: { ...db.api, user: { login: 'tester', plan: { name: null } } } }),
    });
    const prive = preflight(fx, {}, ['--zichtbaarheid', 'private']);
    expect(prive.r.status).toBe(1);
    expect(stapStatus(prive.resultaat, 'plan')).toBe('fout');
    const openbaar = preflight(fx, {}, ['--zichtbaarheid', 'public']);
    expect(openbaar.r.status, openbaar.r.uit).toBe(0);
  });

  test('nieuwe-app-script/AC-12 plan is ok met een bekend plan en private', () => {
    const { r, resultaat } = preflight(fixture(), {}, ['--zichtbaarheid', 'private']);
    expect(r.status, r.uit).toBe(0);
    expect(stapStatus(resultaat, 'plan')).toBe('ok');
  });

  test('nieuwe-app-script/AC-12 poorten is overgeslagen (exitcode 0) bij een bezette 5173', async () => {
    await luister(5173, '127.0.0.1');
    const { r, resultaat } = preflight(fixture());
    expect(r.status, r.uit).toBe(0);
    expect(stapStatus(resultaat, 'poorten')).toBe('overgeslagen');
    expect(stap(resultaat, 'poorten').melding).toContain('poorten');
  });

  test('nieuwe-app-script/AC-12 slug is fout als ~/code/<slug> bestaat met een andere origin', () => {
    const fx = fixture();
    const doel = path.join(fx.home, 'code', 'mijn-app');
    mkdirSync(doel, { recursive: true });
    git(doel, 'init', '-q', '-b', 'main');
    git(doel, 'remote', 'add', 'origin', 'https://github.com/iemand-anders/mijn-app.git');
    const { r, resultaat } = preflight(fx, {}, ['--slug', 'mijn-app']);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'slug')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 slug is overgeslagen met de hervattingsmelding als de origin <login>/<slug> is', () => {
    const fx = fixture({
      gh: (db) => ({
        ...db,
        api: { ...db.api, 'repos/tester/mijn-app': { is_template: false, full_name: 'tester/mijn-app' } },
      }),
    });
    const doel = path.join(fx.home, 'code', 'mijn-app');
    mkdirSync(doel, { recursive: true });
    git(doel, 'init', '-q', '-b', 'main');
    git(doel, 'remote', 'add', 'origin', 'https://github.com/tester/mijn-app.git');
    const { r, resultaat } = preflight(fx, {}, ['--slug', 'mijn-app']);
    expect(r.status, r.uit).toBe(0);
    expect(stapStatus(resultaat, 'slug')).toBe('overgeslagen');
    expect(r.stdout).toContain('· hervatting: controleer SETUP-PROGRESS.md (overgeslagen)');
  });

  test('nieuwe-app-script/AC-12 slug is fout als <login>/<slug> al bestaat op GitHub en ~/code/<slug> niet bestaat', () => {
    const fx = fixture({
      gh: (db) => ({
        ...db,
        api: { ...db.api, 'repos/tester/bezet': { is_template: false, full_name: 'tester/bezet' } },
      }),
    });
    const { r, resultaat } = preflight(fx, {}, ['--slug', 'bezet']);
    expect(r.status).toBe(1);
    expect(stapStatus(resultaat, 'slug')).toBe('fout');
  });

  test('nieuwe-app-script/AC-12 een ongeldige slug is fout, een geldige niet', () => {
    const fx = fixture();
    for (const slug of ['Mijn-App', '1app', 'a--b', 'a_b', 'a'.repeat(51)]) {
      expect(stapStatus(preflight(fx, {}, ['--slug', slug]).resultaat, 'slug'), slug).toBe('fout');
    }
    for (const slug of ['a', 'mijn-app', `a${'b'.repeat(49)}`]) {
      expect(stapStatus(preflight(fx, {}, ['--slug', slug]).resultaat, 'slug'), slug).toBe('ok');
    }
  });

  test('nieuwe-app-script/AC-12 de slugregel is gelijk aan die van scripts/kit/app-init.mjs', () => {
    const appInit = readFileSync(path.join(ROOT, 'scripts/kit/app-init.mjs'), 'utf8');
    const regel = (tekst: string, naam: string): string | undefined =>
      new RegExp(`^const ${naam} = (.+);$`, 'm').exec(tekst)?.[1];
    for (const naam of ['SLUG', 'MAX_SLUG']) {
      expect(regel(appInit, naam), `app-init.mjs heeft ${naam}`).toBeDefined();
      expect(regel(bron(), naam), `nieuwe-app.mjs heeft een gekopieerde ${naam}`).toBe(regel(appInit, naam));
    }
  });
});
