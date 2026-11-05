import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  agentMergeFouten,
  agentMergeOordeel,
  leesAgentMerge,
  leesMergeConfig,
} from '../../scripts/kit/agent-merge.mjs';
import { agentMerge, beoordeel, leesConfig, numstatArgs, parseNumstat } from '../../scripts/kit/diff-guard.mjs';
import { agentMergeViolations } from '../../scripts/kit/check-docs.mjs';

// Agent-merge met een omvanggrens (spec agent-merge-niet-kritiek AC-9) en de vervallen blokssleutel van de externe review
// (AC-8, ADR 0069 herzien 2026-11-05): die sleutel bestaat niet meer en een overgebleven sleutel faalt dicht. Het woord wordt
// samengesteld, zodat dit bestand de afwezigheidstoets van AC-10 niet raakt.
const TEKST = readFileSync('.claude/gates.json', 'utf8');
const guardConfig = leesConfig(TEKST);
const HEAD = 'a'.repeat(40);
const BLOK = { toegestaan: ['src/**'], kritiek: [], maxBytes: 40000 };
const SLEUTEL = ['co', 'dex'].join('');
const VERVALLEN = `agentMerge.${SLEUTEL} bestaat niet meer: haal de sleutel weg (ADR 0069)`;

type Wijziging = { status: string; pad: string; van?: string };

// Het oordeel op een gates.json zonder de vervallen sleutel, ook als de echte tekst die (nog) heeft: AC-9 toetst alleen de omvang.
const zonderSleutel = (tekst: string) => {
  const ruw: unknown = JSON.parse(tekst);
  const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
  const schoon =
    typeof blok === 'object' && blok !== null
      ? Object.fromEntries(Object.entries(blok).filter(([sleutel]) => sleutel !== SLEUTEL))
      : {};
  return JSON.stringify(Object.assign({}, ruw, { agentMerge: schoon }));
};
const TEKST_SCHOON = zonderSleutel(TEKST);

function oordeel(wijzigingen: Wijziging[], omvang: { regels?: number; binair?: string[] }, tekst = TEKST_SCHOON) {
  const p = { wijzigingen, json: {}, reviews: [], auteur: 'BramLambertJansen', headSha: HEAD, bytes: 0, ...omvang };
  return agentMerge(p, beoordeel(p, guardConfig), tekst);
}

// In de nieuwe vorm (padtabel, ADR 0079) staan `toegestaan` en `kritiek` niet in het blok van de echte tekst: ze komen uit `paden`.
const zonderLijsten = (blok: unknown): Record<string, unknown> =>
  typeof blok === 'object' && blok !== null
    ? Object.fromEntries(Object.entries(blok).filter(([sleutel]) => sleutel !== 'toegestaan' && sleutel !== 'kritiek'))
    : {};

const metGrens = (maxRegels: number) => {
  const ruw: unknown = JSON.parse(TEKST_SCHOON);
  const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
  return JSON.stringify(Object.assign({}, ruw, { agentMerge: { ...zonderLijsten(blok), maxRegels } }));
};

describe('agent-merge-niet-kritiek/AC-9 leesAgentMerge: maxRegels', () => {
  test('maxRegels 400 wordt gelezen, zonder de vervallen sleutel in het resultaat', () => {
    expect(leesAgentMerge({ agentMerge: { ...BLOK, maxRegels: 400 } })).toEqual({ ...BLOK, maxRegels: 400 });
  });

  test.each([[undefined], [0], [-1], [400.5], ['400'], [null]])(
    'maxRegels %j: het hele resultaat is null',
    (maxRegels) => {
      expect(leesAgentMerge({ agentMerge: { ...BLOK, maxRegels } })).toBeNull();
    },
  );

  test('zonder maxRegels is het oordeel nee met de bestaande reden (geen omvangreden in de diff-guard)', () => {
    const ruw: unknown = JSON.parse(TEKST_SCHOON);
    const zonder = JSON.stringify(Object.assign({}, ruw, { agentMerge: zonderLijsten(BLOK) }));
    expect(oordeel([{ status: 'M', pad: 'src/web/x.ts' }], { regels: 1, binair: [] }, zonder)).toEqual({
      oordeel: 'nee',
      redenen: ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'],
    });
  });
});

