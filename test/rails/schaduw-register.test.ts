import { afterEach, describe, expect, test } from 'vitest';
import { DREMPEL, controle, laad, maakRepo, ruimOp, tekst, zonder } from './schaduw-kit';

// Spec schaduwmodus (docs/template/specs/schaduwmodus.md), AC-1 t/m AC-4 en AC-15: het kanaal `schaduw-register`. Tests vóór
// de bouw; de API staat in schaduw-kit.ts. Tijdelijke git-repo's met een origin/main-ref als merge-base.
afterEach(ruimOp);

const vorm = (veld: string) => `veld ${veld} ontbreekt of heeft niet de vorm uit de spec schaduwmodus`;
const TE_LANG = 'meer dan 14 dagen na de start';
const ALTIJD = 'moet altijd meteen hard zijn (ADR 0106 punt 2); deze controle kan niet in schaduw';
const AL_AANGEPAST = 'al een keer aangepast; het besluit is nu hard of verwijderd (ADR 0106 punt 6)';
const ZONDER_DREMPEL = 'aangepast zonder andere drempel; een aanpassing wijzigt de drempel (ADR 0106 punt 6)';
const VERLENGD =
  'einddatum later dan op de merge-base zonder dat aangepast is opgehoogd; verlengen met dezelfde controle en drempel kan niet (ADR 0106 punt 5)';

async function register(opzet: Parameters<typeof maakRepo>[0]) {
  const { registerViolations } = await laad();
  return registerViolations(maakRepo(opzet), { ci: false });
}

describe('schaduw-register: het schema', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-1: een regel zonder drempel geeft de strikte overtreding <naam>:veld drempel', async () => {
    const violations = await register({ register: [zonder(controle(), 'drempel')] });
    expect(violations.map((violation) => violation.key)).toEqual(['proef:veld drempel']);
    expect(violations[0]?.message).toContain(vorm('drempel'));
  });

  test('schaduwmodus/AC-1: een regel zonder eind geeft <naam>:veld eind', async () => {
    const violations = await register({ register: [zonder(controle(), 'eind')] });
    expect(violations.map((violation) => violation.key)).toEqual(['proef:veld eind']);
    expect(violations[0]?.message).toContain(vorm('eind'));
  });

  test('schaduwmodus/AC-1: een geldige regel, een onbekend veld, een dubbele naam en een ontbrekende spec', async () => {
    expect(await register({ register: [controle()] })).toEqual([]);
    expect(tekst(await register({ register: [controle({ extra: 1 })] }))).toContain('proef: onbekend veld extra');
    expect(tekst(await register({ register: [controle(), controle()] }))).toContain(
      'proef: staat twee keer in het register',
    );
    const geenSpec = controle({ spec: 'docs/template/specs/bestaat-niet.md' });
    expect(tekst(await register({ register: [geenSpec] }))).toContain(
      'proef: spec docs/template/specs/bestaat-niet.md bestaat niet',
    );
    expect(tekst(await register({ register: [controle({ spec: 'docs/specs/x.md' })] }))).toContain(
      'proef: spec docs/specs/x.md',
    );
  });

  test('schaduwmodus/AC-1: een ongeldige naam heet #<index>; een eind vóór de start is rood', async () => {
    expect((await register({ register: [controle({ naam: 'Fout Naam' })] })).map((v) => v.key)[0]).toMatch(/^#0:/);
    const violations = await register({ register: [controle({ start: '2026-11-10', eind: '2026-11-09' })] });
    expect(tekst(violations)).toContain('proef: einddatum 2026-11-09 ligt vóór de start 2026-11-10');
  });

  test('schaduwmodus/AC-1: een ontbrekend of geen-lijst register is rood, een ongeldige gates.json laat de check gooien', async () => {
    const { registerViolations } = await laad();
    const ontbreekt = registerViolations(maakRepo({ register: null }), { ci: false });
    expect(tekst(await ontbreekt)).toContain('.kit/schaduw.json ontbreekt; een leeg register is []');
    const geenLijst = registerViolations(maakRepo({ register: '{}' }), { ci: false });
    expect(tekst(await geenLijst)).toContain('.kit/schaduw.json is geen JSON-lijst');
    const kapot = maakRepo({ gates: '{ geen json' });
    await expect((async () => registerViolations(kapot, { ci: false }))()).rejects.toThrow();
  });
});

