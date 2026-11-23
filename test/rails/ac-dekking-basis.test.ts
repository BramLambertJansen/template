import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { docsKrimp, docsMeldingen, docsViolations } from '../../scripts/kit/check-docs.mjs';
import { roadmapVanRepo } from '../../scripts/kit/check-roadmap.mjs';

// Spec gebouwd-zonder-nummer (ADR 0104), tests vóór de bouw: de AC-dekking tegenover de merge-base met origin/main.
// AC-18 (AC verliest zijn test), AC-19 (nieuwe `status: gebouwd`), AC-21 (nieuw merkteken) en AC-26 (geen merge-base).
// Elk geval is een tijdelijke git-repo met `origin/main` op de basiscommit en daarna de werkmap als head (getrackt, niet
// gecommit). De overtredingen staan in het strikte kanaal: `docsKrimp` (de ratchet-run `check-docs (krimp)`), en nooit in
// `docsViolations`, want alleen die komt via `pnpm ratchet:update` in `.kit/baseline.json`. De tests doen daarom geen
// ratchetproces: ze toetsen beide functies tegen dezelfde repo.
const dirs: string[] = [];
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

/** Schrijft de bestanden; `null` verwijdert er een. */
function schrijf(dir: string, bestanden: Record<string, string | null>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    if (inhoud === null) {
      rmSync(path.join(dir, pad), { force: true });
      continue;
    }
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

const SPEC = 'docs/template/specs/x.md';
const TEST = 'test/x.test.ts';
const ADR = 'docs/template/adr/0100-proces.md';
const ADR_TEKST = '# 0100 — Proces\n\nStatus: geaccepteerd\n';

const ac = (n: number, namespace = 'xn') => `- **${namespace}/AC-${String(n)}** — Gegeven iets, dan iets.`;
const acMerk = (n: number) => `- **xn/AC-${String(n)}** (nog niet gebouwd) — Gegeven iets, dan iets.`;
const testTekst = (...ids: string[]) => ids.map((id) => `test('${id}: doet iets', () => {});\n`).join('');

/** Een spec; zonder `namespace` heeft ze geen namespace-regel en is de specnaam het voorvoegsel van haar AC's. */
function spec(status: string, regels: string[] = [ac(1), ac(2)], namespace: string | null = 'xn'): string {
  return [
    '---',
    `status: ${status}`,
    ...(namespace === null ? [] : [`namespace: ${namespace}`]),
    '---',
    '',
    '# X',
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    ...regels,
    '',
  ].join('\n');
}

interface Stand {
  basis: Record<string, string>;
  head?: Record<string, string | null>;
  zonderBasis?: boolean;
}
interface Repo {
  dir: string;
  voor: { violations: string[]; krimp: string[] };
}

const sleutelsVan = (lijst: readonly { key: string }[]) => lijst.map((violation) => violation.key);

/** Een repo met `basis` als origin/main (behalve bij `zonderBasis`) en daarna `head` in de werkmap, getrackt. */
async function repo(stand: Stand): Promise<Repo> {
  const dir = mkdtempSync(path.join(tmpdir(), 'ac-dekking-basis-'));
  dirs.push(dir);
  schrijf(dir, {
    'package.json': JSON.stringify({ scripts: {} }),
    'src/leeg.ts': 'export {};\n',
    [ADR]: ADR_TEKST,
    ...stand.basis,
  });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  if (stand.zonderBasis !== true) git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const voor = { violations: sleutelsVan(await docsViolations(dir)), krimp: sleutelsVan(await docsKrimp(dir)) };
  schrijf(dir, stand.head ?? {});
  git(dir, 'add', '-A');
  return { dir, voor };
}

const krimpSleutels = async (r: Repo) => sleutelsVan(await docsKrimp(r.dir));

/** De overtreding staat in het strikte kanaal met deze tekst, en niet in wat de baseline krijgt. */
async function rood(r: Repo, sleutel: string, melding?: string) {
  const krimp = await docsKrimp(r.dir);
  const gevonden = krimp.find((violation) => violation.key === sleutel);
  expect(gevonden, `${sleutel} in docsKrimp: ${JSON.stringify(sleutelsVan(krimp))}`).toBeDefined();
  if (melding !== undefined) expect(gevonden?.message).toBe(melding);
  expect(sleutelsVan(await docsViolations(r.dir)), 'nooit in de baseline').not.toContain(sleutel);
}

/** Geen sleutel die aan `deel` voldoet in het strikte kanaal. */
async function groen(r: Repo, deel: (sleutel: string) => boolean) {
  expect((await krimpSleutels(r)).filter(deel)).toStrictEqual([]);
}

// --- AC-18 -----------------------------------------------------------------------------------------------------------------

const verlies = (ac: string, id = 'xn') =>
  `${SPEC}: ${ac} was gebouwd op main, maar geen testbestand noemt ${id}/${ac} meer; herstel de test of laat de AC vervallen (Vervallen door ADR <nummer>; ADR 0104)`;
const isAcSleutel = (sleutel: string) => sleutel.startsWith('docs:ac:');
const GEBOUWD_BASIS = { [SPEC]: spec('goedgekeurd'), [TEST]: testTekst('xn/AC-1', 'xn/AC-2') };

/** Controle voor de groene gevallen: zonder de uitzondering is het verlies van AC-2 rood. */
async function controleVerlies() {
  const r = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: testTekst('xn/AC-1') } });
  await rood(r, 'docs:ac:x:AC-2', verlies('AC-2'));
}

