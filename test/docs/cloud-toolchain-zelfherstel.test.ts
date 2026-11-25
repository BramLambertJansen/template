import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec cloud-toolchain-zelfherstel, AC-12: de documentatie zegt dat de omgevingscache niet vervalt bij een pin-bump, dat de
// startup-hook dan herstelt als de invoer gelijk is aan main, en wat een sessie ziet en doet; R-TOOL-01 noemt ADR 0112.
const lees = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');
const environment = lees('docs/ENVIRONMENT.md');
const framework = lees('docs/framework.md');

/** De tekst van een ##-sectie tot de volgende ##-kop. */
function sectie(tekst: string, kop: string): string {
  const deel = tekst.split(new RegExp(`^## ${kop}$`, 'm'))[1];
  if (deel === undefined) throw new Error(`sectie "## ${kop}" ontbreekt`);
  return deel.split(/^## /m)[0] ?? '';
}

/** De kop (###) of lijstitem (- **...**) in Problemen die `✗ toolchain ontbreekt` in de cloud behandelt, met zijn tekst. */
function cloudProbleem(problemen: string): string {
  const koppen = problemen.split(/^(?=### )/m).filter((deel) => deel.startsWith('### '));
  const kop = koppen.find((deel) => /^### .*✗ toolchain ontbreekt/.test(deel) && /cloud/i.test(deel.split('\n')[0] ?? ''));
  if (kop === undefined) throw new Error('Problemen heeft geen kop (###) voor `✗ toolchain ontbreekt` in de cloud');
  return kop;
}

describe('cloud-toolchain-zelfherstel/AC-12 docs', () => {
  test('cloud-toolchain-zelfherstel/AC-12 Opzetten: de cache vervalt niet bij een pin-bump, de startup-hook herstelt bij invoer gelijk aan main', () => {
    const opzetten = sectie(environment, 'Opzetten');

    expect(opzetten).toMatch(/pin-bump/);
    expect(opzetten).toMatch(/vervalt niet bij een pin-bump|niet bij een pin-bump/);
    expect(opzetten).toMatch(/startup-hook/);
    expect(opzetten).toMatch(/gelijk (?:is )?aan `?main`?/);
  });

  test('cloud-toolchain-zelfherstel/AC-12 Problemen: een kop voor ✗ toolchain ontbreekt in de cloud met oorzaak, hookregels en herstel', () => {
    const tekst = cloudProbleem(sectie(environment, 'Problemen'));

    expect(tekst).toMatch(/omgevingscache van vóór een pin-bump/);
    expect(tekst).toContain('✓ toolchain hersteld');
    expect(tekst).toContain('! toolchain niet hersteld');
    expect(tekst).toContain('✗ toolchain niet hersteld');
    expect(tekst).toMatch(/nieuwe sessie/);
    expect(tekst).toContain('Setup script');
  });

  test('cloud-toolchain-zelfherstel/AC-12 framework.md noemt ADR 0112 bij R-TOOL-01', () => {
    const regel = framework.split('\n').find((r) => r.includes('**R-TOOL-01**'));

    expect(regel).toBeDefined();
    expect(regel).toMatch(/0112/);
  });
});
