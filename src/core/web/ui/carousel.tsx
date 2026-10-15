import { useId, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';

export interface CarouselItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}
type CarouselState =
  | { readonly value: string; readonly onValueChange: (id: string) => void; readonly defaultValue?: never }
  | { readonly value?: never; readonly onValueChange?: never; readonly defaultValue?: string };
export type CarouselProps = CarouselState & {
  readonly label: string;
  readonly items: readonly CarouselItem[];
  readonly emptyContent?: ReactNode;
};
const SWIPE_DISTANCE = 50;

function useCarousel(props: CarouselProps) {
  const [local, setLocal] = useState(props.defaultValue ?? props.items[0]?.id ?? '');
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const tracked = useRef<HTMLElement | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const base = useId();
  const active = props.items.findIndex((item) => item.id === (props.value ?? local));
  const choose = (index: number) => {
    const item = props.items[index];
    if (item === undefined || index === active) return;
    if (props.value === undefined) setLocal(item.id);
    props.onValueChange?.(item.id);
    pending.current = item.id;
  };
  useLayoutEffect(() => {
    const item = props.items[active];
    if (item?.id === pending.current) {
      setAnnouncement(`${String(active + 1)} van ${String(props.items.length)}: ${item.label}`);
      pending.current = null;
    }
  }, [active, props.items]);
  const choiceId = (id: string) => `${base}-choice-${encodeURIComponent(id)}`;
  useLayoutEffect(() => {
    const focused = tracked.current;
    if (focused === null || (document.activeElement !== focused && document.activeElement !== document.body)) return;
    if (!focused.isConnected || focused.closest('[hidden]') !== null || focused.matches(':disabled')) {
      const item = props.items[active];
      const target = item === undefined ? root.current : (document.getElementById(choiceId(item.id)) ?? root.current);
      target?.focus();
      tracked.current = target;
    }
  });
  const down = (event: PointerEvent) => {
    start.current = null;
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (event.target.closest('button,a,input,textarea,select,label,[contenteditable],[role="button"]') !== null) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const release = (event: PointerEvent) => {
    if (event.isTrusted && event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const up = (event: PointerEvent) => {
    const origin = start.current;
    start.current = null;
    release(event);
    if (origin === null || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) choose(active + (dx < 0 ? 1 : -1));
  };
  const cancel = (event: PointerEvent) => {
    start.current = null;
    release(event);
  };
  return { root, tracked, active, choose, announcement, choiceId, down, up, cancel, base };
}

export function Carousel(props: CarouselProps) {
  const ids = props.items.map((item) => item.id);
  assert(ids.every((id) => id !== '') && new Set(ids).size === ids.length, 'Carousel needs unique non-empty ids');
  const state = useCarousel(props);
  const navigation = props.items.length > 1 || (props.items.length === 1 && state.active < 0);
  return (
    <div
      ref={state.root}
      role="region"
      aria-roledescription="carrousel"
      aria-label={props.label}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-3"
      onFocusCapture={(event) => {
        state.tracked.current = event.target;
      }}
      onBlurCapture={(event) => {
        const left = event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget);
        const released =
          event.relatedTarget === null &&
          event.target.isConnected &&
          event.target.closest('[hidden]') === null &&
          !event.target.matches(':disabled');
        if (left || released) state.tracked.current = null;
      }}
    >
      <div className="touch-pan-y" onPointerDown={state.down} onPointerUp={state.up} onPointerCancel={state.cancel}>
        {props.items.length === 0
          ? (props.emptyContent ?? <p>Geen resultaten.</p>)
          : props.items.map((item, index) => (
              <div
                key={item.id}
                id={`${state.base}-slide-${encodeURIComponent(item.id)}`}
                role="group"
                aria-roledescription="dia"
                aria-label={`${String(index + 1)} van ${String(props.items.length)}: ${item.label}`}
                hidden={index !== state.active}
                className="min-w-0 break-words"
              >
                {item.content}
              </div>
            ))}
      </div>
      {navigation ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={state.active <= 0}
            onClick={() => {
              state.choose(state.active - 1);
            }}
          >
            Vorige dia
          </Button>
          {props.items.map((item, index) => (
            <Button
              key={item.id}
              id={state.choiceId(item.id)}
              variant="ghost"
              aria-label={`Toon dia ${String(index + 1)}: ${item.label}`}
              aria-current={index === state.active ? 'true' : undefined}
              aria-controls={`${state.base}-slide-${encodeURIComponent(item.id)}`}
              onClick={() => {
                state.choose(index);
              }}
            >
              {index + 1}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={state.active === props.items.length - 1}
            onClick={() => {
              state.choose(state.active + 1);
            }}
          >
            Volgende dia
          </Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {state.announcement}
      </p>
    </div>
  );
}