describe('AC-18: een AC die op de merge-base gebouwd was en nu niet meer, is rood (strikt kanaal)', () => {
  test('gebouwd-zonder-nummer/AC-18: het id uit de test gehaald: docs:ac:<spec>:<AC-n> met de tekst uit de spec', async () => {
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: testTekst('xn/AC-1') } });
    await rood(r, 'docs:ac:x:AC-2', verlies('AC-2'));
    expect((await krimpSleutels(r)).filter(isAcSleutel)).toStrictEqual(['docs:ac:x:AC-2']);
  });

  test('gebouwd-zonder-nummer/AC-18: het testbestand verwijderd: elke AC die het dekte', async () => {
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: null } });
    await rood(r, 'docs:ac:x:AC-1', verlies('AC-1'));
    await rood(r, 'docs:ac:x:AC-2', verlies('AC-2'));
  });

  test('gebouwd-zonder-nummer/AC-18: de AC-regel uit een spec die blijft bestaan, zonder vervallen-vorm', async () => {
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [SPEC]: spec('goedgekeurd', [ac(1)]) } });
    await rood(r, 'docs:ac:x:AC-2', verlies('AC-2'));
  });

  test('gebouwd-zonder-nummer/AC-18: ook als de spec op de merge-base nog een oude gebouwd-regel had', async () => {
    const basis = { [SPEC]: spec('gebouwd # #5'), [TEST]: testTekst('xn/AC-1', 'xn/AC-2') };
    const r = await repo({ basis, head: { [TEST]: testTekst('xn/AC-1') } });
    await rood(r, 'docs:ac:x:AC-2', verlies('AC-2'));
  });

  test('gebouwd-zonder-nummer/AC-18: zonder namespace is de specnaam het voorvoegsel in de tekst', async () => {
    const basis = {
      [SPEC]: spec('goedgekeurd', [ac(1, 'x'), ac(2, 'x')], null),
      [TEST]: testTekst('x/AC-1', 'x/AC-2'),
    };
    const r = await repo({ basis, head: { [TEST]: testTekst('x/AC-1') } });
    await rood(r, 'docs:ac:x:AC-2', verlies('AC-2', 'x'));
  });

  test('gebouwd-zonder-nummer/AC-18: een hernoemde spec wordt met haar oude naam vergeleken; de sleutel draagt de nieuwe naam', async () => {
    const nieuw = 'docs/template/specs/y.md';
    const r = await repo({
      basis: GEBOUWD_BASIS,
      head: { [SPEC]: null, [nieuw]: spec('goedgekeurd'), [TEST]: testTekst('xn/AC-1') },
    });
    const melding = `${nieuw}: AC-2 was gebouwd op main, maar geen testbestand noemt xn/AC-2 meer; herstel de test of laat de AC vervallen (Vervallen door ADR <nummer>; ADR 0104)`;
    await rood(r, 'docs:ac:y:AC-2', melding);
    expect(await krimpSleutels(r)).not.toContain('docs:ac:x:AC-2');
  });

  test('gebouwd-zonder-nummer/AC-18: groen: de AC heeft in de werkmap de vervallen-vorm van AC-5', async () => {
    await controleVerlies();
    const vervallen = '- **xn/AC-2** — Vervallen door ADR 0100 (reden). Was: Gegeven iets, dan iets.';
    const r = await repo({
      basis: GEBOUWD_BASIS,
      head: { [SPEC]: spec('goedgekeurd', [ac(1), vervallen]), [TEST]: testTekst('xn/AC-1') },
    });
    await groen(r, isAcSleutel);
  });

  test('gebouwd-zonder-nummer/AC-18: groen: het testbestand is hernoemd en noemt het id nog', async () => {
    await controleVerlies();
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: null, 'test/y.test.ts': GEBOUWD_BASIS[TEST] } });
    await groen(r, isAcSleutel);
  });

  test('gebouwd-zonder-nummer/AC-18: groen: de spec is hernoemd en haar tests noemen het id nog', async () => {
    await controleVerlies();
    const r = await repo({
      basis: GEBOUWD_BASIS,
      head: { [SPEC]: null, 'docs/template/specs/y.md': spec('goedgekeurd') },
    });
    await groen(r, isAcSleutel);
  });

  test('gebouwd-zonder-nummer/AC-18: groen: de spec is in de werkmap verwijderd, met haar tests', async () => {
    // Controle: dezelfde test weg bij een spec die blijft is rood.
    const controle = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: null } });
    expect((await krimpSleutels(controle)).filter(isAcSleutel)).toHaveLength(2);
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [SPEC]: null, [TEST]: null } });
    await groen(r, isAcSleutel);
  });

  test('gebouwd-zonder-nummer/AC-18: groen: de spec staat in de werkmap op vervallen (OV-8), met of zonder tests', async () => {
    const controle = await repo({ basis: GEBOUWD_BASIS, head: { [TEST]: null } });
    expect((await krimpSleutels(controle)).filter(isAcSleutel)).toHaveLength(2);
    const r = await repo({ basis: GEBOUWD_BASIS, head: { [SPEC]: spec('vervallen'), [TEST]: null } });
    await groen(r, isAcSleutel);
  });

  test('gebouwd-zonder-nummer/AC-18: groen: de AC was op de merge-base niet gebouwd', async () => {
    const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: testTekst('xn/AC-1') };
    const controle = await repo({ basis, head: { [TEST]: null } });
    expect((await krimpSleutels(controle)).filter(isAcSleutel)).toStrictEqual(['docs:ac:x:AC-1']);
    const r = await repo({ basis, head: { [SPEC]: spec('goedgekeurd', [ac(1)]) } });
    await groen(r, isAcSleutel);
  });

  test.each(['voorstel', 'vervallen'])(
    'gebouwd-zonder-nummer/AC-18: groen: de spec was op de merge-base %s, ook met tests die nu verdwijnen',
    async (status) => {
      const basis = { [SPEC]: spec('goedgekeurd'), [TEST]: testTekst('xn/AC-1', 'xn/AC-2') };
      const controle = await repo({ basis, head: { [TEST]: null } });
      expect((await krimpSleutels(controle)).filter(isAcSleutel)).toHaveLength(2);
      const r = await repo({ basis: { ...basis, [SPEC]: spec(status) }, head: { [TEST]: null } });
      await groen(r, isAcSleutel);
    },
  );
});

