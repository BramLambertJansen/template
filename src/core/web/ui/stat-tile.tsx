import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useId } from 'react';
import { assert } from '#core/shared/assert.ts';
import { NavLink } from './nav-link.tsx';

export interface StatTileTrend {
  readonly direction: 'up' | 'down' | 'flat';
  readonly label: string;
}
export interface StatTileLink {
  readonly href: string;
  readonly label: string;
}
export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly description?: string;
  readonly trend?: StatTileTrend;
  readonly link?: StatTileLink;
}

const trendIcons = { up: ArrowUp, down: ArrowDown, flat: Minus };

// De link overschrijft elke sidebar-kleur van NavLink (basis, hover en current) met het card-paar.
const linkClasses =
  'self-start px-0 text-card-foreground underline underline-offset-4 hover:bg-transparent hover:text-card-foreground aria-[current=page]:bg-transparent aria-[current=page]:text-card-foreground';

function filled(text: string): boolean {
  return text.trim() !== '';
}

// KPI-tegel (spec ui-weergave-basis). De app maakt de waarde op met format; de richting van de trend staat in icoon en
// tekst, nooit alleen in kleur.
export function StatTile({ label, value, description, trend, link }: StatTileProps) {
  assert(filled(label) && filled(value), 'StatTile needs a label and a value');
  assert(trend === undefined || filled(trend.label), 'StatTile trend needs a label');
  assert(link === undefined || (filled(link.label) && filled(link.href)), 'StatTile link needs a label and an href');
  const labelId = useId();
  const TrendIcon = trendIcons[trend?.direction ?? 'flat'];
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
    >
      <p id={labelId} className="text-sm font-medium text-muted-foreground">
        {label}
      </p>
      <p className="min-w-0 text-2xl font-semibold break-words">{value}</p>
      {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
      {trend === undefined ? null : (
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <TrendIcon aria-hidden="true" className="size-4 shrink-0" />
          {trend.label}
        </p>
      )}
      {link === undefined ? null : (
        <NavLink href={link.href} aria-current={undefined} className={linkClasses}>
          {link.label}
        </NavLink>
      )}
    </div>
  );
}
