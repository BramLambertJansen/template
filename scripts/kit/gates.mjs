// Gate-register (framework §4, ADR 0011): de enige gate-tabel. Per script wat het bewaakt en of het snel is
// (zonder database of Docker, dus in gate:fast). test/rails/gates.test.ts eist dat `gate:fast` precies de snelle
// gates in deze volgorde draait en dat elk script bestaat; check-docs neemt dat over (roadmap stuk 4).

/** @typedef {{ script: string, bewaakt: string, snel: boolean }} Gate */

/** @type {readonly Gate[]} */
export const gates = [
  { script: 'format:check', bewaakt: 'opmaak (Prettier) van alle bestanden in git', snel: true },
  {
    script: 'lint',
    bewaakt: 'ESLint strictTypeChecked, geen casts, de rails (rails/*) en de ESLint-ratchet (eslint-suppressions.json)',
    snel: true,
  },
  { script: 'typecheck', bewaakt: 'TypeScript streng (framework §4), ook scripts/', snel: true },
  { script: 'ratchet', bewaakt: 'lagen en zones (dependency-cruiser) tegen .kit/baseline.json', snel: true },
  { script: 'test:unit', bewaakt: 'unit-tests en de fixtures van de rails (test/rails)', snel: true },
];