// --- AC-19 -----------------------------------------------------------------------------------------------------------------

const STATUS_MELDING = (specpad: string) =>
  `${specpad}: status: gebouwd schrijft niemand meer; gebouwd volgt uit de AC-dekking, de statusregel draagt alleen voorstel, goedgekeurd of vervallen (ADR 0104)`;
const isStatusSleutel = (sleutel: string) => sleutel.endsWith(':status-gebouwd');
const SHA = 'a'.repeat(40);

describe('AC-19: een nieuwe status: gebouwd-regel is rood (strikt kanaal)', () => {
  test.each([
    ['een nieuwe spec', null, 'gebouwd'],
    ['goedgekeurd naar gebouwd', 'goedgekeurd', 'gebouwd'],
    ['voorstel naar gebouwd', 'voorstel', 'gebouwd'],
    ['gebouwd naar gebouwd # #5', 'gebouwd', 'gebouwd # #5'],
    ['een nieuwe gevalideerd-sha', 'gebouwd # #5', `gebouwd # #5; gevalideerd: ${SHA}`],
  ])('gebouwd-zonder-nummer/AC-19: %s', async (_naam, voor, na) => {
    const basis = voor === null ? {} : { [SPEC]: spec(voor) };
    const r = await repo({ basis, head: { [SPEC]: spec(na) } });
    await rood(r, `docs:${SPEC}:status-gebouwd`, STATUS_MELDING(SPEC));
  });

  test('gebouwd-zonder-nummer/AC-19: ook een nieuwe spec in docs/specs/ (een app)', async () => {
    const app = 'docs/specs/x.md';
    const r = await repo({ basis: {}, head: { [app]: spec('gebouwd') } });
    await rood(r, `docs:${app}:status-gebouwd`, STATUS_MELDING(app));
  });

  test.each([
    ['dezelfde oude regel gebouwd # #<n>, ongewijzigd', 'gebouwd # #5', 'gebouwd # #5'],
    ['dezelfde regel status: gebouwd, ongewijzigd', 'gebouwd', 'gebouwd'],
    ['gebouwd naar goedgekeurd', 'gebouwd # #5', 'goedgekeurd'],
    ['gebouwd naar goedgekeurd zonder commentaar', 'gebouwd', 'goedgekeurd'],
  ])('gebouwd-zonder-nummer/AC-19: groen: %s', async (_naam, voor, na) => {
    // Controle: dezelfde repo met een nieuwe sha achter de oude regel is rood.
    const controle = await repo({ basis: { [SPEC]: spec(voor) }, head: { [SPEC]: spec('gebouwd # #9') } });
    await rood(controle, `docs:${SPEC}:status-gebouwd`);
    const r = await repo({ basis: { [SPEC]: spec(voor) }, head: { [SPEC]: spec(na) } });
    await groen(r, isStatusSleutel);
  });

  test('gebouwd-zonder-nummer/AC-19: een oude gebouwd-regel die blijft staan terwijl de spec elders wijzigt, geeft geen nieuwe overtreding', async () => {
    const basis = { [SPEC]: spec('gebouwd # #5'), [TEST]: testTekst('xn/AC-1', 'xn/AC-2') };
    const head = { [SPEC]: spec('gebouwd # #5').replace('Geen nieuwe UI.', 'Geen nieuwe UI, wel een zin erbij.') };
    const controle = await repo({ basis, head: { [SPEC]: spec('gebouwd # #6') } });
    await rood(controle, `docs:${SPEC}:status-gebouwd`);
    const r = await repo({ basis, head });
    expect((await krimpSleutels(r)).filter((sleutel) => !r.voor.krimp.includes(sleutel))).toStrictEqual([]);
    expect(
      sleutelsVan(await docsViolations(r.dir)).filter((sleutel) => !r.voor.violations.includes(sleutel)),
    ).toStrictEqual([]);
  });
});