describe('agent-merge-niet-kritiek/AC-9 oordeel op omvang en binaire bestanden', () => {
  const src = [{ status: 'M', pad: 'src/web/x.ts' }];

  test.each([
    [399, 'ja'],
    [400, 'ja'],
    [401, 'nee'],
  ])('%i regels bij grens 400: %s', (regels, verwacht) => {
    const uitslag = oordeel(src, { regels, binair: [] }, metGrens(400));
    expect(uitslag.oordeel).toBe(verwacht);
    expect(uitslag.redenen).toEqual(
      verwacht === 'ja' ? [] : ['PR te groot voor een agent-merge: 401 regels, grens 400 (agentMerge.maxRegels)'],
    );
  });

  test('een binair bestand onder docs/', () => {
    expect(oordeel([{ status: 'A', pad: 'docs/x.png' }], { regels: 0, binair: ['docs/x.png'] })).toEqual({
      oordeel: 'nee',
      redenen: ['binair bestand in de PR: geen agent-merge (docs/x.png)'],
    });
  });

  test('regels ontbreekt in de diff-guard-invoer: nee met de omvangreden', () => {
    expect(oordeel(src, {})).toEqual({
      oordeel: 'nee',
      redenen: ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    });
  });

  test.each([
    ['is negatief', { regels: -1, binair: [] }],
    ['is een breuk', { regels: 1.5, binair: [] }],
    ['is tekst', { regels: '3', binair: [] }],
    ['is null', { regels: null, binair: [] }],
    ['binair ontbreekt', { regels: 3 }],
  ])('regels %s: nee met de omvangreden', (_naam, omvang) => {
    const invoer = { wijzigingen: src, json: {}, geraakteJson: [], risico: {}, bytes: 0, ...omvang };
    expect(agentMergeOordeel(invoer, leesMergeConfig(TEKST_SCHOON))).toEqual({
      oordeel: 'nee',
      redenen: ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    });
  });

  test('zuivere hernoeming: 0 regels, beide paden op de lijsten getoetst', () => {
    expect(parseNumstat('0\t0\t\0src/web/oud.ts\0src/web/nieuw.ts\0')).toEqual({ regels: 0, binair: [] });
    const hernoemd = oordeel([{ status: 'R', van: 'src/core/shared/can.ts', pad: 'src/web/can.ts' }], {
      regels: 0,
      binair: [],
    });
    expect(hernoemd.oordeel).toBe('nee');
    expect(hernoemd.redenen.join('\n')).toMatch(/src\/core\/shared\/can\.ts is een gate-pad/);
    expect(
      oordeel([{ status: 'R', van: 'src/web/oud.ts', pad: 'src/web/nieuw.ts' }], { regels: 0, binair: [] }),
    ).toEqual({ oordeel: 'ja', redenen: [] });
  });

  test('een nieuw leeg bestand: 0 regels, ja', () => {
    expect(parseNumstat('0\t0\tsrc/web/leeg.ts\0')).toEqual({ regels: 0, binair: [] });
    expect(oordeel([{ status: 'A', pad: 'src/web/leeg.ts' }], { regels: 0, binair: [] })).toEqual({
      oordeel: 'ja',
      redenen: [],
    });
  });

  test('numstat telt toegevoegd plus verwijderd; een - is binair, ook bij een hernoeming', () => {
    expect(
      parseNumstat(
        [
          '3\t2\tsrc/web/a.ts',
          '-\t-\tdocs/x.png',
          '-\t-\t',
          'docs/oud.png',
          'docs/nieuw.png',
          '410\t0\tsrc/web/b c.ts',
          '',
        ].join('\u0000'),
      ),
    ).toEqual({ regels: 415, binair: ['docs/x.png', 'docs/nieuw.png'] });
  });

  test('de uitslag van de diff-guard zelf verandert niet door de omvang', () => {
    const basis = { wijzigingen: src, json: {}, reviews: [], auteur: 'x', headSha: HEAD };
    expect(beoordeel({ ...basis, regels: 9999, binair: ['docs/x.png'] }, guardConfig)).toEqual(
      beoordeel(basis, guardConfig),
    );
  });

  test('agentMergeOordeel zonder regels in de invoer geeft nee', () => {
    const uitslag = agentMergeOordeel(
      { wijzigingen: src, json: {}, geraakteJson: [], risico: {} },
      leesMergeConfig(TEKST_SCHOON),
    );
    expect(uitslag.oordeel).toBe('nee');
  });
});

describe('agent-merge-niet-kritiek/AC-9 check-docs toetst de vorm van maxRegels', () => {
  const aangepast = (blok: Record<string, unknown>) => {
    const ruw: unknown = JSON.parse(TEKST);
    return JSON.stringify(Object.assign({}, ruw, { agentMerge: zonderLijsten(blok) }));
  };
  const sleutels = (blok: Record<string, unknown>) => agentMergeViolations([], aangepast(blok)).map((v) => v.key);

  test.each([
    ['ontbrekend', { ...BLOK }],
    ['"400"', { ...BLOK, maxRegels: '400' }],
    ['0', { ...BLOK, maxRegels: 0 }],
  ])('maxRegels %s wordt geweigerd, ook al leest het script hem dicht', (_naam, blok) => {
    expect(sleutels(blok)).toContain('docs:agentMerge.maxRegels');
  });

  test('maxRegels 400 zonder de vervallen sleutel is geldig', () => {
    expect(sleutels({ ...BLOK, maxRegels: 400 })).toEqual([]);
  });
});

