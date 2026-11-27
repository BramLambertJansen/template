import type { Cents } from '../../shared/money.ts';

// Eén formatter per soort waarde (framework §6). De UI is Nederlands; tijd staat als ISO-string in de API en wordt hier
// in de tijdzone van de gebruikers getoond.
const LOCALE = 'nl-NL';
const TIME_ZONE = 'Europe/Amsterdam';

const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat(LOCALE);
const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
// Bestandsgrootte (spec bestandsopslag, "Opmaak"): hooguit één decimaal, zonder ",0" en zonder groepering.
const byteSize = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, useGrouping: false });
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

// Vaste grenzen in seconden, grootste eerst (spec relatieve-tijd): geen kalenderrekening, een maand is 30 dagen en een
// jaar 365 dagen. Onder een minuut is het altijd "nu".
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

function parse(iso: string): Date {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) throw new Error(`format: geen geldige ISO-tijd: '${iso}'`);
  return value;
}

// Leest nooit zelf de klok: `now` is altijd een argument, zodat de uitvoer deterministisch is.
function relative(iso: string, now: Date): string {
  const seconds = (parse(iso).getTime() - now.getTime()) / 1000;
  if (Number.isNaN(seconds)) throw new Error('format: geen geldig referentietijdstip');
  const unit = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size);
  // Afkappen richting nul, nooit naar boven afronden; een letterlijke 0 voorkomt "-0".
  return unit === undefined
    ? relativeTime.format(0, 'second')
    : relativeTime.format(Math.trunc(seconds / unit[1]), unit[0]);
}

// Veelvouden van 1024. De eenheid volgt uit de afgeronde waarde, zodat 1023,96 KB "1 MB" wordt en niet "1024 KB".
function bytes(value: number): string {
  let unit = 0;
  let scaled = value;
  while (unit < BYTE_UNITS.length - 1 && Math.round(scaled * 10) / 10 >= 1024) {
    scaled /= 1024;
    unit += 1;
  }
  return `${byteSize.format(unit === 0 ? Math.round(scaled) : scaled)} ${BYTE_UNITS[unit] ?? 'GB'}`;
}

export const format = {
  date: (iso: string): string => date.format(parse(iso)),
  dateTime: (iso: string): string => dateTime.format(parse(iso)),
  cents: (amount: Cents): string => euro.format(amount / 100),
  number: (value: number): string => number.format(value),
  relative,
  bytes,
};