describe('schaduw-register: de termijn van 14 dagen', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-2: eind 2026-11-16 bij start 2026-11-01 is te lang; eind 2026-11-15 niet', async () => {
    const lang = await register({ register: [controle({ start: '2026-11-01', eind: '2026-11-16' })] });
    expect(tekst(lang)).toContain(`proef: einddatum 2026-11-16 ligt ${TE_LANG} 2026-11-01 (ADR 0106 punt 3)`);
    const precies = await register({ register: [controle({ start: '2026-11-01', eind: '2026-11-15' })] });
    expect(tekst(precies)).not.toContain(TE_LANG);
    expect(precies).toEqual([]);
  });
});

const ALTIJD_HARD_IDS = [
  'R-AUTH-07',
  'R-ROL-08',
  'R-ROL-99',
  'R-WERK-09',
  'R-CODE-03',
  'R-TEST-02',
  'R-TEST-03',
  'R-TEST-04',
  'R-DB-01',
  'R-DB-05',
  'R-DB-09',
  'R-CODE-08',
  'R-SEC-01',
  'R-SEC-02',
  'R-SEC-03',
  'R-SEC-04',
  'R-SEC-05',
  'R-SEC-06',
  'R-SEC-08',
  'R-LAAG-08',
  'R-CI-01',
  'R-CI-07',
  'R-REPO-02',
  'R-PRINC-04',
];

describe('schaduw-register: ALTIJD_HARD', { timeout: 60_000 }, () => {
  test.each(ALTIJD_HARD_IDS)('schaduwmodus/AC-3: %s moet altijd meteen hard zijn', async (rid) => {
    const violations = await register({ register: [controle({ rids: [rid] })] });
    expect(tekst(violations)).toContain(`${rid} ${ALTIJD}`);
    expect(violations.every((violation) => violation.key.startsWith('proef:'))).toBe(true);
  });

  test.each(['R-WEB-01', 'R-CODE-02', 'R-DB-04', 'R-ROLX-01'])(
    'schaduwmodus/AC-3: %s mag wel in schaduw',
    async (rid) => {
      const violations = await register({ register: [controle({ rids: [rid] })] });
      expect(tekst(violations)).not.toContain('moet altijd meteen hard zijn');
      expect(violations).toEqual([]);
    },
  );

  test('schaduwmodus/AC-3: één R-id uit ALTIJD_HARD naast een toegestaan id maakt de regel rood', async () => {
    const violations = await register({ register: [controle({ rids: ['R-WEB-01', 'R-SEC-06'] })] });
    expect(tekst(violations)).toContain(`R-SEC-06 ${ALTIJD}`);
    expect(tekst(violations)).not.toContain(`R-WEB-01 ${ALTIJD}`);
  });
});

