import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { decodeCursor, encodeCursor, pageQuery, pageSchema } from './cursor.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './limits.ts';

const key = z.object({ createdAt: z.string(), id: z.string() }).strict();

describe('cursor-contract (framework §5)', () => {
  test('een cursor gaat heen en terug, ook met niet-ASCII', () => {
    const value = { createdAt: '2026-10-09T12:00:00.000Z', id: 'ü-é-漢' };

    expect(decodeCursor(encodeCursor(value), key)).toStrictEqual(value);
    expect(encodeCursor(value)).toMatch(/^[\w-]+$/);
  });

  test.each(['niet-base64!', encodeCursor({ id: 1 }), encodeCursor('tekst')])(
    'een gemanipuleerde cursor geeft een ZodError: %s',
    (cursor) => {
      expect(() => decodeCursor(cursor, key)).toThrow(z.ZodError);
    },
  );

  test('limit: standaard en harde grens', () => {
    expect(pageQuery.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(() => pageQuery.parse({ limit: MAX_PAGE_SIZE + 1 })).toThrow(z.ZodError);
    expect(() => pageQuery.parse({ onbekend: 1 })).toThrow(z.ZodError);
  });

  test('een pagina heeft precies items en nextCursor', () => {
    const page = pageSchema(z.string());

    expect(page.parse({ items: ['a'], nextCursor: null })).toStrictEqual({ items: ['a'], nextCursor: null });
    expect(() => page.parse({ items: [], nextCursor: null, extra: 1 })).toThrow(z.ZodError);
  });
});
