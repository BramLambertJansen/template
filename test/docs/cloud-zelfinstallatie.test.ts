import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { type AbsenceExamples, expectAbsent } from '../support/absence.ts';

// Spec cloud-zelfinstallatie, AC-7: de documentatie van de cloudomgeving zegt wat er gemeten is (F1, F5) en noemt het
// omgevingsbestand als inhoud van het veld "Setup script".
const lees = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');
const environment = lees('docs/ENVIRONMENT.md');
const readme = lees('README.md');
const setup = lees('scripts/cloud-setup.sh');

// De tekst van een ##-sectie tot de volgende ##-kop.
function sectie(tekst: string, kop: string): string {
  const deel = tekst.split(new RegExp(`^## ${kop}$`, 'm'))[1];
  if (deel === undefined) throw new Error(`sectie "## ${kop}" ontbreekt`);
  return deel.split(/^## /m)[0] ?? '';
}

// `bash scripts/cloud-setup.sh` als tekst voor het veld; met de hand in een sessie draaien blijft een geldig herstel.
const VELD_OUD = /bash scripts\/cloud-setup\.sh/;
const VELD_VOORBEELDEN: AbsenceExamples = {
  recognizes: ['bash scripts/cloud-setup.sh'],
  allows: ['scripts/cloud-omgeving.sh'],
};

describe('docs van de cloudomgeving (spec cloud-zelfinstallatie)', () => {
  test('cloud-zelfinstallatie/AC-7: Opzetten noemt scripts/cloud-omgeving.sh en één omgeving voor alle repo\'s', () => {
    const opzetten = sectie(environment, 'Opzetten');

    expect(opzetten).toContain('scripts/cloud-omgeving.sh');
    expect(opzetten).toMatch(/[Eé]én omgeving voor alle repo's uit de template/);
    expectAbsent(opzetten, VELD_OUD, VELD_VOORBEELDEN);
  });

  test('cloud-zelfinstallatie/AC-7: de tabel "Wat het script doet" noemt de drie routes naar PATH', () => {
    const tabel = sectie(environment, 'Wat het script doet');

    expect(tabel).toContain('`~/.local/bin/node`');
    expect(tabel).toContain('`CLAUDE_ENV_FILE`');
    expect(tabel).toContain('`~/.bashrc`');
    expect(tabel).toContain('mise which');
  });

  test('cloud-zelfinstallatie/AC-7: geen "Sandbox required but unavailable" meer; wel de startmelding uit F5', () => {
    const oud = /Sandbox required but unavailable/i;
    const voorbeelden: AbsenceExamples = { recognizes: ['Sandbox required but unavailable'] };

    expectAbsent(environment, oud, voorbeelden);
    expectAbsent(setup, oud, voorbeelden);
    expect(environment).toContain(
      "sandbox.failIfUnavailable is set, but this session runs in Anthropic's cloud container, which has no command sandbox",
    );
  });

  test('cloud-zelfinstallatie/AC-7: Problemen noemt exit 127 met de oorzaak: het script start in de map boven de clone', () => {
    const problemen = sectie(environment, 'Problemen');

    expect(problemen).toContain('exit 127');
    expect(problemen).toContain('No such file or directory');
    expect(problemen).toMatch(/map boven de clone/);
  });

  test('cloud-zelfinstallatie/AC-7: README (Cloud) en de kopcommentaar van scripts/cloud-setup.sh zeggen hetzelfde', () => {
    const cloud = sectie(readme, 'Cloud');
    const kop = setup.split(/^set -euo pipefail$/m)[0] ?? '';

    expect(cloud).toContain('scripts/cloud-omgeving.sh');
    expect(cloud).toMatch(/[Eé]én omgeving voor alle repo's uit de template/);
    expectAbsent(cloud, VELD_OUD, VELD_VOORBEELDEN);
    expect(kop).toContain('scripts/cloud-omgeving.sh');
    expect(kop).toContain('~/.local/bin');
  });

  // ADR 0110: pnpm 12 legt zijn store-vergrendeling zonder XDG_RUNTIME_DIR in /tmp, dat de sandbox niet mag schrijven.
  test('ADR 0110: cloud-setup.sh zet een eigen XDG_RUNTIME_DIR vóór pnpm install', () => {
    const install = setup.indexOf('pnpm install --frozen-lockfile');
    const runtime = setup.search(/^export XDG_RUNTIME_DIR$/m);

    expect(install).toBeGreaterThan(-1);
    expect(setup).toMatch(/^XDG_RUNTIME_DIR="\$\(mktemp -d\)"$/m);
    expect(runtime).toBeGreaterThan(-1);
    expect(runtime).toBeLessThan(install);
  });
});
