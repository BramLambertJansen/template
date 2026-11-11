import { inject, TestRunner } from 'vitest';
import { proefOordeel } from '../../scripts/kit/kooi.mjs';

// Spec tests-naar-vermogen (ADR 0088): één vermogen, `kooi`. De globale setup draait de proef één keer per testrun, voor de
// projecten unit en web, en geeft de uitslag door met `provide`; een test leest hem met `vermogen('kooi')` en slaat alleen
// over als de kooi hier niet kan starten. In CI slaat niets over: ontbreekt de kooi daar, dan faalt de setup. Geen variabele
// schakelt overslaan; de proef meet de omgeving. Getest in test/setup/vermogen.test.ts.
export type Kooi = { soort: 'goed' | 'start-niet' | 'schermt-niet-af'; melding: string };

declare module 'vitest' {
  interface ProvidedContext {
    kooi: Kooi;
  }
}

/** CI is `GITHUB_ACTIONS` of `CI` met een niet-lege waarde anders dan `false` of `0` (AC-6). */
export function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['GITHUB_ACTIONS', 'CI'].some((naam) => {
    const waarde = env[naam];
    return waarde !== undefined && waarde !== '' && waarde !== 'false' && waarde !== '0';
  });
}

export default function setup(
  project: { provide: (sleutel: 'kooi', waarde: Kooi) => void },
  proef: () => Kooi = proefOordeel,
): void {
  const kooi = proef();
  if (kooi.soort === 'start-niet' && isCi())
    throw new Error(`✗ kooi ontbreekt in CI (${kooi.melding}); in CI slaat geen test over (ADR 0088)`);
  project.provide('kooi', kooi);
}

function isKooi(waarde: unknown): waarde is Kooi {
  if (typeof waarde !== 'object' || waarde === null) return false;
  const soort: unknown = Reflect.get(waarde, 'soort');
  return typeof soort === 'string' && typeof Reflect.get(waarde, 'melding') === 'string';
}

/**
 * De uitslag van de proef voor een test: `ontbreekt` alleen als de kooi hier niet kan starten. Levert de setup niets
 * (een project zonder deze globale setup), dan gooit dit: dicht vallen, nooit stil overslaan (AC-2).
 */
export function vermogen(
  naam: 'kooi',
  lees: (sleutel: 'kooi') => unknown = inject,
): { ontbreekt: boolean; melding: string } {
  const kooi = lees(naam);
  if (!isKooi(kooi)) {
    const project = TestRunner.getCurrentTest()?.file.projectName ?? 'onbekend';
    throw new Error(
      `✗ vermogen ${naam}: de globale setup test/setup/vermogen.ts leverde niets in project ${project}; voeg hem toe aan dat project in vitest.config.ts`,
    );
  }
  return { ontbreekt: kooi.soort === 'start-niet', melding: kooi.melding };
}
