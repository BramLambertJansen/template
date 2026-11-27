import { describe, expect, test, vi } from 'vitest';
import { MAX_PURGE_BATCH, MAX_PURGE_BATCHES_PER_ROUND } from '../../shared/limits.ts';
import { drainBatches } from './index.ts';

// Spec achtergrondtaken (namespace jobs), jobs/AC-37 (unitdeel): één ronde werkt in batches van MAX_PURGE_BATCH en stopt na
// MAX_PURGE_BATCHES_PER_ROUND batches. Nagebootste batches, geen database.

describe('drainBatches', () => {
  test('jobs/AC-37: de standaardgrenzen zijn 1000 rijen per batch en 100 batches per ronde', () => {
    expect(MAX_PURGE_BATCH).toBe(1000);
    expect(MAX_PURGE_BATCHES_PER_ROUND).toBe(100);
  });

  test('jobs/AC-37: 100 volle batches × 1000 + 1 rij: de ronde stopt na 100 batches met "limit"', async () => {
    let remaining = MAX_PURGE_BATCHES_PER_ROUND * MAX_PURGE_BATCH + 1;
    const batch = vi.fn(() => {
      const deleted = Math.min(MAX_PURGE_BATCH, remaining);
      remaining -= deleted;
      return Promise.resolve(deleted);
    });

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(100);
    expect(result).toStrictEqual({ deleted: 100_000, batches: 100, stoppedBy: 'limit' });
    expect(remaining).toBe(1);
  });

  test('jobs/AC-37: een korte batch (1001 rijen: 1000 en 1) geeft "drained" na twee batches', async () => {
    const sizes = [1000, 1];
    const batch = vi.fn(() => Promise.resolve(sizes.shift() ?? 0));

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual({ deleted: 1001, batches: 2, stoppedBy: 'drained' });
  });

  test('jobs/AC-37: een lege tabel (0 rijen) geeft "drained" na één batch', async () => {
    const batch = vi.fn(() => Promise.resolve(0));

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ deleted: 0, batches: 1, stoppedBy: 'drained' });
  });

  test('jobs/AC-37: precies 1000 rijen is een volle batch; de tweede (lege) batch sluit af met "drained"', async () => {
    const sizes = [1000, 0];
    const batch = vi.fn(() => Promise.resolve(sizes.shift() ?? 0));

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual({ deleted: 1000, batches: 2, stoppedBy: 'drained' });
  });

  test('jobs/AC-37: null (lock bezet) op de eerste batch geeft "skipped" zonder verdere batches', async () => {
    const batch = vi.fn(() => Promise.resolve(null));

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ deleted: 0, batches: 0, stoppedBy: 'skipped' });
  });

  test('jobs/AC-37: null midden in een ronde stopt met "skipped" en telt wat al verwijderd is', async () => {
    const results: (number | null)[] = [1000, 1000, null];
    // Niet `?? 0`: dat maakt van de null een lege batch.
    const batch = vi.fn(() => Promise.resolve(results.length > 0 ? (results.shift() ?? null) : 0));

    const result = await drainBatches(batch);

    expect(batch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ deleted: 2000, stoppedBy: 'skipped' });
  });

  test('jobs/AC-37: batchSize en maxBatches zijn instelbaar', async () => {
    const batch = vi.fn(() => Promise.resolve(10));

    const result = await drainBatches(batch, { batchSize: 10, maxBatches: 3 });

    expect(batch).toHaveBeenCalledTimes(3);
    expect(result).toStrictEqual({ deleted: 30, batches: 3, stoppedBy: 'limit' });
  });

  test('jobs/AC-37: batches lopen na elkaar, nooit twee tegelijk', async () => {
    let running = 0;
    let peak = 0;
    const sizes = [1000, 1000, 5];
    const batch = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return sizes.shift() ?? 0;
    });

    await drainBatches(batch);

    expect(peak).toBe(1);
  });

  test('jobs/AC-37: een fout in een batch komt bij de aanroeper', async () => {
    const batch = vi.fn(() => Promise.reject(new Error('batch faalt')));

    await expect(drainBatches(batch)).rejects.toThrow('batch faalt');
  });

  test('jobs/AC-37: een signaal dat vóór de eerste batch al is afgebroken geeft "stopped" zonder batch', async () => {
    const batch = vi.fn(() => Promise.resolve(1000));

    const result = await drainBatches(batch, { signal: AbortSignal.abort() });

    expect(batch).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ deleted: 0, batches: 0, stoppedBy: 'stopped' });
  });

  test('jobs/AC-37: een signaal dat midden in een ronde wordt afgebroken stopt vóór de volgende batch', async () => {
    const controller = new AbortController();
    const batch = vi.fn(() => {
      if (batch.mock.calls.length === 2) controller.abort();
      return Promise.resolve(1000);
    });

    const result = await drainBatches(batch, { signal: controller.signal });

    expect(batch).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual({ deleted: 2000, batches: 2, stoppedBy: 'stopped' });
  });
});
