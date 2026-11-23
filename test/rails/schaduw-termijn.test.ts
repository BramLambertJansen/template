import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  GATES_APP,
  RATCHET,
  ROOT,
  controle,
  laad,
  maakRepo,
  ratchet,
  ruimOp,
  tekst,
  type Uitvoerders,
} from './schaduw-kit';

// Spec schaduwmodus (docs/template/specs/schaduwmodus.md), AC-5 t/m AC-9 en AC-13: het kanaal `schaduw-termijn`, de
// meldingen en de uitvoerders. De datum is de committerdatum van HEAD, nooit de klok. Tests vóór de bouw.
afterEach(ruimOp);

const EIND = '2026-12-01';
const REGEL = controle({ start: '2026-11-20', eind: EIND });
const AFGELOPEN = `de schaduwperiode liep af op ${EIND} (commitdatum HEAD 2026-12-02); leg het besluit voor: hard, aangepast of verwijderd (ADR 0106 punt 6)`;
const NIET_VOLLEDIG = 'draaide niet volledig; een controle in schaduw draait altijd, nooit als skip (ADR 0106 punt 4)';

describe('schaduw-termijn: na de einddatum', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-5: pnpm ratchet is rood met exitcode 1 als de commitdatum na eind ligt', () => {
    const dir = maakRepo({ register: [REGEL], datum: '2026-12-02T12:00:00Z' });
    const r = ratchet(dir);
    expect(r.stderr).toContain('✗ schaduw-termijn: proef');
    expect(r.stderr).toContain(AFGELOPEN);
    expect(r.status).toBe(1);
  });

  test('schaduwmodus/AC-5: de overtreding heeft sleutel <naam> en de melding uit de spec', async () => {
    const { termijnViolations } = await laad();
    const violations = await termijnViolations(maakRepo({ register: [REGEL], datum: '2026-12-02T12:00:00Z' }), {});
    expect(violations).toEqual([{ key: 'proef', message: AFGELOPEN }]);
  });

  test('schaduwmodus/AC-5: de datum is die van de committer (zijn tijdzone), niet UTC en niet de klok', async () => {
    const { termijnViolations } = await laad();
    // 2026-12-01T22:30Z is in UTC nog eind, maar de committer in +02:00 zit al op 2026-12-02.
    const laat = await termijnViolations(maakRepo({ register: [REGEL], datum: '2026-12-02T00:30:00+02:00' }), {});
    expect(laat.map((violation) => violation.key)).toEqual(['proef']);
    // 2026-12-02T04:30Z is in UTC na eind, maar de committer in -05:00 zit nog op 2026-12-01.
    const vroeg = await termijnViolations(maakRepo({ register: [REGEL], datum: '2026-12-01T23:30:00-05:00' }), {});
    expect(vroeg).toEqual([]);
  });

  test('schaduwmodus/AC-5: een commitdatum voor eind is groen, ook als de klok al voorbij eind is', async () => {
    const { termijnViolations } = await laad();
    const verlopen = controle({ start: '2026-11-01', eind: '2026-11-10' });
    expect(await termijnViolations(maakRepo({ register: [verlopen], datum: '2026-11-05T12:00:00Z' }), {})).toEqual([]);
  });

  test('schaduwmodus/AC-5: een lege repo zonder commit is rood met "geen commitdatum van HEAD"', async () => {
    const { termijnViolations } = await laad();
    const dir = mkdtempSync(path.join(tmpdir(), 'schaduw-leeg-'));
    writeFileSync(path.join(dir, 'x'), '');
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('mkdir', ['-p', '.claude', '.kit'], { cwd: dir });
    writeFileSync(path.join(dir, '.claude/gates.json'), JSON.stringify({ onderhoud: { repository: 'a/b' } }));
    writeFileSync(path.join(dir, '.kit/schaduw.json'), '[]\n');
    expect(tekst(await termijnViolations(dir, {}))).toContain('geen commitdatum van HEAD');
  });
});

describe('schaduw-termijn: de waarschuwing drie dagen voor eind', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-6: bij commitdatum 2026-11-28 staat "loopt af op 2026-12-01 (nog 3 dagen)" in de meldingen, exit 0', () => {
    const r = ratchet(maakRepo({ register: [REGEL], datum: '2026-11-28T12:00:00Z' }));
    expect(r.stdout).toContain(
      `schaduw-termijn: proef loopt af op ${EIND} (nog 3 dagen); leg vóór die datum het besluit voor`,
    );
    expect(r.status, r.stderr).toBe(0);
  });

  test('schaduwmodus/AC-6: bij 2026-11-27 komt er geen melding, op eind zelf "nog 0 dagen" met exit 0', async () => {
    const { termijnMeldingen, termijnViolations } = await laad();
    expect(await termijnMeldingen(maakRepo({ register: [REGEL], datum: '2026-11-27T12:00:00Z' }), {})).toEqual([]);
    const opEind = maakRepo({ register: [REGEL], datum: '2026-12-01T12:00:00Z' });
    expect(await termijnMeldingen(opEind, {})).toEqual([
      `proef loopt af op ${EIND} (nog 0 dagen); leg vóór die datum het besluit voor`,
    ]);
    expect(await termijnViolations(opEind, {})).toEqual([]);
  });

  test('schaduwmodus/AC-6: termijnMeldingen geeft de regel zonder voorvoegsel', async () => {
    const { termijnMeldingen } = await laad();
    const dir = maakRepo({ register: [REGEL], datum: '2026-11-29T12:00:00Z' });
    expect(await termijnMeldingen(dir, {})).toEqual([
      `proef loopt af op ${EIND} (nog 2 dagen); leg vóór die datum het besluit voor`,
    ]);
  });
});

