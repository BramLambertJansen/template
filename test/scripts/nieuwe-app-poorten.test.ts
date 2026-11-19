import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ENV_EXAMPLE,
  PLUS_TIEN,
  ROOT,
  draai,
  envLocalVoor,
  gegeven,
  git,
  laadModule,
  leesResultaat,
  luister,
  maakFixture,
  psqlLog,
  ruimOp,
  schrijvendeGhAanroepen,
  stapStatus,
  vrijePoort,
  type Bind,
  type Fixture,
} from './nieuwe-app-kit.ts';

// Tests voor `poorten` van scripts/kit/nieuwe-app.mjs (spec nieuwe-app-script: AC-5 voor poorten --env, AC-6, AC-7, AC-8 en
// AC-18), geschreven vóór de bouw. De poortkeuze is ook als functie getest met een geïnjecteerde bind-functie, zodat de
// IPv6-gevallen ook op een machine zonder IPv6 kunnen falen; daarnaast echte listeners in het testproces.
afterEach(ruimOp);
const mod = await laadModule();

const SLEUTELS = [
  'PG_PORT',
  'MAIL_UI_PORT',
  'SMTP_PORT',
  'API_PORT',
  'WEB_PORT',
  'DATABASE_URL',
  'AUTH_DATABASE_URL',
  'MIGRATOR_DATABASE_URL',
  'SMTP_URL',
  'APP_ORIGIN',
  'AUTH_BASE_URL',
];
const URL_SLEUTELS = ['DATABASE_URL', 'AUTH_DATABASE_URL', 'MIGRATOR_DATABASE_URL', 'SMTP_URL'];

/** Een bind-functie die alleen de opgegeven (poort, host)-paren bezet meldt; zonder host: elke host. */
function bezet(paren: [number, string?][]): Bind {
  return (poort, host) => Promise.resolve(!paren.some(([p, h]) => p === poort && (h === undefined || h === host)));
}
const PLUS_NUL = { pg: 54322, mailUi: 54324, smtp: 54325, api: 8787, web: 5173 };

function schrijfEnv(fx: Fixture, inhoud: string): string {
  const bestand = path.join(fx.repo, '.env.local');
  writeFileSync(bestand, inhoud);
  return bestand;
}

function sleutelWaarden(tekst: string): Map<string, string> {
  const uit = new Map<string, string>();
  for (const regel of tekst.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(regel);
    if (m !== null) uit.set(m[1] ?? '', m[2] ?? '');
  }
  return uit;
}

