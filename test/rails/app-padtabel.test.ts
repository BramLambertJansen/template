import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { afgeleid, padNiveau, rijFouten, VLOER } from '../../rails/hooks/lib/padtabel.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { codeownersTekst, eersteGoedkeurder, eigenaarVan } from '../../scripts/kit/codeowners.mjs';
import { APP_PAYMENTS, laadAppGlobs, laadLoadConfig, laadSamengevoegd, padenVan } from './app-padtabel-kit';
import { OUD, REPO, nieuw, nieuwePaden, object } from './padtabel-kit';

// Spec app-padtabel (docs/template/specs/app-padtabel.md): `.claude/gates.app.json` vult de padtabel van de template aan,
// alleen toevoegen of aanscherpen. Deze tests dekken de pure samenvoeging (rails/hooks/lib/padtabel.mjs), `loadConfig` en
// het rolhek op het samengevoegde object (AC-1 t/m AC-3, AC-5, AC-6, AC-9) en de CODEOWNERS-tekst (AC-11).
const RUW = nieuw();
const echt = (): Record<string, unknown> =>
  object(JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8')));

/** Een volledige rij in het resultaat van `samengevoegd`. */
const rij = (samen: Record<string, unknown>, glob: string): unknown => padenVan(samen)[glob];

describe('app-padtabel/AC-1 samenvoegen zonder en met een app-rij', () => {
  test('app-padtabel/AC-1: samengevoegd(ruw, null) geeft ruw ongewijzigd terug (diep gelijk)', async () => {
    const samen = await laadSamengevoegd();

    expect(samen(RUW, null)).toEqual(RUW);
    expect(samen(echt(), null)).toEqual(echt());
  });

  test('app-padtabel/AC-1: de oude vorm zonder app-bestand blijft ongewijzigd (geen gooi)', async () => {
    const samen = await laadSamengevoegd();

    expect(samen(OUD.ruw, null)).toEqual(OUD.ruw);
  });

  test('app-padtabel/AC-1: padNiveau geeft voorReview en besluit-pr op payments/x.ts, met payments/** als bron', async () => {
    const samen = (await laadSamengevoegd())(RUW, APP_PAYMENTS);

    expect(padNiveau('payments/x.ts', samen)).toEqual({
      schrijven: 'voorReview',
      besluit: 'besluit-pr',
      bronnen: { schrijven: ['payments/**'], besluit: ['payments/**'] },
    });
    expect(padNiveau('payments/x.ts', RUW).schrijven).toBe('vrij');
  });

  test('app-padtabel/AC-1: afgeleid heeft payments/** in gates, voorReview en kritiek, niet in altijdVragen', async () => {
    const samen = (await laadSamengevoegd())(RUW, APP_PAYMENTS);
    const lijsten = afgeleid(samen);

    expect(lijsten.gates).toContain('payments/**');
    expect(lijsten.voorReview).toContain('payments/**');
    expect(lijsten.kritiek).toContain('payments/**');
    expect(lijsten.altijdVragen).not.toContain('payments/**');
    // De rest van de afleiding verandert niet.
    const zonder = afgeleid(RUW);
    expect(lijsten.altijdVragen).toEqual(zonder.altijdVragen);
    expect(lijsten.gates).toEqual([...zonder.gates, 'payments/**']);
  });

  test('app-padtabel/AC-1: de templaterijen blijven in volgorde, daarna de app-globs; ruw en app blijven onaangeroerd', async () => {
    const ruwVoor = structuredClone(RUW);
    const appVoor = structuredClone(APP_PAYMENTS);
    const samen = (await laadSamengevoegd())(RUW, APP_PAYMENTS);

    expect(Object.keys(padenVan(samen))).toEqual([...Object.keys(padenVan(RUW)), 'payments/**']);
    expect({ ...samen, paden: null }).toEqual({ ...RUW, paden: null });
    expect(RUW).toEqual(ruwVoor);
    expect(APP_PAYMENTS).toEqual(appVoor);
  });

  test('app-padtabel/AC-1: een $comment in het app-bestand is toegestaan en verandert niets', async () => {
    const samen = await laadSamengevoegd();

    expect(samen(RUW, { $comment: 'uitleg', ...APP_PAYMENTS })).toEqual(samen(RUW, APP_PAYMENTS));
  });

  test('app-padtabel/AC-1: andere sleutels in het app-bestand worden niet gelezen en overschrijven niets', async () => {
    const samen = await laadSamengevoegd();
    const uit = samen(RUW, {
      paden: {},
      merge: 'eigenaar',
      autoRunner: false,
      schrijfrecht: { developer: [] },
      onderhoud: { repository: 'x/y' },
      goedkeurders: ['iemand'],
      template: 'x',
    });

    expect(uit).toEqual(RUW);
  });
});

describe('app-padtabel/AC-2 dezelfde glob in template en app: per kolom de strengste', () => {
  test('app-padtabel/AC-2: template src/core/** gate + app src/core/** besluit-pr geeft gate en besluit-pr', async () => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { 'src/core/**': { besluit: 'besluit-pr' } } });

    expect(rij(samen, 'src/core/**')).toEqual({ schrijven: 'gate', besluit: 'besluit-pr' });
    expect(padNiveau('src/core/x.ts', samen)).toMatchObject({ schrijven: 'gate', besluit: 'besluit-pr' });
    expect(afgeleid(samen).kritiek).toContain('src/core/**');
    expect(Object.keys(padenVan(samen)).filter((glob) => glob === 'src/core/**')).toHaveLength(1);
  });

  test('app-padtabel/AC-2: app .claude/** {} laat .claude/** voorReview', async () => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { '.claude/**': {} } });

    expect(padNiveau('.claude/x.json', samen)).toMatchObject({ schrijven: 'voorReview', besluit: 'eigenaar' });
    expect(afgeleid(samen).voorReview).toContain('.claude/**');
  });

  test.each([
    {
      naam: 'schrijven aanscherpen',
      app: { schrijven: 'voorReview' },
      verwacht: { schrijven: 'voorReview', besluit: 'besluit-pr' },
    },
    {
      naam: 'schrijven afzwakken telt niet',
      app: { schrijven: 'gate' },
      verwacht: { schrijven: 'gate', besluit: 'besluit-pr' },
    },
    {
      naam: 'besluit afzwakken telt niet',
      app: { besluit: 'eigenaar' },
      verwacht: { schrijven: 'gate', besluit: 'besluit-pr' },
    },
  ])('app-padtabel/AC-2: docs/adr/** (gate, besluit-pr) met app $naam', async ({ app, verwacht }) => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { 'docs/adr/**': app } });

    expect(rij(samen, 'docs/adr/**')).toEqual(verwacht);
    expect(padNiveau('docs/adr/0001-x.md', samen)).toMatchObject(verwacht);
  });

  test('app-padtabel/AC-2: een app-rij mag een templaterij nooit losser maken (src/core/** blijft minstens gate)', async () => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { 'src/core/**': { besluit: 'agent' } } });

    expect(padNiveau('src/core/x.ts', samen).schrijven).toBe('gate');
    expect(padNiveau('src/core/x.ts', samen).besluit).not.toBe('agent');
  });

  test('app-padtabel/AC-2: een onleesbare templaterij plus een geldige app-rij op dezelfde glob geeft altijdVragen en besluit-pr', async () => {
    const kapot = nieuw({ ...nieuwePaden(), 'extra/**': { schrijven: 'bestaat-niet' } });
    const samen = (await laadSamengevoegd())(kapot, { paden: { 'extra/**': { schrijven: 'gate' } } });

    expect(padNiveau('extra/x.ts', samen)).toMatchObject({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
    expect(rij(samen, 'extra/**')).toEqual({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
  });

  test('app-padtabel/AC-2: een leesbare rij blijft leesbaar, ook als de samengevoegde schrijven vrij is', async () => {
    const paden = { ...nieuwePaden(), 'src/api/app.ts': { besluit: 'eigenaar' } };
    const samen = (await laadSamengevoegd())(nieuw(paden), { paden: { 'src/api/app.ts': { besluit: 'besluit-pr' } } });

    expect(rijFouten(rij(samen, 'src/api/app.ts')).filter((fout) => fout !== 'rij zonder kolom')).toEqual([]);
    expect(padNiveau('src/api/app.ts', samen)).toMatchObject({ schrijven: 'vrij', besluit: 'besluit-pr' });
    expect(afgeleid(samen).kritiek).toContain('src/api/app.ts');
    expect(afgeleid(samen).gates).not.toContain('src/api/app.ts');
  });

  test.each([
    { naam: 'een lijst', app: [] },
    { naam: 'een tekst', app: 'x' },
    { naam: 'een getal', app: 42 },
    { naam: 'zonder paden', app: {} },
    { naam: 'met paden als lijst', app: { paden: [] } },
    { naam: 'met paden als tekst', app: { paden: 'x' } },
    { naam: 'met paden null', app: { paden: null } },
  ])('app-padtabel/AC-2: samengevoegd gooit als het app-bestand $naam is', async ({ app }) => {
    const samen = await laadSamengevoegd();

    expect(() => samen(RUW, app)).toThrow();
  });

  test('app-padtabel/AC-2: samengevoegd gooit bij gates.json in de oude vorm met een app-bestand', async () => {
    const samen = await laadSamengevoegd();

    expect(() => samen(OUD.ruw, APP_PAYMENTS)).toThrow();
  });
});

describe('app-padtabel/AC-3 een app-rij maakt bij het lezen nooit iets losser', () => {
  test('app-padtabel/AC-3: besluit agent op een pad zonder templaterij geeft besluit eigenaar', async () => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { 'payments/**': { besluit: 'agent' } } });

    expect(padNiveau('payments/x.ts', samen)).toMatchObject({ schrijven: 'vrij', besluit: 'eigenaar' });
  });

  test('app-padtabel/AC-3: CODEOWNERS houdt de eigenaar op een pad met een app-rij met besluit agent', async () => {
    const samen = (await laadSamengevoegd())(RUW, { paden: { 'payments/**': { besluit: 'agent' } } });

    expect(eigenaarVan(codeownersTekst(samen, 'bram'), 'payments/x.ts')).toBe('@bram');
  });

  test('app-padtabel/AC-3: een app-rij met besluit-pr of eigenaar op een src/**-pad geeft de eigenaar terug in CODEOWNERS', async () => {
    const samen = (await laadSamengevoegd())(RUW, {
      paden: { 'src/payments/**': { besluit: 'besluit-pr' }, 'src/billing/**': { besluit: 'eigenaar' } },
    });
    const tekst = codeownersTekst(samen, 'bram');

    expect(eigenaarVan(tekst, 'src/payments/x.ts')).toBe('@bram');
    expect(eigenaarVan(tekst, 'src/billing/x.ts')).toBe('@bram');
    expect(eigenaarVan(tekst, 'src/web/x.ts')).toBeNull();
  });

  test.each([
    { naam: 'een onbekende waarde', rij: { schrijven: 'bestaat-niet' } },
    { naam: 'een onbekende kolom', rij: { onbekend: 'gate' } },
    { naam: 'een rij die geen object is', rij: 'x' },
    { naam: 'een rij die een lijst is', rij: ['gate'] },
  ])(
    'app-padtabel/AC-3: een onleesbare app-rij ($naam) geeft altijdVragen en besluit-pr',
    async ({ rij: onleesbaar }) => {
      const samen = (await laadSamengevoegd())(RUW, { paden: { 'payments/**': onleesbaar } });

      expect(padNiveau('payments/x.ts', samen)).toMatchObject({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
      expect(afgeleid(samen).altijdVragen).toContain('payments/**');
    },
  );

  test('app-padtabel/AC-3: een verboden altijdVragen in een app-rij blijft altijdVragen (strenger kan altijd)', async () => {
    const samen = (await laadSamengevoegd())(RUW, {
      paden: { 'payments/**': { schrijven: 'altijdVragen', besluit: 'besluit-pr' } },
    });

    expect(padNiveau('payments/x.ts', samen)).toMatchObject({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
  });
});

describe('app-padtabel/AC-5 zonder app-bestand verandert er niets', () => {
  test('app-padtabel/AC-5: padNiveau per pad uit git ls-files is gelijk met en zonder samengevoegd(ruw, null)', async () => {
    const samen = (await laadSamengevoegd())(echt(), null);
    const bestanden = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);

    expect(bestanden.length).toBeGreaterThan(100);
    expect(
      bestanden.filter((pad) => JSON.stringify(padNiveau(pad, samen)) !== JSON.stringify(padNiveau(pad, echt()))),
    ).toEqual([]);
  });

  test('app-padtabel/AC-5: afgeleid en codeownersTekst zijn gelijk met en zonder samengevoegd(ruw, null)', async () => {
    const samen = (await laadSamengevoegd())(echt(), null);
    const eigenaar = eersteGoedkeurder(echt()) ?? '';

    expect(eigenaar).not.toBe('');
    expect(afgeleid(samen)).toEqual(afgeleid(echt()));
    expect(codeownersTekst(samen, eigenaar)).toBe(codeownersTekst(echt(), eigenaar));
  });

  test('app-padtabel/AC-5: loadConfig met één argument en met null is gelijk aan het gedrag van nu', async () => {
    const laad = await laadLoadConfig();
    const tekst = readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8');

    expect(laad(tekst)).toEqual(loadConfig(tekst));
    expect(laad(tekst, null)).toEqual(loadConfig(tekst));
  });
});

describe('app-padtabel/AC-6 de vloer telt acht paden, met .claude/gates.app.json', () => {
  test('app-padtabel/AC-6: VLOER bevat .claude/gates.app.json en telt acht paden', () => {
    expect(VLOER).toContain('.claude/gates.app.json');
    expect(VLOER).toHaveLength(8);
  });

  test('app-padtabel/AC-6: de echte .claude/gates.json heeft voor elk vloerpad een eigen rij altijdVragen en besluit-pr', () => {
    const paden = padenVan(echt());

    for (const glob of [...VLOER, '.claude/gates.app.json'])
      expect([glob, paden[glob]]).toEqual([glob, { schrijven: 'altijdVragen', besluit: 'besluit-pr' }]);
  });
});

/** Het rolhek met een configuratie; `.claude/gates.app.json` en `payments/x.ts` bestaan niet op schijf. */
function beslis(config: ReturnType<typeof loadConfig>, file: string, agent?: string) {
  const payload = {
    tool_name: 'Write',
    tool_input: { file_path: `/repo/${file}`, content: 'x\n' },
    ...(agent === undefined ? {} : { agent_type: agent }),
  };
  const decision = decide(payload, {
    root: '/repo',
    cwd: '/repo',
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  });
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('app-padtabel/AC-6 rolhek op .claude/gates.app.json', () => {
  test.each([
    { naam: 'de fixture met de vloerrij', tekst: JSON.stringify(RUW) },
    { naam: 'de echte .claude/gates.json', tekst: readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8') },
  ])('app-padtabel/AC-6: $naam: de developer is geweigerd en de hoofdsessie vraagt', ({ tekst }) => {
    const config = loadConfig(tekst);

    expect(config.altijdVragen).toContain('.claude/gates.app.json');
    expect(beslis(config, '.claude/gates.app.json', 'developer')).toBe('deny');
    expect(beslis(config, '.claude/gates.app.json')).toBe('ask');
  });

  test.each(['architect', 'tester', 'reviewer', 'docs'])(
    'app-padtabel/AC-6: %s mag .claude/gates.app.json niet schrijven',
    (rol) => {
      expect(beslis(loadConfig(JSON.stringify(RUW)), '.claude/gates.app.json', rol)).toBe('deny');
    },
  );
});

describe('app-padtabel/AC-9 loadConfig(tekst, appTekst)', () => {
  const GATES = JSON.stringify(RUW);
  const APP = JSON.stringify(APP_PAYMENTS);

  test('app-padtabel/AC-9: loadConfig(tekst) met één argument werkt als nu', async () => {
    const laad = await laadLoadConfig();
    const config = laad(GATES);

    expect(config).toEqual(loadConfig(GATES));
    expect(config.voorReview).not.toContain('payments/**');
  });

  test('app-padtabel/AC-9: loadConfig(tekst, appTekst) voegt de app-rijen samen in gates, voorReview en kritiek, niet in altijdVragen', async () => {
    const laad = await laadLoadConfig();
    const config = laad(GATES, APP);
    const zonder = laad(GATES);

    expect(config.gates).toContain('payments/**');
    expect(config.voorReview).toContain('payments/**');
    expect(config.kritiek).toContain('payments/**');
    expect(config.altijdVragen).not.toContain('payments/**');
    expect({ ...config, gates: [], voorReview: [], kritiek: [] }).toEqual({
      ...zonder,
      gates: [],
      voorReview: [],
      kritiek: [],
    });
  });

  test('app-padtabel/AC-9: ongeldige JSON in appTekst gooit', async () => {
    const laad = await laadLoadConfig();

    expect(() => laad(GATES, '{kapot')).toThrow();
    expect(() => laad(GATES, '')).toThrow();
  });

  test('app-padtabel/AC-9: een appTekst zonder paden gooit (het rolhek valt dicht)', async () => {
    const laad = await laadLoadConfig();

    expect(() => laad(GATES, '{}')).toThrow();
    expect(() => laad(GATES, '[]')).toThrow();
  });

  test('app-padtabel/AC-9: het rolhek weigert de developer op een app-pad met voorReview en vraagt de hoofdsessie', async () => {
    const laad = await laadLoadConfig();
    const met = laad(GATES, APP);
    const zonder = laad(GATES);

    expect([beslis(met, 'payments/x.ts', 'developer'), beslis(met, 'payments/x.ts')]).toEqual(['deny', 'ask']);
    expect([beslis(zonder, 'payments/x.ts', 'developer'), beslis(zonder, 'payments/x.ts')]).toEqual(['allow', 'allow']);
  });

  test('app-padtabel/AC-9: een app-rij kan niet versoepelen: een app-rij met agent op src/core/** laat die gate staan', async () => {
    const laad = await laadLoadConfig();
    const config = laad(GATES, JSON.stringify({ paden: { 'src/core/**': { besluit: 'agent' } } }));

    expect(beslis(config, 'src/core/x.ts', 'developer')).toBe(beslis(laad(GATES), 'src/core/x.ts', 'developer'));
  });
});

describe('app-padtabel/AC-11 CODEOWNERS uit het samengevoegde object', () => {
  test('app-padtabel/AC-11: codeownersTekst op het samengevoegde object bevat de app-rij met de eigenaar', async () => {
    const samen = (await laadSamengevoegd())(RUW, APP_PAYMENTS);
    const regels = codeownersTekst(samen, 'bram').split('\n');

    expect(regels.some((regel) => /^\/payments\/\s+@bram$/.test(regel))).toBe(true);
    expect(
      codeownersTekst(RUW, 'bram')
        .split('\n')
        .some((regel) => regel.startsWith('/payments/')),
    ).toBe(false);
    expect(eigenaarVan(codeownersTekst(samen, 'bram'), 'payments/x.ts')).toBe('@bram');
  });

  test('app-padtabel/AC-11: de kop van de gegenereerde CODEOWNERS noemt ook .claude/gates.app.json', () => {
    const kop = codeownersTekst(RUW, 'bram')
      .split('\n')
      .filter((regel) => regel.startsWith('#'))
      .join('\n');

    expect(kop).toContain('.claude/gates.app.json');
    expect(kop).toContain('.claude/gates.json');
  });
});

describe('app-padtabel appGlobs (herkomst in feiten.mjs pad)', () => {
  // `appGlobs(app)` krijgt alleen het app-bestand; in een groen repo overlapt het de template niet (check-docs), dus het zijn
  // precies de sleutels van `paden`.
  test('app-padtabel/AC-10: appGlobs geeft de globs uit het app-bestand', async () => {
    const globs = await laadAppGlobs();

    expect(globs(APP_PAYMENTS)).toEqual(['payments/**']);
    expect(
      globs({ paden: { 'payments/**': { besluit: 'eigenaar' }, 'billing/**': { besluit: 'besluit-pr' } } }),
    ).toEqual(['payments/**', 'billing/**']);
    expect(globs({ paden: {} })).toEqual([]);
  });
});