const uitvoerder = (uitkomst: unknown) => () => Promise.resolve(uitkomst);

describe('schaduw-termijn: uitvoerders', { timeout: 60_000 }, () => {
  test.each(['check', 'lintregel'])('schaduwmodus/AC-7: een %s zonder uitvoerder is strikt rood', async (soort) => {
    const { termijnViolations } = await laad();
    const dir = maakRepo({ register: [controle({ soort })], datum: '2026-11-05T12:00:00Z' });
    const violations = await termijnViolations(dir, {});
    expect(violations).toHaveLength(1);
    expect(tekst(violations)).toContain('proef: geen uitvoerder proef in de map schaduw van de ratchet');
  });

  test.each([
    ['overgeslagen', { overgeslagen: 'reden' }],
    ['een lege uitkomst', {}],
    ['undefined', undefined],
    ['treffers als tekst', { treffers: 'x' }],
  ])('schaduwmodus/AC-7: een check met een uitvoerder die %s teruggeeft is rood', async (_naam, uitkomst) => {
    const { termijnViolations } = await laad();
    const dir = maakRepo({ register: [controle({ soort: 'check' })] });
    const violations = await termijnViolations(dir, { proef: uitvoerder(uitkomst) });
    expect(violations).toHaveLength(1);
    expect(tekst(violations)).toContain(`proef: ${NIET_VOLLEDIG}`);
  });

  test('schaduwmodus/AC-7: een lintregel waarvan de uitvoerder gooit is rood', async () => {
    const { termijnViolations } = await laad();
    const dir = maakRepo({ register: [controle({ soort: 'lintregel' })] });
    const kapot: Uitvoerders = { proef: () => Promise.reject(new Error('stuk')) };
    const violations = await termijnViolations(dir, kapot);
    expect(violations).toHaveLength(1);
    expect(tekst(violations)).toContain(`proef: ${NIET_VOLLEDIG}`);
  });

  test('schaduwmodus/AC-7: een uitvoerder zonder registerregel is rood met sleutel schaduw:<naam>', async () => {
    const { termijnViolations } = await laad();
    const dir = maakRepo({ register: [] });
    const violations = await termijnViolations(dir, { spook: uitvoerder({ treffers: [] }) });
    expect(violations).toEqual([{ key: 'schaduw:spook', message: 'staat niet in .kit/schaduw.json' }]);
  });

  test('schaduwmodus/AC-7: een hook zonder uitvoerder en een check zonder treffers zijn niet rood', async () => {
    const { termijnViolations } = await laad();
    const hook = maakRepo({ register: [controle({ soort: 'hook' })] });
    expect(await termijnViolations(hook, {})).toEqual([]);
    const check = maakRepo({ register: [controle({ soort: 'check' })] });
    expect(await termijnViolations(check, { proef: uitvoerder({ treffers: [] }) })).toEqual([]);
  });

  test('schaduwmodus/AC-8: een uitvoerder met treffers x geeft de regel "a: x" en draait één keer', async () => {
    const { termijnMeldingen, termijnViolations, trefferMeldingen } = await laad();
    const dir = maakRepo({ register: [controle({ naam: 'a', soort: 'check' })] });
    let aantal = 0;
    const uitvoerders: Uitvoerders = {
      a: () => {
        aantal += 1;
        return Promise.resolve({ treffers: ['x'] });
      },
    };
    expect(await termijnViolations(dir, uitvoerders)).toEqual([]);
    expect(await termijnMeldingen(dir, uitvoerders)).toEqual([]);
    expect(await trefferMeldingen(dir, uitvoerders)).toEqual(['a: x']);
    expect(aantal).toBe(1);
  });

  test('schaduwmodus/AC-8: in de ratchet staat precies "schaduw: a: x" in de meldingen, één run, geen strikte overtreding', () => {
    const dir = maakRepo({ register: [controle({ naam: 'a', soort: 'check' })] });
    const script = path.join(mkdtempSync(path.join(tmpdir(), 'schaduw-wrap-')), 'wrap.mjs');
    writeFileSync(
      script,
      `const m = await import(${JSON.stringify(pathToFileURL(RATCHET).href)});
let aantal = 0;
m.schaduw.a = () => { aantal += 1; return Promise.resolve({ treffers: ['x'] }); };
const regels = [];
for (const naam of ['schaduw-termijn', 'schaduw'])
  for (const melding of await m.meldingen[naam]()) regels.push(naam + ': ' + melding);
const strikt = [];
for (const naam of ['schaduw-register', 'schaduw-termijn']) strikt.push(...(await m.strikt[naam]()));
console.log(JSON.stringify({ regels, strikt, aantal }));
`,
    );
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ regels: ['schaduw: a: x'], strikt: [], aantal: 1 });
  });
});