// --- AC-21 -----------------------------------------------------------------------------------------------------------------

const MERK_MELDING = (ac: string) =>
  `${SPEC}: ${ac} krijgt "(nog niet gebouwd)"; dat merkteken vervalt, een AC zonder test is vanzelf niet gebouwd (ADR 0104)`;
const isMerkSleutel = (sleutel: string) => sleutel.includes(':merkteken:');

describe('AC-21: een nieuw merkteken (nog niet gebouwd) is rood (strikt kanaal)', () => {
  const BASIS = { [SPEC]: spec('goedgekeurd', [ac(1), ac(2)]), [TEST]: testTekst('xn/AC-1') };

  test('gebouwd-zonder-nummer/AC-21: een nieuwe AC met merkteken', async () => {
    const r = await repo({ basis: BASIS, head: { [SPEC]: spec('goedgekeurd', [ac(1), ac(2), acMerk(3)]) } });
    await rood(r, `docs:${SPEC}:merkteken:AC-3`, MERK_MELDING('AC-3'));
    expect((await krimpSleutels(r)).filter(isMerkSleutel)).toStrictEqual([`docs:${SPEC}:merkteken:AC-3`]);
  });

  test('gebouwd-zonder-nummer/AC-21: het merkteken op een bestaande AC gezet', async () => {
    const r = await repo({ basis: BASIS, head: { [SPEC]: spec('goedgekeurd', [ac(1), acMerk(2)]) } });
    await rood(r, `docs:${SPEC}:merkteken:AC-2`, MERK_MELDING('AC-2'));
    expect((await krimpSleutels(r)).filter(isMerkSleutel)).toStrictEqual([`docs:${SPEC}:merkteken:AC-2`]);
  });

  test('gebouwd-zonder-nummer/AC-21: een nieuwe spec met een merkteken', async () => {
    const r = await repo({ basis: {}, head: { [SPEC]: spec('goedgekeurd', [ac(1), acMerk(2)]) } });
    await rood(r, `docs:${SPEC}:merkteken:AC-2`, MERK_MELDING('AC-2'));
  });

  test('gebouwd-zonder-nummer/AC-21: groen: het merkteken stond al op de merge-base (een app), ongewijzigd of met andere tekst', async () => {
    const basis = { [SPEC]: spec('gebouwd # #5', [ac(1), acMerk(2)]), [TEST]: testTekst('xn/AC-1') };
    // Controle: een tweede merkteken is rood.
    const controle = await repo({ basis, head: { [SPEC]: spec('gebouwd # #5', [acMerk(1), acMerk(2)]) } });
    await rood(controle, `docs:${SPEC}:merkteken:AC-1`);
    const gelijk = await repo({ basis, head: { [TEST]: testTekst('xn/AC-1', 'extra/AC-9') } });
    await groen(gelijk, isMerkSleutel);
    const andereTekst = acMerk(2).replace('Gegeven iets', 'Gegeven iets anders');
    const gewijzigd = await repo({ basis, head: { [SPEC]: spec('gebouwd # #5', [ac(1), andereTekst]) } });
    await groen(gewijzigd, isMerkSleutel);
  });

  test('gebouwd-zonder-nummer/AC-21: groen: het merkteken weggehaald', async () => {
    const basis = { [SPEC]: spec('gebouwd # #5', [ac(1), acMerk(2)]), [TEST]: testTekst('xn/AC-1') };
    const controle = await repo({ basis, head: { [SPEC]: spec('gebouwd # #5', [ac(1), acMerk(2), acMerk(3)]) } });
    await rood(controle, `docs:${SPEC}:merkteken:AC-3`);
    const r = await repo({ basis, head: { [SPEC]: spec('gebouwd # #5', [ac(1), ac(2)]) } });
    await groen(r, isMerkSleutel);
  });

  test('gebouwd-zonder-nummer/AC-21: groen: (nog niet gebouwd) achter een doelpad in docs/framework.md (R-DOC-10)', async () => {
    const regel = '- **R-X-01** Nieuw doel `src/nieuw.ts` (nog niet gebouwd)\n';
    const controle = await repo({ basis: BASIS, head: { [SPEC]: spec('goedgekeurd', [ac(1), acMerk(2)]) } });
    await rood(controle, `docs:${SPEC}:merkteken:AC-2`);
    const r = await repo({
      basis: { ...BASIS, 'docs/framework.md': '# Regelboek\n' },
      head: { 'docs/framework.md': `# Regelboek\n\n${regel}` },
    });
    await groen(r, isMerkSleutel);
  });
});

