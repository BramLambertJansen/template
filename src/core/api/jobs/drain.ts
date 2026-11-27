import { MAX_PURGE_BATCH, MAX_PURGE_BATCHES_PER_ROUND } from '../../shared/limits.ts';

// Hoe een reeks batches eindigde: leeg (laatste batch kleiner dan de batchgrootte), op de grens van één ronde, overgeslagen
// (lock bezet bij een andere instantie) of gestopt (het proces stopt; geen nieuwe batch).
export interface DrainResult {
  readonly deleted: number;
  readonly batches: number;
  readonly stoppedBy: 'drained' | 'limit' | 'skipped' | 'stopped';
}

export interface DrainOptions {
  readonly batchSize?: number;
  readonly maxBatches?: number;
  readonly signal?: AbortSignal;
}

// Herhaalt één batch (een eigen transactie) tot er niets meer te doen is, begrensd per ronde (spec achtergrondtaken, deel D).
// batch geeft het aantal verwijderde rijen, of null als de lock bezet was: dan wacht de rest op de volgende ronde.
export async function drainBatches(
  batch: () => Promise<number | null>,
  options: DrainOptions = {},
): Promise<DrainResult> {
  const batchSize = options.batchSize ?? MAX_PURGE_BATCH;
  const maxBatches = options.maxBatches ?? MAX_PURGE_BATCHES_PER_ROUND;
  let deleted = 0;
  let batches = 0;
  while (batches < maxBatches) {
    if (options.signal?.aborted === true) return { deleted, batches, stoppedBy: 'stopped' };
    const count = await batch();
    if (count === null) return { deleted, batches, stoppedBy: 'skipped' };
    batches += 1;
    deleted += count;
    if (count < batchSize) return { deleted, batches, stoppedBy: 'drained' };
  }
  return { deleted, batches, stoppedBy: 'limit' };
}
