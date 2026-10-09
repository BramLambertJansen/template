import { describe, expect, test } from 'vitest';
import { parsePort } from './env.ts';

describe('parsePort', () => {
  test('valt terug op de standaardpoort als de waarde ontbreekt', () => {
    expect(parsePort(undefined, 8787)).toBe(8787);
    expect(parsePort('', 8787)).toBe(8787);
  });

  test('leest een geldige poort', () => {
    expect(parsePort('9000', 8787)).toBe(9000);
  });

  test.each(['0', '65536', 'abc', '80.5', '-1'])('weigert %s', (value) => {
    expect(() => parsePort(value, 8787)).toThrow('Ongeldige poort');
  });
});