// --- AC-26 -----------------------------------------------------------------------------------------------------------------

const GEEN_BASIS =
  'geen merge-base met origin/main; de krimpcontrole (krimp-op-normen) en de AC-dekking tegenover main (ADR 0104) toetsen niets';

describe('AC-26: zonder merge-base met origin/main toetsen alleen de boomregels', () => {
  const ROOD_HEAD = {
    [SPEC]: spec('gebouwd', [ac(1), acMerk(2), '', 'Zie `scripts/kit/weg.mjs`.']),
    [TEST]: testTekst('xn/AC-1'),
  };

  test('gebouwd-zonder-nummer/AC-26: AC-18, AC-19 en AC-21 geven geen overtreding, en check:roadmap houdt roadmap:basis', async () => {
    // Controle: met een merge-base is dezelfde head rood op AC-19 en AC-21.
    const metBasis = await repo({
      basis: { [SPEC]: spec('goedgekeurd', [ac(1)]), [TEST]: testTekst('xn/AC-1') },
      head: ROOD_HEAD,
    });
    await rood(metBasis, `docs:${SPEC}:status-gebouwd`);
    await rood(metBasis, `docs:${SPEC}:merkteken:AC-2`);
    const r = await repo({ basis: ROOD_HEAD, zonderBasis: true, head: { [TEST]: null } });
    await groen(r, (sleutel) => isAcSleutel(sleutel) || isStatusSleutel(sleutel) || isMerkSleutel(sleutel));
    expect(sleutelsVan(roadmapVanRepo(r.dir))).toStrictEqual(['roadmap:basis']);
  });

  test('gebouwd-zonder-nummer/AC-26: docsMeldingen bevat precies één melding die met "let op: geen merge-base met origin/main; de krimpcontrole" begint, met de tekst uit de spec', async () => {
    const r = await repo({ basis: ROOD_HEAD, zonderBasis: true });
    const regels = (await docsMeldingen(r.dir)).filter((regel) =>
      regel.startsWith('let op: geen merge-base met origin/main; de krimpcontrole'),
    );
    expect(regels).toStrictEqual([`let op: ${GEEN_BASIS}`]);
  });

  test('gebouwd-zonder-nummer/AC-26: in CI is docs:normen:geen-basis rood met dezelfde tekst en (ADR 0067) erachter', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const r = await repo({ basis: ROOD_HEAD, zonderBasis: true });
    const melding = (await docsKrimp(r.dir)).find((violation) => violation.key === 'docs:normen:geen-basis');
    expect(melding, 'docs:normen:geen-basis').toBeDefined();
    expect(melding?.message).toContain(GEEN_BASIS);
    expect(melding?.message.endsWith('(ADR 0067)')).toBe(true);
  });

  test('gebouwd-zonder-nummer/AC-26: AC-16, AC-22 en AC-23 geven dezelfde uitslag als met merge-base (dood pad en :vorm op de boom)', async () => {
    const vorm = spec('goedgekeurd', [ac(1), ac(2), '', 'Zie `scripts/kit/weg.mjs`.']).replace(
      '## Hergebruik en UX',
      '## Kopieer de vorm van\n\n- `scripts/kit/ontbreekt.mjs`\n\n## Hergebruik en UX',
    );
    const bestanden = { [SPEC]: vorm, [TEST]: testTekst('xn/AC-1') };
    const zonder = await repo({ basis: bestanden, zonderBasis: true });
    const met = await repo({ basis: bestanden });
    const sleutels = async (r: Repo) =>
      sleutelsVan(await docsViolations(r.dir)).filter(
        (sleutel) => sleutel.includes(':dood-pad:') || sleutel.endsWith(':vorm'),
      );
    expect(await sleutels(zonder)).toStrictEqual([`docs:${SPEC}:dood-pad:scripts/kit/weg.mjs`, `docs:${SPEC}:vorm`]);
    expect(await sleutels(met)).toStrictEqual(await sleutels(zonder));
  });
});