describe('schaduw-register: aangepast en verlengen', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-4: aangepast 2 is een schemafout', async () => {
    const violations = await register({ register: [controle({ aangepast: 2 })] });
    expect(violations).toHaveLength(1);
    expect(tekst(violations)).toContain(vorm('aangepast'));
  });

  test('schaduwmodus/AC-4: een later eind met aangepast op 0 geeft precies één overtreding', async () => {
    const violations = await register({
      basis: [controle({ eind: '2026-11-10' })],
      register: [controle({ eind: '2026-11-12' })],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain(VERLENGD);
  });

  test('schaduwmodus/AC-4: een regel die niet op de merge-base staat, of een vroeger eind, is geen verlenging', async () => {
    expect(await register({ basis: [], register: [controle({ eind: '2026-11-12' })] })).toEqual([]);
    const korter = await register({
      basis: [controle({ eind: '2026-11-12' })],
      register: [controle({ eind: '2026-11-10' })],
    });
    expect(korter).toEqual([]);
  });

  test('schaduwmodus/AC-4: zonder merge-base lokaal geen overtreding en in CI wel', async () => {
    const { registerViolations } = await laad();
    const dir = maakRepo({ register: [controle()], zonderOrigin: true });
    expect(await registerViolations(dir, { ci: false })).toEqual([]);
    const ci = await registerViolations(dir, { ci: true });
    expect(ci).toHaveLength(1);
    expect(tekst(ci)).toContain('merge-base');
  });

  test('schaduwmodus/AC-15: aangepast 0 naar 1 met dezelfde drempel is rood, met een andere drempel niet', async () => {
    const basis = controle({ eind: '2026-11-10', aangepast: 0 });
    const zelfde = await register({ basis: [basis], register: [controle({ eind: '2026-11-14', aangepast: 1 })] });
    expect(zelfde).toHaveLength(1);
    expect(zelfde[0]?.message).toContain(ZONDER_DREMPEL);
    const anders = controle({
      eind: '2026-11-14',
      aangepast: 1,
      drempel: { ...DREMPEL, aanpassen: 'minder dan 3 treffers' },
    });
    expect(await register({ basis: [basis], register: [anders] })).toEqual([]);
  });

  test.each([
    ['een ander eind', { eind: '2026-11-12' }],
    ['een andere start', { start: '2026-11-02' }],
    ['een andere drempel', { drempel: { ...DREMPEL, hard: 'andere drempel' } }],
    ['een lagere aangepast', { aangepast: 0 }],
  ])(
    'schaduwmodus/AC-15: op de basis aangepast 1 en HEAD heeft %s: al een keer aangepast',
    async (_naam, wijziging) => {
      const basis = controle({ aangepast: 1 });
      const violations = await register({ basis: [basis], register: [controle({ aangepast: 1, ...wijziging })] });
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain(AL_AANGEPAST);
    },
  );

  test('schaduwmodus/AC-15: op de basis aangepast 1 en een later eind geeft alleen "al een keer aangepast"', async () => {
    const violations = await register({
      basis: [controle({ aangepast: 1 })],
      register: [controle({ aangepast: 1, eind: '2026-11-12' })],
    });
    expect(violations).toHaveLength(1);
    expect(tekst(violations)).toContain(AL_AANGEPAST);
    expect(tekst(violations)).not.toContain('einddatum later dan op de merge-base');
    expect(tekst(violations)).not.toContain(ZONDER_DREMPEL);
  });

  test('schaduwmodus/AC-15: een ongewijzigde regel met aangepast 1 is groen', async () => {
    const regel = controle({ aangepast: 1 });
    expect(await register({ basis: [regel], register: [regel] })).toEqual([]);
  });
});

describe('schaduw-register: een andere drempel zonder aangepast (B-7)', { timeout: 60_000 }, () => {
  const ANDERE_DREMPEL =
    'drempel anders dan op de merge-base zonder dat aangepast is opgehoogd; een aanpassing hoogt aangepast op (ADR 0106 punt 6)';
  const anders = { ...DREMPEL, aanpassen: 'minder dan 3 treffers' };

  test('schaduwmodus/AC-16: een andere drempel met aangepast 0 geeft precies één overtreding', async () => {
    const violations = await register({ basis: [controle()], register: [controle({ drempel: anders })] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain(ANDERE_DREMPEL);
  });

  test('schaduwmodus/AC-16: een andere drempel met een later eind geeft nog steeds precies één overtreding', async () => {
    const violations = await register({
      basis: [controle({ eind: '2026-11-10' })],
      register: [controle({ eind: '2026-11-12', drempel: anders })],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain(ANDERE_DREMPEL);
    expect(tekst(violations)).not.toContain('einddatum later dan op de merge-base');
  });

  test('schaduwmodus/AC-16: dezelfde drempel en hetzelfde eind met aangepast 0 geeft niets', async () => {
    expect(await register({ basis: [controle()], register: [controle()] })).toEqual([]);
  });
});

describe('schaduw-register: de spec moet genormaliseerd zijn (B-8)', { timeout: 60_000 }, () => {
  const extra = {
    extraBestanden: { 'docs/template/adr/0106-schaduwmodus-met-tijdgrens.md': '# ADR 0106\n' },
    extraMappen: ['docs/template/specs/sub'],
  };

  test.each([
    'docs/template/specs/../adr/0106-schaduwmodus-met-tijdgrens.md',
    'docs/template/specs/./x.md',
    'docs/template/specs//x.md',
    'docs/template/specs/sub',
  ])('schaduwmodus/AC-17: spec %s meldt dat het bestand niet bestaat', async (spec) => {
    const violations = await register({ ...extra, register: [controle({ spec })] });
    expect(tekst(violations)).toContain(`proef: spec ${spec} bestaat niet`);
  });

  test('schaduwmodus/AC-17: de genormaliseerde spec docs/template/specs/x.md is groen', async () => {
    expect(await register({ ...extra, register: [controle({ spec: 'docs/template/specs/x.md' })] })).toEqual([]);
  });
});
