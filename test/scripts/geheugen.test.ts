import { expect, test } from 'vitest';
import { geheugenKrap, hogeLast, krapEnBelast, vitestWorkers, weinigGeheugen } from '../../scripts/kit/geheugen.mjs';
import { expectNegativeTable } from '../support/negative-table';

const GIB = 1024 ** 3;
// Een lege override telt als geen override, los van GATE_WEINIG_GEHEUGEN in de omgeving van de testrun.
// Lage last en vaste cpus: zonder deze velden meet weinigGeheugen de echte CPU-last van de machine.
const ruim = { override: '', totaal: 32 * GIB, beschikbaar: 16 * GIB, platform: 'linux', last: 0, cpus: 4 };

test('ruime host: geen beperking', () => {
  expect(weinigGeheugen(ruim)).toBe(false);
});

test.each([
  { override: '1', verwacht: true, meting: ruim },
  { override: '0', verwacht: false, meting: { ...ruim, totaal: 4 * GIB, beschikbaar: 1 * GIB } },
])('GATE_WEINIG_GEHEUGEN=$override wint van de meting', ({ override, verwacht, meting }) => {
  expect(weinigGeheugen({ ...meting, override })).toBe(verwacht);
});

test.each([
  { totaal: 8 * GIB, verwacht: true },
  { totaal: 8 * GIB + 1, verwacht: false },
])('macOS met totaal $totaal: tot en met 8 GiB is weinig', ({ totaal, verwacht }) => {
  expect(weinigGeheugen({ ...ruim, totaal, platform: 'darwin' })).toBe(verwacht);
});

test.each(['linux', 'win32'])(
  '%s met 8 GiB totaal en genoeg beschikbaar: geen beperking (CI-runner blijft parallel)',
  (platform) => {
    expect(weinigGeheugen({ ...ruim, totaal: 8 * GIB, beschikbaar: 6 * GIB, platform })).toBe(false);
  },
);

test.each([
  { platform: 'linux', verwacht: true },
  { platform: 'win32', verwacht: true },
  { platform: 'darwin', verwacht: false },
])('minder dan 6 GiB beschikbaar op $platform: weinig behalve op macOS', ({ platform, verwacht }) => {
  expect(weinigGeheugen({ ...ruim, beschikbaar: 6 * GIB - 1, platform })).toBe(verwacht);
});

test('macOS met hooguit 8 GiB totaal: toch weinig', () => {
  expect(weinigGeheugen({ ...ruim, totaal: 8 * GIB, beschikbaar: GIB, platform: 'darwin' })).toBe(true);
});

// Hoge CPU-last (leerpunt #1000): last >= cpus beperkt de planning op elk platform, ook met genoeg geheugen.
const rustig = { ...ruim, last: 1, cpus: 8 };
const drukBasis = { ...ruim, last: 8, cpus: 8 };

test.each([
  { naam: 'last gelijk aan cpus', meting: { ...ruim, last: 8, cpus: 8 } },
  { naam: 'last boven cpus', meting: { ...ruim, last: 12.5, cpus: 8 } },
  { naam: 'last gelijk aan cpus op win32', meting: { ...ruim, last: 4, cpus: 4, platform: 'win32' } },
  { naam: 'last gelijk aan cpus op darwin', meting: { ...ruim, last: 4, cpus: 4, platform: 'darwin' } },
])('hoge CPU-last met genoeg geheugen: $naam is weinig', ({ meting }) => {
  expect(weinigGeheugen(meting)).toBe(true);
});

test('lage CPU-last met genoeg geheugen: geen beperking', () => {
  expect(weinigGeheugen(rustig)).toBe(false);
});

test('last net onder cpus: geen beperking (basis last = cpus is wel weinig)', () => {
  expectNegativeTable({
    base: drukBasis,
    check: (meting) => weinigGeheugen(meting),
    cases: [{ name: 'last net onder cpus', change: (basis) => ({ ...basis, last: 8 - 0.01 }) }],
  });
});

test('GATE_WEINIG_GEHEUGEN=0 wint van hoge last (en van weinig geheugen)', () => {
  expectNegativeTable({
    base: { ...ruim, last: 16, cpus: 8 },
    check: (meting) => weinigGeheugen(meting),
    cases: [
      { name: 'override 0 bij hoge last', change: (basis) => ({ ...basis, override: '0' }) },
      {
        name: 'override 0 bij hoge last en weinig geheugen',
        change: (basis) => ({ ...basis, beschikbaar: GIB, override: '0' }),
      },
    ],
  });
});

test('GATE_WEINIG_GEHEUGEN=1 blijft weinig bij lage last', () => {
  expect(weinigGeheugen({ ...rustig, override: '1' })).toBe(true);
});

test.each([
  { naam: 'linux onder 6 GiB beschikbaar', meting: { ...rustig, beschikbaar: 6 * GIB - 1 }, verwacht: true },
  { naam: 'linux op 6 GiB beschikbaar', meting: { ...rustig, beschikbaar: 6 * GIB }, verwacht: false },
  { naam: 'darwin met 8 GiB totaal', meting: { ...rustig, totaal: 8 * GIB, platform: 'darwin' }, verwacht: true },
  {
    naam: 'darwin met meer dan 8 GiB',
    meting: { ...rustig, totaal: 8 * GIB + 1, platform: 'darwin' },
    verwacht: false,
  },
  {
    naam: 'darwin met weinig beschikbaar',
    meting: { ...rustig, beschikbaar: GIB, platform: 'darwin' },
    verwacht: false,
  },
])('geheugenregels ongewijzigd bij lage last: $naam', ({ meting, verwacht }) => {
  expect(weinigGeheugen(meting)).toBe(verwacht);
});