// --- AC-29 -----------------------------------------------------------------------------------------------------------------

const ONLEESBAAR_SLEUTEL = 'docs:ac:basis-onleesbaar';
const onleesbaarMelding = (sha: string) =>
  `ac-dekking: de boom op de merge-base ${sha} is niet te lezen (git ls-tree of git cat-file faalt); de AC-dekking tegenover main toetst niets, haal origin/main opnieuw op (ADR 0104)`;

function gitUit(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}

/** Verwijdert het losse object achter `rev` (bijv. `HEAD:test/x.test.ts` of `HEAD:test`); de basiscommit blijft bestaan. */
function verwijderObject(dir: string, rev: string) {
  const id = gitUit(dir, 'rev-parse', rev);
  rmSync(path.join(dir, '.git', 'objects', id.slice(0, 2), id.slice(2)), { force: true });
}

const isBasisSleutel = (sleutel: string) => isAcSleutel(sleutel) || isStatusSleutel(sleutel) || isMerkSleutel(sleutel);

describe('AC-29: een merge-base met een onleesbare boom is rood, geen stil groen met een lege basis (strikt kanaal)', () => {
  // Basis én head hebben een oude gebouwd-regel en een merkteken: een lege basis zou status-gebouwd en merkteken-overtredingen
  // en (bij een testbestand zonder basis) AC-verlies geven.
  const BASIS = {
    [SPEC]: spec('gebouwd # #5', [ac(1), acMerk(2)]),
    [TEST]: testTekst('xn/AC-1'),
  };

  async function onleesbaar(rev: string) {
    const r = await repo({ basis: BASIS });
    // Controle: voor het wegnemen van het object is de stand groen.
    await groen(r, isBasisSleutel);
    const sha = gitUit(r.dir, 'rev-parse', 'refs/remotes/origin/main');
    expect(gitUit(r.dir, 'merge-base', 'HEAD', 'refs/remotes/origin/main')).toBe(sha);
    verwijderObject(r.dir, rev);
    return { r, sha };
  }

  test('gebouwd-zonder-nummer/AC-29: een ontbrekend blob (git cat-file faalt): precies één docs:ac:basis-onleesbaar met de tekst uit de spec', async () => {
    const { r, sha } = await onleesbaar(`HEAD:${TEST}`);
    await rood(r, ONLEESBAAR_SLEUTEL, onleesbaarMelding(sha));
    expect((await krimpSleutels(r)).filter(isBasisSleutel)).toStrictEqual([ONLEESBAAR_SLEUTEL]);
  });

  test('gebouwd-zonder-nummer/AC-29: een ontbrekend tree-object (git ls-tree faalt): precies één docs:ac:basis-onleesbaar met de tekst uit de spec', async () => {
    const { r, sha } = await onleesbaar('HEAD:test');
    await rood(r, ONLEESBAAR_SLEUTEL, onleesbaarMelding(sha));
    expect((await krimpSleutels(r)).filter(isBasisSleutel)).toStrictEqual([ONLEESBAAR_SLEUTEL]);
  });

  test('gebouwd-zonder-nummer/AC-29: een ontbrekend blob geeft geen AC-verlies, status-gebouwd of merkteken uit een lege basis', async () => {
    const { r } = await onleesbaar(`HEAD:${SPEC}`);
    const sleutels = await krimpSleutels(r);
    expect(sleutels.filter((s) => isAcSleutel(s) && s !== ONLEESBAAR_SLEUTEL)).toStrictEqual([]);
    expect(sleutels.filter(isStatusSleutel)).toStrictEqual([]);
    expect(sleutels.filter(isMerkSleutel)).toStrictEqual([]);
    expect(sleutels.filter((s) => s === ONLEESBAAR_SLEUTEL)).toHaveLength(1);
  });

  test("gebouwd-zonder-nummer/AC-29: groen: een leesbare basis zonder testbestanden, specs of ADR's geeft docs:ac:basis-onleesbaar niet", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ac-dekking-basis-'));
    dirs.push(dir);
    schrijf(dir, { 'package.json': JSON.stringify({ scripts: {} }), 'README.md': '# Leeg\n' });
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'basis');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const r: Repo = { dir, voor: { violations: [], krimp: [] } };
    expect(await krimpSleutels(r)).not.toContain(ONLEESBAAR_SLEUTEL);
    expect(sleutelsVan(await docsViolations(dir))).not.toContain(ONLEESBAAR_SLEUTEL);
  });

  test("gebouwd-zonder-nummer/AC-29: groen: een leesbare basis met tests, specs en ADR's geeft docs:ac:basis-onleesbaar niet", async () => {
    const r = await repo({ basis: BASIS });
    expect(await krimpSleutels(r)).not.toContain(ONLEESBAAR_SLEUTEL);
  });

  // Aangenomen contract: boomOpBasis gooit niet, maar zet `onleesbaar: true` op de teruggegeven boom (anders false).
  test('gebouwd-zonder-nummer/AC-29: boomOpBasis meldt een onleesbare boom met onleesbaar: true, een leesbare met false', async () => {
    const { boomOpBasis } = await import('../../scripts/kit/ac-dekking.mjs');
    const leesbaar = await repo({ basis: BASIS });
    const sha = gitUit(leesbaar.dir, 'rev-parse', 'refs/remotes/origin/main');
    expect(boomOpBasis(leesbaar.dir, sha)).toMatchObject({ onleesbaar: false });
    const { r, sha: kapot } = await onleesbaar(`HEAD:${TEST}`);
    expect(boomOpBasis(r.dir, kapot)).toMatchObject({ onleesbaar: true });
  });
});
