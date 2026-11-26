// Eén grens voor lokale belasting (weinig geheugen of hoge CPU-last): gate:fast (scripts/kit/gate-fast.mjs) laat lint en
// tests dan na elkaar draaien, Playwright (playwright.config.ts) dan met één worker en Vitest (vitest.config.ts) met hooguit
// twee, of één bij krap geheugen én hoge last. Alleen de planning verandert, nooit welke check draait. De meting gebeurt
// één keer, bij de start; last die later ontstaat, schakelt niets meer om (leerpunt #1000).
import os from 'node:os';

const GIB = 1024 ** 3;

/** @typedef {{ override?: string, totaal?: number, beschikbaar?: number, platform?: string, last?: number, cpus?: number }} Meting */

/**
 * Krap geheugen: minder dan 6 GiB beschikbaar. Op macOS telt libuv alleen vrije pagina's (geen inactieve of cache), dus is
 * `availableMemory()` daar structureel laag; daar telt een totaal van hooguit 8 GiB als krap. Elders geen totaalgrens: een
 * CI-runner met 8 GB blijft parallel.
 * @param {Meting} [meting]
 */
export function geheugenKrap({
  totaal = os.totalmem(),
  beschikbaar = process.availableMemory(),
  platform = process.platform,
} = {}) {
  return platform === 'darwin' ? totaal <= 8 * GIB : beschikbaar < 6 * GIB;
}

/**
 * Hoge CPU-last: een loadavg over 1 minuut van minstens het aantal cores, bijvoorbeeld door een tweede sessie (leerpunt
 * #1000). Het is een gemiddelde dat achterloopt. Op Windows is loadavg altijd 0, daar is de last nooit hoog.
 * @param {Meting} [meting]
 */
export function hogeLast({ last = os.loadavg()[0] ?? 0, cpus = os.availableParallelism() } = {}) {
  return last >= cpus;
}

/**
 * Beperkte planning? `GATE_WEINIG_GEHEUGEN=1|0` beslist voor de host; anders krap geheugen of hoge CPU-last. De naam is
 * ouder dan de lastcheck.
 * @param {Meting} [meting]
 */
export function weinigGeheugen(meting = {}) {
  const { override = process.env['GATE_WEINIG_GEHEUGEN'] } = meting;
  if (override === '1') return true;
  if (override === '0') return false;
  return geheugenKrap(meting) || hogeLast(meting);
}

/**
 * Krap geheugen én hoge last: dan draait Vitest met één worker. `GATE_WEINIG_GEHEUGEN=0` zet het uit; `1` alleen maakt het
 * niet waar.
 * @param {Meting} [meting]
 */
export function krapEnBelast(meting = {}) {
  const { override = process.env['GATE_WEINIG_GEHEUGEN'] } = meting;
  if (override === '0') return false;
  return geheugenKrap(meting) && hogeLast(meting);
}

/**
 * Het aantal Vitest-workers: hooguit vier, bij een beperkte planning hooguit twee, bij krap geheugen én hoge last één,
 * minstens één. Met vier workers liepen web-tests bij minder dan 6 GiB vrij af op hun limiet van 5 s terwijl ze los in 1,4 s
 * slaagden (leerpunt #866).
 * @param {{ beperkt: boolean, cpus: number, krapEnBelast?: boolean }} opties
 * @returns {number}
 */
export function vitestWorkers({ beperkt, cpus, krapEnBelast: enBelast = false }) {
  if (enBelast) return 1;
  return Math.max(1, Math.min(beperkt ? 2 : 4, cpus));
}
