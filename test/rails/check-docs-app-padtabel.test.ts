import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';
import { NIEUW_ALTIJD_VRAGEN, nieuw, nieuwePaden, object, repo } from './padtabel-kit';

// check-docs op het app-bestand (spec app-padtabel, Ontwerp "check-docs, nieuwe regels"): sleutel `docs:gates-app:<…>`, tekst
// na `.claude/gates.app.json: `. Alleen een getrackt app-bestand telt; de spiegels (CODEOWNERS en de Edit-ask) en het
// schrijfrecht draaien op het samengevoegde object.
const APP = '.claude/gates.app.json';
const MELDING = `${APP}: `;
const PADEN = '.claude/gates.json: paden.';

interface Opzet {
  /** de gates.json van de repo (standaard `nieuw()`) */
  gates?: Record<string, unknown>;
  /** de tekst van het app-bestand; ontbreekt: er is geen app-bestand */
  app?: string | object;
  /** getrackt in git (standaard) of alleen in de werkmap */
  getrackt?: boolean;
  /** CODEOWNERS bevat de app-rijen (standaard) of is gegenereerd uit de gates.json alleen */
  codeownersMetApp?: boolean;
  ask?: string[];
}

const tekstVan = (app: string | object): string => (typeof app === 'string' ? app : JSON.stringify(app, null, 2));

/** De gates.json met de rijen van het app-bestand erbij, als de CODEOWNERS-afleiding voor een gezond app-bestand ze ziet. */
function metAppRijen(gates: Record<string, unknown>, app: string | object): Record<string, unknown> {
  const parsed: unknown = JSON.parse(tekstVan(app));
  const rijen = typeof parsed === 'object' && parsed !== null && 'paden' in parsed ? object(parsed.paden) : {};
  return { ...gates, paden: { ...object(gates['paden']), ...rijen } };
}

/** De CODEOWNERS voor gates plus app-rijen, of null als die niet af te leiden is (een ongeldig bestand of een glob die GitHub anders leest). */
function codeownersVoor(gates: Record<string, unknown>, app: string | object): string | null {
  try {
    return codeownersTekst(metAppRijen(gates, app), 'eigenaar');
  } catch {
    return null;
  }
}

