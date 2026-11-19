import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// kooi/AC-7 (ADR 0072), het CI- en docs-deel: de job gate:fast installeert altijd bubblewrap en laadt een AppArmor-profiel dat
// alleen /usr/bin/bwrap een user-namespace geeft, vóór `pnpm gate:fast`; docs/ENVIRONMENT.md noemt bubblewrap als vereiste voor
// gate:fast. Het doctor-deel staat in test/scripts/doctor.test.ts. Statisch gelezen, zoals test/rails/leerpunt-workflow.test.ts.
const ROOT = path.resolve(import.meta.dirname, '../..');
const CI = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const ENVIRONMENT = readFileSync(path.join(ROOT, 'docs/ENVIRONMENT.md'), 'utf8');
const INSTALL = 'sudo apt-get install -y -q bubblewrap';

/** Het blok van een job: van `  <id>:` tot de volgende job op dezelfde inspringing. */
function job(id: string): string {
  const begin = CI.indexOf(`\n  ${id}:\n`);
  expect(begin, `job ${id} in ci.yml`).toBeGreaterThan(-1);
  const rest = CI.slice(begin + 1);
  const volgende = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return volgende === -1 ? rest : rest.slice(0, volgende + 1);
}

/** De stappen van een job, elk vanaf zijn `      - `-regel; commentaar vóór een stap hoort bij de stap ervoor. */
function stappen(blok: string): string[] {
  return blok.split(/\n(?= {6}- )/).slice(1);
}

describe('kooi/AC-7: de kooi in de job gate:fast', () => {
  const blok = job('gate-fast-part');
  const alle = stappen(blok);
  const kooi = alle.find((stap) => stap.includes(INSTALL)) ?? '';

  test('kooi/AC-7: gate-fast-part draait onder de naam gate:fast', () => {
    expect(blok).toMatch(/^ {4}name: gate:fast \(/m);
  });

  test('kooi/AC-7: één stap installeert bubblewrap, altijd (zonder if:)', () => {
    expect(kooi).toContain(INSTALL);
    expectAbsent(kooi, /^ {6}- if:|^ {8}if:/m, {
      recognizes: ["      - if: matrix.deel == 'checks'", "        if: github.event_name == 'push'"],
      allows: ['      - run: |', `          ${INSTALL}`],
    });
  });

  test('kooi/AC-7: het AppArmor-profiel geeft alleen /usr/bin/bwrap een user-namespace en wordt geladen', () => {
    expect(kooi).toContain('profile bwrap /usr/bin/bwrap flags=(unconfined)');
    expect(kooi).toContain('userns,');
    expect(kooi).toContain('sudo apparmor_parser -r /etc/apparmor.d/bwrap');
  });

  test('kooi/AC-7: de kooistap komt vóór pnpm gate:fast', () => {
    const kooiIndex = alle.indexOf(kooi);
    const gateIndex = alle.findIndex((stap) => stap.includes('run: pnpm gate:fast'));
    expect(kooiIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(kooiIndex);
  });
});

test('kooi/AC-7: docs/ENVIRONMENT.md noemt bubblewrap als vereiste voor gate:fast', () => {
  const regels = ENVIRONMENT.split('\n').filter((regel) => regel.includes('bubblewrap') && regel.includes('gate:fast'));
  expect(regels.length).toBeGreaterThan(0);
});