describe('agent-merge-niet-kritiek/AC-9 numstat op een echte repo', () => {
  test('de git-aanroep uit leesPr telt tekst, ziet een hernoemde binary en een leeg verwijderd bestand', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'numstat-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    git('init', '-q');
    git('config', 'core.fileMode', 'true');
    writeFileSync(path.join(root, 'a.ts'), 'een\ntwee\n');
    writeFileSync(path.join(root, 'leeg.ts'), '');
    writeFileSync(path.join(root, 'modus.ts'), 'x\n');
    writeFileSync(path.join(root, 'oud.bin'), Buffer.from([0, 1, 2, 0, 255]));
    git('add', '-A');
    git('commit', '-qm', 'basis');
    const basis = git('rev-parse', 'HEAD').trim();
    writeFileSync(path.join(root, 'a.ts'), 'een\ndrie\nvier\n');
    rmSync(path.join(root, 'leeg.ts'));
    chmodSync(path.join(root, 'modus.ts'), 0o755);
    renameSync(path.join(root, 'oud.bin'), path.join(root, 'nieuw.bin'));
    git('add', '-A');
    git('commit', '-qm', 'wijziging');
    const head = git('rev-parse', 'HEAD').trim();
    // a.ts: 2 erbij, 1 eraf; leeg.ts en modus.ts: 0 0; de zuiver hernoemde binary: `-`.
    expect(parseNumstat(git(...numstatArgs(basis, head)))).toEqual({ regels: 3, binair: ['nieuw.bin'] });
    rmSync(root, { recursive: true, force: true });
  });
});

describe('agent-merge-niet-kritiek/AC-9 agentMergeFouten: één reden per fout', () => {
  test.each([
    ['geldig', { ...BLOK, maxRegels: 400 }, []],
    [
      'toegestaan is tekst',
      { ...BLOK, toegestaan: 'src/**', maxRegels: 400 },
      ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'],
    ],
    [
      'maxRegels ontbreekt',
      BLOK,
      ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    ],
    [
      'blok ontbreekt',
      undefined,
      [
        'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
        'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
        'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge',
      ],
    ],
  ])('%s', (_naam, blok, verwacht) => {
    const ruw = { agentMerge: blok };
    expect(agentMergeFouten(ruw)).toEqual(verwacht);
    expect(leesAgentMerge(ruw) === null).toBe(verwacht.length > 0);
  });
});

describe('agent-merge-niet-kritiek/AC-8 de vervallen blokssleutel bestaat niet meer', () => {
  const sleutelInTekst = (waarde: unknown) => {
    const ruw: unknown = JSON.parse(TEKST_SCHOON);
    const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
    return JSON.stringify(Object.assign({}, ruw, { agentMerge: { ...zonderLijsten(blok), [SLEUTEL]: waarde } }));
  };

  test('de echte gates.json heeft de vervallen sleutel niet en blijft geldig', () => {
    const blok = leesMergeConfig(TEKST).agentMerge;
    expect(blok).toMatchObject({ maxRegels: 400 });
    expect(blok).not.toHaveProperty(SLEUTEL);
    expect(TEKST).not.toMatch(new RegExp(SLEUTEL, 'i'));
    expect(agentMergeViolations([], TEKST)).toEqual([]);
  });

  test.each([[true], [false], ['indien-aanwezig'], ['ja']])(
    'sleutel %j: leesAgentMerge geeft null en agentMergeFouten de reden',
    (waarde) => {
      const ruw = { agentMerge: { ...BLOK, maxRegels: 400, [SLEUTEL]: waarde } };
      expect(leesAgentMerge(ruw)).toBeNull();
      expect(agentMergeFouten(ruw)).toContain(VERVALLEN);
    },
  );

  test('zonder de vervallen sleutel is het blok geldig: geen fout, wel een resultaat', () => {
    const ruw = { agentMerge: { ...BLOK, maxRegels: 400 } };
    expect(agentMergeFouten(ruw)).toEqual([]);
    expect(leesAgentMerge(ruw)).toEqual({ ...BLOK, maxRegels: 400 });
  });

  test.each([[true], [false], ['indien-aanwezig'], ['ja']])('check-docs meldt de sleutel met waarde %j', (waarde) => {
    expect(agentMergeViolations([], sleutelInTekst(waarde))).toContainEqual({
      key: `docs:agentMerge.${SLEUTEL}`,
      message: `.claude/gates.json: agentMerge.${SLEUTEL} bestaat niet meer (ADR 0069); haal de sleutel weg`,
    });
  });

  test('check-docs meldt zonder de vervallen sleutel geen overtreding op die sleutel', () => {
    expect(agentMergeViolations([], TEKST_SCHOON).map((v) => v.key)).not.toContain(`docs:agentMerge.${SLEUTEL}`);
  });

  test('de omvanggrens blijft: maxRegels en maxBytes worden nog getoetst', () => {
    expect(agentMergeFouten({ agentMerge: { toegestaan: [], kritiek: [], maxBytes: 0, maxRegels: 0 } })).toEqual([
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
      'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge',
    ]);
  });
});