/** Een tijdelijke git-repo voor `docsViolations` met (optioneel) een app-bestand. */
function appRepo({ gates = nieuw(), app, getrackt = true, codeownersMetApp = true, ask }: Opzet = {}): string {
  const root = repo({ gatesTekst: JSON.stringify(gates), ...(ask === undefined ? {} : { ask }) });
  if (app === undefined) return root;
  mkdirSync(path.join(root, '.claude'), { recursive: true });
  writeFileSync(path.join(root, APP), tekstVan(app));
  const tekst = codeownersMetApp ? codeownersVoor(gates, app) : null;
  if (tekst !== null) writeFileSync(path.join(root, '.github/CODEOWNERS'), tekst);
  if (getrackt) execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function lijst(opzet: Opzet): Promise<{ key: string; message: string }[]> {
  return docsViolations(appRepo(opzet));
}

const appMeldingen = (uitslag: { key: string; message: string }[]) =>
  uitslag.filter((v) => v.message.startsWith(MELDING));
const berichten = (uitslag: { key: string; message: string }[]) => uitslag.map((v) => v.message);

const GELDIG = { paden: { 'payments/**': { schrijven: 'voorReview', besluit: 'besluit-pr' } } };

describe('app-padtabel/AC-4 een geldig app-bestand', () => {
  test('app-padtabel/AC-4: groen als .claude/settings.json (ask) en CODEOWNERS kloppen', async () => {
    const uitslag = await lijst({ app: GELDIG, ask: NIEUW_ALTIJD_VRAGEN });

    expect(appMeldingen(uitslag)).toEqual([]);
    expect(uitslag.filter((v) => /^docs:(?:gates-app|spiegel|paden|schrijfrecht):/.test(v.key))).toEqual([]);
  });

  test('app-padtabel/AC-4: een $comment naast paden is toegestaan', async () => {
    const uitslag = await lijst({ app: { $comment: 'onze betaalmodule', ...GELDIG } });

    expect(appMeldingen(uitslag)).toEqual([]);
  });

  test('app-padtabel/AC-4: CODEOWNERS zonder de app-rij is rood (docs:spiegel:codeowners)', async () => {
    const uitslag = await lijst({ app: GELDIG, codeownersMetApp: false });

    expect(uitslag.map((v) => v.key)).toContain('docs:spiegel:codeowners');
    expect(berichten(uitslag).join('\n')).toContain('payments');
  });

  test('app-padtabel/AC-4: zonder app-bestand zijn er geen meldingen over het app-bestand en is CODEOWNERS groen', async () => {
    const uitslag = await lijst({});

    expect(uitslag.filter((v) => /^docs:(?:gates-app|spiegel|paden|schrijfrecht):/.test(v.key))).toEqual([]);
  });

  test('app-padtabel/AC-4: een app-bestand dat niet getrackt is, telt niet (ook niet als het ongeldig is)', async () => {
    const uitslag = await lijst({
      app: { paden: { 'src/core/**': { besluit: 'agent' } }, merge: 'x' },
      getrackt: false,
      codeownersMetApp: false,
    });

    expect(appMeldingen(uitslag)).toEqual([]);
    expect(uitslag.filter((v) => v.key.startsWith('docs:gates-app:'))).toEqual([]);
  });
});

describe('app-padtabel/AC-4 de vorm van het bestand', () => {
  test.each(['merge', 'autoRunner', 'schrijfrecht', 'onderhoud', 'goedkeurders', 'template', 'testpaden', 'onbekend'])(
    'app-padtabel/AC-4: onbekende sleutel %s is rood',
    async (sleutel) => {
      const uitslag = await lijst({ app: { ...GELDIG, [sleutel]: 'x' } });

      expect(berichten(uitslag)).toContain(`${MELDING}onbekende sleutel ${sleutel}`);
      expect(uitslag.find((v) => v.message === `${MELDING}onbekende sleutel ${sleutel}`)?.key).toMatch(
        /^docs:gates-app:/,
      );
    },
  );

  test.each([
    { naam: 'een lijst', app: { paden: [] } },
    { naam: 'een tekst', app: { paden: 'x' } },
    { naam: 'null', app: { paden: null } },
    { naam: 'afwezig', app: { $comment: 'leeg' } },
  ])('app-padtabel/AC-4: paden is $naam: paden is geen object', async ({ app }) => {
    const uitslag = await lijst({ app });

    expect(berichten(uitslag)).toContain(`${MELDING}paden is geen object`);
    expect(uitslag.find((v) => v.message === `${MELDING}paden is geen object`)?.key).toMatch(/^docs:gates-app:/);
  });
});

describe('app-padtabel/AC-4 de rijregels (gelijk aan die van .claude/gates.json)', () => {
  test.each([
    { naam: 'een onbekende kolom', rij: { kolom: 'gate' }, melding: 'onbekende sleutel kolom' },
    { naam: 'een onbekende waarde voor schrijven', rij: { schrijven: 'zwaar' }, melding: 'onbekende waarde zwaar' },
    { naam: 'een onbekende waarde voor besluit', rij: { besluit: 'iedereen' }, melding: 'onbekende waarde iedereen' },
    { naam: 'een rij zonder kolom', rij: {}, melding: 'rij zonder kolom' },
  ])('app-padtabel/AC-4: $naam is rood', async ({ rij, melding }) => {
    const uitslag = await lijst({ app: { paden: { 'payments/**': rij } } });

    expect(berichten(uitslag)).toContain(`${MELDING}paden.payments/**: ${melding}`);
    expect(uitslag.find((v) => v.message === `${MELDING}paden.payments/**: ${melding}`)?.key).toMatch(
      /^docs:gates-app:/,
    );
  });

  test('app-padtabel/AC-4: een sleutel !x/** is rood', async () => {
    const uitslag = await lijst({ app: { paden: { '!x/**': { schrijven: 'gate' } } } });

    expect(berichten(uitslag)).toContain(`${MELDING}paden.!x/**: een glob begint niet met !`);
  });

  test('app-padtabel/AC-4: twee keer dezelfde sleutel in de ruwe tekst is rood', async () => {
    const tekst = [
      '{',
      '  "paden": {',
      '    "payments/**": { "schrijven": "gate" },',
      '    "payments/**": { "schrijven": "voorReview" }',
      '  }',
      '}',
    ].join('\n');
    const uitslag = await lijst({ app: tekst });

    expect(berichten(uitslag)).toContain(`${MELDING}paden.payments/**: dubbele sleutel`);
  });
});

describe('app-padtabel/AC-4 wat een app-rij niet mag', () => {
  test.each([{ rij: { schrijven: 'altijdVragen', besluit: 'besluit-pr' } }, { rij: { schrijven: 'altijdVragen' } }])(
    'app-padtabel/AC-4: altijdVragen ($rij) kan alleen in de template',
    async ({ rij }) => {
      const uitslag = await lijst({ app: { paden: { 'payments/**': rij } } });

      expect(berichten(uitslag)).toContain(
        `${MELDING}paden.payments/**: altijdVragen kan alleen in de template (vloer en ask-spiegel); gebruik voorReview met besluit-pr`,
      );
    },
  );

  test('app-padtabel/AC-4: besluit agent kan alleen in de template, ook zonder schrijven', async () => {
    const uitslag = await lijst({ app: { paden: { 'payments/**': { besluit: 'agent' } } } });

    expect(berichten(uitslag)).toContain(`${MELDING}paden.payments/**: besluit agent kan alleen in de template`);
  });

  test.each(['gate', 'voorReview'])(
    'app-padtabel/AC-4: schrijven %s met besluit agent: alleen de agent-regel, niet de samenhangregel van de template',
    async (schrijven) => {
      const uitslag = await lijst({ app: { paden: { 'payments/**': { schrijven, besluit: 'agent' } } } });
      const meldingen = berichten(appMeldingen(uitslag));

      expect(meldingen).toContain(`${MELDING}paden.payments/**: besluit agent kan alleen in de template`);
      expect(meldingen.filter((m) => m.includes(`schrijven ${schrijven} met besluit agent`))).toEqual([]);
    },
  );

  test('app-padtabel/AC-4: een glob die al in .claude/gates.json staat, is rood (scherp aan met een eigen glob)', async () => {
    const uitslag = await lijst({ app: { paden: { 'src/core/**': { besluit: 'besluit-pr' } } } });

    expect(berichten(uitslag)).toContain(
      `${MELDING}paden.src/core/**: staat al in .claude/gates.json; scherp aan met een eigen glob`,
    );
  });

  test('app-padtabel/AC-2: dezelfde glob in template en app is rood met staat al in .claude/gates.json', async () => {
    const uitslag = await lijst({ app: { paden: { '.claude/**': {}, 'docs/adr/**': { schrijven: 'voorReview' } } } });

    expect(berichten(uitslag)).toEqual(
      expect.arrayContaining([
        `${MELDING}paden..claude/**: staat al in .claude/gates.json; scherp aan met een eigen glob`,
        `${MELDING}paden.docs/adr/**: staat al in .claude/gates.json; scherp aan met een eigen glob`,
      ]),
    );
  });

  test('app-padtabel/AC-4: een app-bestand in de template zelf (onderhoud.repository) is rood', async () => {
    const gates = { ...nieuw(), onderhoud: { repository: 'acme/template' } };
    const uitslag = await lijst({ gates, app: GELDIG });

    expect(berichten(uitslag)).toContain(
      `${MELDING}bestaat in de template zelf (onderhoud.repository staat in .claude/gates.json); app-rijen horen in een app`,
    );
  });

  test('app-padtabel/AC-4: zonder onderhoud.repository (een app) is dezelfde melding er niet', async () => {
    const uitslag = await lijst({ app: GELDIG });

    expect(berichten(uitslag).filter((m) => m.includes('bestaat in de template zelf'))).toEqual([]);
  });
});

describe('app-padtabel/AC-4 de spiegels en het schrijfrecht op het samengevoegde object', () => {
  test('app-padtabel/AC-4: een app-rij die het schrijfrecht van een rol overlapt, is rood (padtabel/AC-8)', async () => {
    const gates = { ...nieuw(), schrijfrecht: { ...object(nieuw()['schrijfrecht']), architect: ['payments/**'] } };
    const uitslag = await lijst({ gates, app: { paden: { 'payments/**': { schrijven: 'gate' } } } });

    expect(
      berichten(uitslag).filter((m) =>
        m.includes('schrijfrecht van architect (payments/**) overlapt met gate payments/**'),
      ),
    ).toHaveLength(1);
  });

  test('app-padtabel/AC-4: zonder app-rij is dat schrijfrecht van de architect geen overlap', async () => {
    const gates = { ...nieuw(), schrijfrecht: { ...object(nieuw()['schrijfrecht']), architect: ['payments/**'] } };
    const uitslag = await lijst({ gates });

    expect(berichten(uitslag).filter((m) => m.includes('schrijfrecht van architect'))).toEqual([]);
  });

  test('app-padtabel/AC-4: een app-glob die CODEOWNERS niet kan uitdrukken, meldt .claude/gates.app.json en niet .claude/gates.json', async () => {
    const glob = 'payments/[ab]/**';
    const uitslag = await lijst({
      app: { paden: { [glob]: { schrijven: 'voorReview', besluit: 'besluit-pr' } } },
      codeownersMetApp: false,
    });
    const lijstTekst = berichten(uitslag);

    expect(lijstTekst.some((m) => m.includes(`.claude/gates.app.json: paden.${glob}:`))).toBe(true);
    expect(lijstTekst.filter((m) => m.includes(`.claude/gates.json: paden.${glob}:`))).toEqual([]);
  });

  test('app-padtabel/AC-4: een glob die CODEOWNERS niet kan uitdrukken in gates.json blijft .claude/gates.json melden', async () => {
    const gates = nieuw({ ...nieuwePaden(), 'payments/[ab]/**': { schrijven: 'voorReview' } });
    const uitslag = await lijst({ gates });

    expect(berichten(uitslag).some((m) => m.includes('.claude/gates.json: paden.payments/[ab]/**:'))).toBe(true);
    expect(berichten(uitslag).filter((m) => m.includes('.claude/gates.app.json'))).toEqual([]);
  });
});

describe('app-padtabel/AC-6 de vloer in check-docs', () => {
  const GLOB = '.claude/gates.app.json';
  const metPaden = (paden: Record<string, unknown>) => JSON.stringify(nieuw(paden));

  test('app-padtabel/AC-6: zonder de rij .claude/gates.app.json is check-docs rood', async () => {
    const paden = Object.fromEntries(Object.entries(nieuwePaden()).filter(([glob]) => glob !== GLOB));
    const uitslag = await docsViolations(repo({ gatesTekst: metPaden(paden) }));

    expect(berichten(uitslag)).toContain(`${PADEN}${GLOB}: vloer: verwacht altijdVragen en besluit-pr`);
  });

  test.each([
    ['voorReview', 'besluit-pr'],
    ['altijdVragen', 'eigenaar'],
    ['gate', 'besluit-pr'],
  ])('app-padtabel/AC-6: de rij met %s en %s is lager dan de vloer: rood', async (schrijven, besluit) => {
    const uitslag = await docsViolations(
      repo({ gatesTekst: metPaden({ ...nieuwePaden(), [GLOB]: { schrijven, besluit } }) }),
    );

    expect(berichten(uitslag)).toContain(`${PADEN}${GLOB}: vloer: verwacht altijdVragen en besluit-pr`);
  });

  test('app-padtabel/AC-6: de vloer telt alleen een eigen rij: .claude/** met altijdVragen dekt het app-bestand niet', async () => {
    const rest = Object.fromEntries(Object.entries(nieuwePaden()).filter(([glob]) => glob !== GLOB));
    const paden = { ...rest, '.claude/**': { schrijven: 'altijdVragen', besluit: 'besluit-pr' } };
    const uitslag = await docsViolations(repo({ gatesTekst: metPaden(paden) }));

    expect(berichten(uitslag)).toContain(`${PADEN}${GLOB}: vloer: verwacht altijdVragen en besluit-pr`);
  });

  test('app-padtabel/AC-6: met de rij is de vloer groen', async () => {
    const uitslag = await docsViolations(repo({ gatesTekst: metPaden(nieuwePaden()) }));

    expect(berichten(uitslag).filter((m) => m.includes('vloer'))).toEqual([]);
  });

  test('app-padtabel/AC-6: de Edit-ask mist de regel voor het app-bestand: spiegelmelding (docs:spiegel:ask:.claude/gates.app.json)', async () => {
    const ask = NIEUW_ALTIJD_VRAGEN.filter((glob) => glob !== GLOB);
    const uitslag = await docsViolations(repo({ gatesTekst: metPaden(nieuwePaden()), ask }));

    expect(uitslag.map((v) => v.key)).toContain(`docs:spiegel:ask:${GLOB}`);
  });
});

describe('app-padtabel/AC-5 zonder app-bestand verandert check-docs niet', () => {
  test('app-padtabel/AC-5: de fixture zonder app-bestand heeft geen enkele melding met .claude/gates.app.json en geen docs:gates-app-sleutel', async () => {
    const uitslag = await lijst({});

    expect(
      uitslag.filter((v) => v.key.startsWith('docs:gates-app:') || v.message.includes('.claude/gates.app.json: ')),
    ).toEqual([]);
  });
});
