import { describe, expect, test } from 'vitest';
import { errors } from '#shared/errors.ts';
import { errorTexts } from './errors.ts';

describe('errorTexts', () => {
  test('elke foutcode uit het register heeft een tekst, en er zijn geen teksten zonder code', () => {
    expect(Object.keys(errorTexts).sort()).toStrictEqual([...errors.codes].sort());
  });

  test('geen tekst noemt een code of is leeg', () => {
    for (const [code, text] of Object.entries(errorTexts)) {
      expect(text.length, code).toBeGreaterThan(0);
      expect(text, code).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });
});
