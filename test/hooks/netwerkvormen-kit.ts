import { readFileSync } from 'node:fs';
import path from 'node:path';

// Hulp voor de tests van spec cloud-netwerkvorm: de echte lijst `sandbox.excludedCommands` uit `.claude/settings.json`, zoals het
// rolhek hem als `ctx.netwerkvormen` (lijst patronen, bv. `git push origin HEAD`, `git commit *`) uit de vertrouwde basis krijgt.
// Gegevens, geen toetsen; leest het bestand, zodat een tweede lijst in een test nooit van de bron kan afwijken.

function kind(waarde: unknown, sleutel: string): unknown {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1];
}

/** `sandbox.excludedCommands` uit de tekst van een settingsbestand; leeg als de sleutel ontbreekt. */
export function netwerkvormenUit(tekst: string): string[] {
  const ruw: unknown = JSON.parse(tekst);
  const lijst = kind(kind(ruw, 'sandbox'), 'excludedCommands');
  return Array.isArray(lijst) ? lijst.filter((regel): regel is string => typeof regel === 'string') : [];
}

/** De echte lijst van deze repo. */
export function echteNetwerkvormen(): string[] {
  return netwerkvormenUit(readFileSync(path.resolve(import.meta.dirname, '../../.claude/settings.json'), 'utf8'));
}
