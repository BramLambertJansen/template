import { expect, test } from 'vitest';
import { weinigGeheugen } from '../../scripts/kit/geheugen.mjs';
import { expectNegativeTable } from '../support/negative-table';

const GIB = 1024 ** 3;
// Een lege override telt als geen override, los van GATE_WEINIG_GEHEUGEN in de omgeving van de testrun.
const ruim = { override: '', totaal: 32 * GIB, beschikbaar: 16 * GIB, platform: 'linux' };

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