describe('schaduw-termijn: in een app', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-9: zonder onderhoud geen overtreding, geen melding en draaien de uitvoerders niet', async () => {
    const { registerViolations, termijnViolations, termijnMeldingen, trefferMeldingen } = await laad();
    const ongeldig = { ...controle({ soort: 'check', eind: '2026-11-10' }), onzin: true };
    const dir = maakRepo({ gates: GATES_APP, register: [ongeldig], datum: '2026-12-05T12:00:00Z' });
    let aantal = 0;
    const uitvoerders: Uitvoerders = {
      proef: () => {
        aantal += 1;
        return Promise.resolve({ treffers: ['x'] });
      },
    };
    expect(await registerViolations(dir, { ci: true })).toEqual([]);
    expect(await termijnViolations(dir, uitvoerders)).toEqual([]);
    expect(await termijnMeldingen(dir, uitvoerders)).toEqual([]);
    expect(await trefferMeldingen(dir, uitvoerders)).toEqual([]);
    expect(aantal).toBe(0);
  });

  test('schaduwmodus/AC-9: een onleesbare gates.json laat de termijncheck gooien, geen stil groen', async () => {
    const { termijnViolations } = await laad();
    const dir = maakRepo({ gates: '{ geen json', register: [] });
    await expect(termijnViolations(dir, {})).rejects.toThrow();
  });
});

describe('schaduw-termijn: de repo na de bouw', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-13: strikt bevat schaduw-register en schaduw-termijn en .kit/schaduw.json is []', async () => {
    const ratchetModule: unknown = await import(pathToFileURL(RATCHET).href);
    const strikt: unknown =
      typeof ratchetModule === 'object' && ratchetModule !== null ? Reflect.get(ratchetModule, 'strikt') : undefined;
    expect(typeof strikt === 'object' && strikt !== null ? Object.keys(strikt) : []).toEqual(
      expect.arrayContaining(['schaduw-register', 'schaduw-termijn']),
    );
    const register = path.join(ROOT, '.kit/schaduw.json');
    expect(existsSync(register), '.kit/schaduw.json ontbreekt').toBe(true);
    expect(JSON.parse(readFileSync(register, 'utf8'))).toEqual([]);
  });

  test('schaduwmodus/AC-13: een groene ratchet eindigt met een regel die na strikt: ook schaduw-termijn noemt', () => {
    const r = ratchet(maakRepo({ register: [] }));
    expect(r.status, r.stderr).toBe(0);
    const laatste = r.stdout.trim().split('\n').at(-1) ?? '';
    expect(laatste).toMatch(/^✓ ratchet: geen nieuwe of opgeloste overtredingen \(.+\); strikt: .+$/);
    expect(laatste.split('; strikt: ')[1]?.split(', ')).toEqual(
      expect.arrayContaining(['schaduw-termijn', 'schaduw-register']),
    );
  });
});

describe('schaduw-termijn: een dubbele naam in het register (B-10)', { timeout: 60_000 }, () => {
  test('schaduwmodus/AC-19: alleen de eerste regel met die naam telt voor termijn, meldingen en uitvoerder', async () => {
    const { registerViolations, termijnMeldingen, termijnViolations, trefferMeldingen } = await laad();
    const eerste = controle({ naam: 'a', soort: 'check', start: '2026-11-01', eind: '2026-11-07' });
    const tweede = controle({ naam: 'a', soort: 'check', start: '2026-10-20', eind: '2026-10-30' });
    const dir = maakRepo({ register: [eerste, tweede], datum: '2026-11-05T12:00:00Z' });
    const uitvoerders: Uitvoerders = { a: uitvoerder({ treffers: ['x'] }) };

    expect(await termijnMeldingen(dir, uitvoerders)).toEqual([
      'a loopt af op 2026-11-07 (nog 2 dagen); leg vóór die datum het besluit voor',
    ]);
    expect(await trefferMeldingen(dir, uitvoerders)).toEqual(['a: x']);
    expect(await termijnViolations(dir, uitvoerders)).toEqual([]);
    expect(tekst(await registerViolations(dir, { ci: false }))).toContain('a: staat twee keer in het register');
  });
});