// Krap geheugen los van override en last (geheugenKrap).
const krap = { totaal: 32 * GIB, beschikbaar: GIB, platform: 'linux' };

test('geheugenKrap: weinig beschikbaar geheugen is krap, ook met override en hoge last in de meting', () => {
  expect(geheugenKrap(krap)).toBe(true);
  expect(geheugenKrap({ ...krap, override: '0', last: 0, cpus: 4 })).toBe(true);
});

test('geheugenKrap: genoeg geheugen is niet krap, ook met override 1 en hoge last in de meting', () => {
  expect(geheugenKrap({ ...krap, beschikbaar: 6 * GIB })).toBe(false);
  expect(geheugenKrap({ ...krap, beschikbaar: 6 * GIB, override: '1', last: 99, cpus: 1 })).toBe(false);
});

test('geheugenKrap: elke geheugenvoorwaarde bewaakt', () => {
  expectNegativeTable({
    base: krap,
    check: (meting) => geheugenKrap(meting),
    cases: [
      { name: 'op 6 GiB beschikbaar', change: (basis) => ({ ...basis, beschikbaar: 6 * GIB }) },
      { name: 'macOS ruim totaal', change: (basis) => ({ ...basis, platform: 'darwin', totaal: 8 * GIB + 1 }) },
    ],
  });
});

test('geheugenKrap: macOS telt het totaal, tot en met 8 GiB', () => {
  expect(geheugenKrap({ totaal: 8 * GIB, beschikbaar: 32 * GIB, platform: 'darwin' })).toBe(true);
});

test('hogeLast: last gelijk aan of boven cpus is hoog', () => {
  expect(hogeLast({ last: 8, cpus: 8 })).toBe(true);
  expect(hogeLast({ last: 12.5, cpus: 8 })).toBe(true);
});

test('hogeLast: net onder cpus is niet hoog', () => {
  expectNegativeTable({
    base: { last: 8, cpus: 8 },
    check: (meting) => hogeLast(meting),
    cases: [
      { name: 'last net onder cpus', change: (basis) => ({ ...basis, last: 8 - 0.01 }) },
      { name: 'één cpu meer', change: (basis) => ({ ...basis, cpus: 9 }) },
    ],
  });
});

// krapEnBelast: alleen krap geheugen én hoge last; override 0 wint, override 1 alleen maakt het niet waar.
const krapBelast = { ...ruim, beschikbaar: GIB, last: 8, cpus: 8 };

test('krapEnBelast: krap geheugen en hoge last is waar', () => {
  expect(krapEnBelast(krapBelast)).toBe(true);
});

test('krapEnBelast: override 1 met krap geheugen en hoge last blijft waar', () => {
  expect(krapEnBelast({ ...krapBelast, override: '1' })).toBe(true);
});

test('krapEnBelast: de andere drie combinaties van krap en last zijn onwaar, en override 0 wint', () => {
  expectNegativeTable({
    base: krapBelast,
    check: (meting) => krapEnBelast(meting),
    cases: [
      { name: 'wel krap, geen hoge last', change: (basis) => ({ ...basis, last: 0 }) },
      { name: 'niet krap, wel hoge last', change: (basis) => ({ ...basis, beschikbaar: 16 * GIB }) },
      { name: 'niet krap en geen hoge last', change: (basis) => ({ ...basis, beschikbaar: 16 * GIB, last: 0 }) },
      { name: 'override 0 bij krap en hoge last', change: (basis) => ({ ...basis, override: '0' }) },
      {
        name: 'override 1, niet krap, wel hoge last',
        change: (basis) => ({ ...basis, beschikbaar: 16 * GIB, override: '1' }),
      },
      { name: 'override 1, wel krap, geen hoge last', change: (basis) => ({ ...basis, last: 0, override: '1' }) },
      {
        name: 'override 1, niet krap en geen last',
        change: (basis) => ({ ...basis, beschikbaar: 16 * GIB, last: 0, override: '1' }),
      },
    ],
  });
});

test.each([{ beperkt: true }, { beperkt: false }])(
  'vitestWorkers met krapEnBelast beperkt=$beperkt geeft 1, ook bij 16 cpus',
  ({ beperkt }) => {
    expect(vitestWorkers({ beperkt, cpus: 16, krapEnBelast: true })).toBe(1);
  },
);

test.each([
  { beperkt: true, krapEnBelast: false, cpus: 16, verwacht: 2 },
  { beperkt: false, krapEnBelast: false, cpus: 16, verwacht: 4 },
  { beperkt: true, krapEnBelast: undefined, cpus: 16, verwacht: 2 },
  { beperkt: false, krapEnBelast: undefined, cpus: 2, verwacht: 2 },
])(
  'vitestWorkers zonder krapEnBelast ($krapEnBelast) blijft ongewijzigd: beperkt=$beperkt cpus=$cpus',
  ({ krapEnBelast: kb, ...rest }) => {
    const { verwacht, ...opties } = rest;
    expect(vitestWorkers(kb === undefined ? opties : { ...opties, krapEnBelast: kb })).toBe(verwacht);
  },
);
