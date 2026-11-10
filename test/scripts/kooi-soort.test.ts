import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { MELDING_GEEN_BWRAP, MELDING_PROEF } from '../../scripts/kit/kooi.mjs';

// tests-naar-vermogen/AC-1: de proef van de kooi geeft naast de melding een gestructureerde soort
// (`goed`, `start-niet`, `schermt-niet-af`). `oordeelProef(r, binnenGeschreven)` is de nieuwe export met dezelfde
// invoer als `beoordeelProef`; hij geeft `{ soort, melding }`.
type Invoer = { error?: Error; stdout: string; stderr: string };
type Oordeel = { soort: string; melding: string };
type OordeelFn = (r: Invoer, binnenGeschreven: boolean) => Oordeel;

function isOordeelFn(waarde: unknown): waarde is OordeelFn {
  return typeof waarde === 'function';
}

async function laadOordeel(): Promise<OordeelFn | undefined> {
  const mod: unknown = await import(/* @vite-ignore */ path.join(import.meta.dirname, '../../scripts/kit/kooi.mjs'));
  const fn: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'oordeelProef') : undefined;
  return isOordeelFn(fn) ? fn : undefined;
}

function enoent(): Error {
  return Object.assign(new Error('spawn bwrap ENOENT'), { code: 'ENOENT' });
}

describe('kooi: soort van de proefuitslag (tests-naar-vermogen/AC-1)', () => {
  test('AC-1: kooi.mjs exporteert oordeelProef', async () => {
    expect(await laadOordeel(), 'export oordeelProef van scripts/kit/kooi.mjs').toBeTypeOf('function');
  });

  test('AC-1: een proef die in de systeemmap niet kan schrijven is soort goed', async () => {
    const oordeel = await laadOordeel();
    expect(oordeel).toBeTypeOf('function');
    if (oordeel === undefined) return;
    expect(oordeel({ stdout: 'x: Read-only file system', stderr: '' }, true)).toStrictEqual({
      soort: 'goed',
      melding: 'goed',
    });
  });

  test('AC-1: bubblewrap ontbreekt (ENOENT) is start-niet met de installatiemelding', async () => {
    const oordeel = await laadOordeel();
    expect(oordeel).toBeTypeOf('function');
    if (oordeel === undefined) return;
    expect(oordeel({ error: enoent(), stdout: '', stderr: '' }, false)).toStrictEqual({
      soort: 'start-niet',
      melding: MELDING_GEEN_BWRAP,
    });
  });

  test('AC-1: een andere spawnfout is start-niet', async () => {
    const oordeel = await laadOordeel();
    expect(oordeel).toBeTypeOf('function');
    if (oordeel === undefined) return;
    const r = oordeel({ error: Object.assign(new Error('x'), { code: 'EACCES' }), stdout: '', stderr: '' }, false);
    expect(r.soort).toBe('start-niet');
    expect(r.melding).toContain('start niet');
  });

  test('AC-1: bubblewrap draait maar de werkmap kreeg niets (namespace geweigerd) is start-niet', async () => {
    const oordeel = await laadOordeel();
    expect(oordeel).toBeTypeOf('function');
    if (oordeel === undefined) return;
    const r = oordeel({ stdout: '', stderr: 'bwrap: No permissions to create new namespace' }, false);
    expect(r.soort).toBe('start-niet');
    expect(r.melding).toContain('bubblewrap start niet');
  });

  test('AC-1: de proef schreef buiten de werkmap is schermt-niet-af met MELDING_PROEF', async () => {
    const oordeel = await laadOordeel();
    expect(oordeel).toBeTypeOf('function');
    if (oordeel === undefined) return;
    expect(oordeel({ stdout: '', stderr: '' }, true)).toStrictEqual({
      soort: 'schermt-niet-af',
      melding: MELDING_PROEF,
    });
    expect(oordeel({ stdout: 'Permission denied', stderr: '' }, true).soort).toBe('schermt-niet-af');
  });
});