describe('nieuwe-app-script/AC-6: poortkeuze', () => {
  test('nieuwe-app-script/AC-6 bij een bezette 54324 zijn alle vijf poorten basis + 10 en de origin is http://localhost:5183', async () => {
    const set = await mod.kiesPoortenset({ bind: bezet([[54324]]), ipv6: false });
    expect(set).toStrictEqual(PLUS_TIEN);
  });

  test('nieuwe-app-script/AC-6 zonder bezette poorten kiest de poortkeuze de standaardset (+0)', async () => {
    const set = await mod.kiesPoortenset({ bind: bezet([]), ipv6: false });
    expect(set).toStrictEqual({ ...PLUS_NUL, origin: 'http://localhost:5173' });
  });

  test('nieuwe-app-script/AC-6 de eerste vrije set telt door tot +90', async () => {
    const bezetteWeb = [5173, 5183, 5193].map((p): [number] => [p]);
    const set = await mod.kiesPoortenset({ bind: bezet(bezetteWeb), ipv6: false });
    expect(set?.web).toBe(5203);
    expect(set?.pg).toBe(54352);
    expect(set?.origin).toBe('http://localhost:5203');
  });

  test('nieuwe-app-script/AC-6 zijn alle tien sets bezet, dan geeft de poortkeuze null', async () => {
    const alleWeb = Array.from({ length: 10 }, (_leeg, k): [number] => [5173 + 10 * k]);
    expect(await mod.kiesPoortenset({ bind: bezet(alleWeb), ipv6: false })).toBeNull();
  });

  test('nieuwe-app-script/AC-6 een listener alleen op [::1]:5173 laat poorten +0 niet kiezen (IPv6)', async () => {
    const bind = bezet([[5173, '::1']]);
    const met = await mod.kiesPoortenset({ bind, ipv6: true });
    expect(met?.web, 'de IPv6-listener telt mee').toBe(5183);
    expect(await mod.isVrij(5173, { bind, ipv6: true })).toBe(false);
    const zonder = await mod.kiesPoortenset({ bind, ipv6: false });
    expect(zonder?.web, 'zonder IPv6 op de machine telt ::1 niet').toBe(5173);
  });

  test('nieuwe-app-script/AC-6 isVrij probeert 127.0.0.1 en 0.0.0.0, en met IPv6 ook ::1 en ::', async () => {
    const gezien: string[] = [];
    const bind: Bind = (poort, host) => {
      if (poort === 5173) gezien.push(host);
      return Promise.resolve(true);
    };
    expect(await mod.isVrij(5173, { bind, ipv6: false })).toBe(true);
    expect([...gezien].sort()).toStrictEqual(['0.0.0.0', '127.0.0.1']);
    gezien.length = 0;
    expect(await mod.isVrij(5173, { bind, ipv6: true })).toBe(true);
    expect([...gezien].sort()).toStrictEqual(['0.0.0.0', '127.0.0.1', '::', '::1']);
  });

  test('nieuwe-app-script/AC-6 isVrij ziet een echte listener in het testproces als bezet', async () => {
    const poort = await vrijePoort();
    expect(await mod.isVrij(poort)).toBe(true);
    expect(await luister(poort, '127.0.0.1')).toBe(true);
    expect(await mod.isVrij(poort)).toBe(false);
  });

  test('nieuwe-app-script/AC-6 de CLI kiest bij een echte listener op 54324 de set +10', async () => {
    await luister(54324, '127.0.0.1');
    const fx = maakFixture();
    const r = draai(fx, ['poorten']);
    expect(r.status, r.uit).toBe(0);
    const resultaat = leesResultaat(fx.repo, 'poorten');
    for (const [naam, waarde] of Object.entries(PLUS_TIEN)) expect(gegeven(resultaat, naam), naam).toBe(waarde);
    expect(readdirSync(fx.repo), 'zonder --env schrijft poorten niets').not.toContain('.env.local');
  });

  test('nieuwe-app-script/AC-6 zijn alle tien sets bezet, dan geeft de CLI exitcode 1 met de melding en het herstel', async () => {
    for (let k = 0; k < 10; k++) await luister(5173 + 10 * k, '127.0.0.1');
    const fx = maakFixture();
    const r = draai(fx, ['poorten']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ geen vrije poortenset tussen +0 en +90');
    expect(r.stdout).toContain(
      '→ stop een oude stack van deze slug of vraag de eigenaar (docs/nieuwe-app.md, Fout → oorzaak)',
    );
    expect(leesResultaat(fx.repo, 'poorten').uitslag).toBe('fout');
  });
});

describe('nieuwe-app-script/AC-7: poorten --env schrijft .env.local uit .env.example', () => {
  const echt = readFileSync(path.join(ROOT, '.env.example'), 'utf8');

  test.each([
    { bron: 'de fixture-.env.example', voorbeeld: ENV_EXAMPLE },
    { bron: 'de echte .env.example van de template', voorbeeld: echt },
  ])('nieuwe-app-script/AC-7 maakEnvLocal verschilt van $bron alleen in de sleutels van werking 6', ({ voorbeeld }) => {
    const lokaal = mod.maakEnvLocal(voorbeeld, PLUS_TIEN);
    expect(mod.ENV_SLEUTELS, 'het script exporteert ENV_SLEUTELS').toStrictEqual(SLEUTELS);
    const rest = (tekst: string): string[] =>
      tekst.split('\n').filter((regel) => !SLEUTELS.includes(regel.split('=')[0] ?? ''));
    expect(rest(lokaal), 'alle andere regels (commentaar, APP_ENV, AUTH_SECRET) zijn gelijk').toStrictEqual(
      rest(voorbeeld),
    );
    const oud = sleutelWaarden(voorbeeld);
    const nieuw = sleutelWaarden(lokaal);
    for (const [sleutel, waarde] of oud)
      if (!SLEUTELS.includes(sleutel)) expect(nieuw.get(sleutel), sleutel).toBe(waarde);
    expect(nieuw.get('PG_PORT')).toBe('54332');
    expect(nieuw.get('MAIL_UI_PORT')).toBe('54334');
    expect(nieuw.get('SMTP_PORT')).toBe('54335');
    expect(nieuw.get('API_PORT')).toBe('8797');
    expect(nieuw.get('WEB_PORT')).toBe('5183');
    expect(nieuw.get('APP_ORIGIN')).toBe('http://localhost:5183');
    expect(nieuw.get('AUTH_BASE_URL')).toBe('http://localhost:5183');
    const poortVan: Record<string, string> = {
      DATABASE_URL: '54332',
      AUTH_DATABASE_URL: '54332',
      MIGRATOR_DATABASE_URL: '54332',
      SMTP_URL: '54335',
    };
    for (const sleutel of URL_SLEUTELS) {
      const a = new URL(oud.get(sleutel) ?? '');
      const b = new URL(nieuw.get(sleutel) ?? '');
      expect([b.protocol, b.hostname, b.username, b.password, b.pathname, b.search], sleutel).toStrictEqual([
        a.protocol,
        a.hostname,
        a.username,
        a.password,
        a.pathname,
        a.search,
      ]);
      expect(b.port, sleutel).toBe(poortVan[sleutel]);
    }
  });

  test('nieuwe-app-script/AC-7 de CLI schrijft .env.local gelijk aan het orakel voor +10 en laat .env.example staan', async () => {
    await luister(54324, '127.0.0.1');
    const fx = maakFixture();
    const r = draai(fx, ['poorten', '--env']);
    expect(r.status, r.uit).toBe(0);
    expect(readFileSync(path.join(fx.repo, '.env.local'), 'utf8')).toBe(envLocalVoor(PLUS_TIEN));
    expect(git(fx.repo, 'status', '--porcelain'), '.env.local is genegeerd, .env.example ongewijzigd').toBe('');
    const resultaat = leesResultaat(fx.repo, 'poorten');
    expect(gegeven(resultaat, 'origin')).toBe('http://localhost:5183');
    expect(JSON.stringify(resultaat), 'geen inhoud van .env.local in het resultaat').not.toContain('local-demo-secret');
  });

  test('nieuwe-app-script/AC-7 zonder bezette poorten is .env.local gelijk aan .env.example (standaardpoorten)', () => {
    const fx = maakFixture();
    const r = draai(fx, ['poorten', '--env']);
    expect(r.status, r.uit).toBe(0);
    const lokaal = readFileSync(path.join(fx.repo, '.env.local'), 'utf8');
    const kozen = leesResultaat(fx.repo, 'poorten');
    expect(lokaal).toBe(envLocalVoor({ ...PLUS_NUL, origin: 'http://localhost:5173' }));
    expect(gegeven(kozen, 'pg')).toBe(54322);
  });
});

describe('nieuwe-app-script/AC-5: poorten --env --dry-run schrijft niets', () => {
  test('nieuwe-app-script/AC-5 poorten --env --dry-run maakt .env.local niet en laat HEAD, remotes en refs gelijk', async () => {
    await luister(54324, '127.0.0.1');
    const fx = maakFixture();
    const vooraf = [git(fx.repo, 'rev-parse', 'HEAD'), git(fx.repo, 'remote', '-v'), git(fx.repo, 'for-each-ref')];
    const r = draai(fx, ['poorten', '--env', '--dry-run']);
    expect(r.status, r.uit).toBe(0);
    expect(readdirSync(fx.repo)).not.toContain('.env.local');
    expect([
      git(fx.repo, 'rev-parse', 'HEAD'),
      git(fx.repo, 'remote', '-v'),
      git(fx.repo, 'for-each-ref'),
    ]).toStrictEqual(vooraf);
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
    expect(r.stdout).toMatch(/^\(dry-run\) /m);
    const resultaat = leesResultaat(fx.repo, 'poorten');
    expect(resultaat.dryRun).toBe(true);
    expect(gegeven(resultaat, 'pg'), 'de gekozen set staat wel in het resultaat').toBe(54332);
  });
});

describe('nieuwe-app-script/AC-8: een bestaande .env.local wordt nooit overschreven', () => {
  test.each([['poorten'], ['poorten', '--env']])(
    'nieuwe-app-script/AC-8 %s neemt de poorten +10 over bij bezette standaardpoorten en laat .env.local byte-gelijk',
    async (...args) => {
      await luister(54322, '127.0.0.1');
      await luister(5173, '127.0.0.1');
      const fx = maakFixture();
      const bestand = schrijfEnv(fx, envLocalVoor(PLUS_TIEN));
      const vooraf = readFileSync(bestand);
      const r = draai(fx, args);
      expect(r.status, r.uit).toBe(0);
      expect(readFileSync(bestand).equals(vooraf), '.env.local is byte-gelijk').toBe(true);
      const resultaat = leesResultaat(fx.repo, 'poorten');
      expect(gegeven(resultaat, 'pg')).toBe(54332);
      expect(gegeven(resultaat, 'web')).toBe(5183);
      expect(stapStatus(resultaat, 'env-bestaand')).toBe('ok');
      expect(r.stdout).toContain('✓ .env.local bestaat; poorten overgenomen (pg 54332, web 5183)');
    },
  );

  test('nieuwe-app-script/AC-8 een ontbrekende API_PORT of WEB_PORT krijgt de standaardwaarde', () => {
    const fx = maakFixture();
    const zonderApiWeb = ENV_EXAMPLE.split('\n')
      .filter((regel) => !regel.startsWith('API_PORT=') && !regel.startsWith('WEB_PORT='))
      .join('\n');
    const bestand = schrijfEnv(fx, zonderApiWeb);
    const vooraf = readFileSync(bestand);
    const r = draai(fx, ['poorten']);
    expect(r.status, r.uit).toBe(0);
    const resultaat = leesResultaat(fx.repo, 'poorten');
    expect(gegeven(resultaat, 'api')).toBe(8787);
    expect(gegeven(resultaat, 'web')).toBe(5173);
    expect(readFileSync(bestand).equals(vooraf)).toBe(true);
  });

  test.each([
    { sleutel: 'DATABASE_URL', wijzig: (t: string) => t.replace(/^(DATABASE_URL=.*):54332\//m, '$1:54322/') },
    { sleutel: 'APP_ORIGIN', wijzig: (t: string) => t.replace(/^APP_ORIGIN=.*$/m, 'APP_ORIGIN=http://localhost:5173') },
  ])(
    'nieuwe-app-script/AC-8 een onsamenhangende .env.local ($sleutel) geeft exitcode 1, blijft byte-gelijk en toont geen waarden',
    ({ sleutel, wijzig }) => {
      const fx = maakFixture();
      const kapot = wijzig(envLocalVoor(PLUS_TIEN));
      expect(kapot, 'de fixture is echt gewijzigd').not.toBe(envLocalVoor(PLUS_TIEN));
      const bestand = schrijfEnv(fx, kapot);
      const vooraf = readFileSync(bestand);
      const r = draai(fx, ['poorten', '--env']);
      expect(r.status, r.uit).toBe(1);
      expect(r.stdout).toContain(`✗ .env.local bestaat met poorten die niet kloppen: ${sleutel}`);
      expect(r.stdout).toContain('→ niet overschreven; vraag de eigenaar om de poortaanpassing');
      expect(readFileSync(bestand).equals(vooraf), '.env.local is byte-gelijk').toBe(true);
      const resultaat = leesResultaat(fx.repo, 'poorten');
      expect(stapStatus(resultaat, 'env-bestaand')).toBe('fout');
      for (const geheim of ['api_user:api_user', 'app_migrator:app_migrator', 'auth_service', 'local-demo-secret'])
        expect(`${r.uit}\n${JSON.stringify(resultaat)}`, geheim).not.toContain(geheim);
    },
  );
});

describe('nieuwe-app-script/AC-18: een gemaskeerde, lege of onvolledige .env.local geeft geen terugval op de standaardpoorten', () => {
  interface Geval {
    fx: Fixture;
    bestand: string;
    /** De verwachte inhoud na afloop; null als het "bestand" geen gewoon bestand is. */
    inhoud: string | null;
  }

  /** Draai poorten, eis de fout, en bewijs dat .env.local onaangeroerd is en db-bewijs daarna geen poort kent. */
  function eisFout({ fx, bestand, inhoud }: Geval, args: string[]): string {
    const r = draai(fx, args);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ .env.local niet leesbaar of zonder ');
    const resultaat = leesResultaat(fx.repo, 'poorten');
    expect(resultaat.uitslag).toBe('fout');
    expect(gegeven(resultaat, 'pg'), 'geen gegevens.pg').toBeUndefined();
    expect(stapStatus(resultaat, 'env-bestaand')).toBe('fout');
    chmodSync(bestand, 0o600);
    if (inhoud !== null) expect(readFileSync(bestand, 'utf8'), '.env.local is onaangeroerd').toBe(inhoud);
    const bewijs = draai(fx, ['db-bewijs']);
    expect(bewijs.status).toBe(1);
    expect(bewijs.stdout).toContain('✗ PG-poort onbekend');
    expect(psqlLog(fx), 'db-bewijs start geen psql zonder poort').toStrictEqual([]);
    return r.stdout;
  }

  function geval(inhoud: string): Geval {
    const fx = maakFixture();
    return { fx, bestand: schrijfEnv(fx, inhoud), inhoud };
  }

  test.each([['poorten'], ['poorten', '--env']])('nieuwe-app-script/AC-18 een lege .env.local (%s)', (...args) => {
    eisFout(geval(''), args);
  });

  test.each([['poorten'], ['poorten', '--env']])(
    'nieuwe-app-script/AC-18 een .env.local zonder SMTP_PORT (%s)',
    (...args) => {
      const zonderSmtp = envLocalVoor(PLUS_TIEN)
        .split('\n')
        .filter((regel) => !regel.startsWith('SMTP_PORT='))
        .join('\n');
      expect(eisFout(geval(zonderSmtp), args)).toContain('SMTP_PORT');
    },
  );

  // Modus 000 (zoals de sandbox een .env.* maskeert). Als root blokkeert dat niets: dan is .env.local een map, ook "niet leesbaar".
  test.each([['poorten'], ['poorten', '--env']])(
    'nieuwe-app-script/AC-18 een niet-leesbare .env.local (modus 000, %s)',
    (...args) => {
      const metRechten = process.getuid?.() !== 0;
      const g = geval(envLocalVoor(PLUS_TIEN));
      if (metRechten) chmodSync(g.bestand, 0o000);
      else {
        rmSync(g.bestand);
        mkdirSync(g.bestand);
      }
      eisFout({ ...g, inhoud: metRechten ? g.inhoud : null }, args);
    },
  );
});
