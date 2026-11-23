import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { cn } from './cn.ts';
import { Form } from './form.tsx';
import type { FormErrorSummaryOptions } from './form-error-summary.tsx';

// Stappenformulier (spec stappenformulier): per stap één Form met een eigen schema dat de aanroeper bezit. Alle stappen
// blijven gemount (inactieve met `hidden`), zodat waarden en focus bij Vorige en Volgende behouden blijven.

export interface WizardStepConfig<Input extends FieldValues, Output> {
  readonly id: string;
  readonly title: string;
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly content: ReactNode;
  readonly errorSummary?: FormErrorSummaryOptions<Input> | undefined;
  // Foutcode van de server → veld van deze stap, zoals bij Form; alleen zinvol op de laatste stap.
  readonly fieldForCode?: Readonly<Partial<Record<string, FieldPath<Input>>>> | undefined;
}

export interface WizardStepControls {
  readonly submitLabel: string;
  readonly onSubmit: () => Promise<unknown>;
  // Ontbreekt op stap 1.
  readonly onPrevious?: (() => void) | undefined;
}

// Een stap zonder generics, zodat stappen met verschillende schema's in één lijst passen; maak hem met `wizardStep`.
export interface WizardStep {
  readonly id: string;
  readonly title: string;
  readonly render: (controls: WizardStepControls) => ReactNode;
}

export interface WizardProps {
  // Toegankelijke naam van de voortgangslijst.
  readonly label: string;
  readonly steps: readonly WizardStep[];
  // Alleen na geldige invoer op de laatste stap; de aanroeper leest de waarden uit zijn eigen formulieren.
  readonly onSubmit: () => Promise<unknown>;
  readonly submitLabel?: string;
  // 4 kan niet: FormErrorSummary rendert altijd een h3.
  readonly headingLevel?: 2 | 3;
}

// Legt de generics per stap vast; het formulier blijft van de aanroeper.
export function wizardStep<Input extends FieldValues, Output>(config: WizardStepConfig<Input, Output>): WizardStep {
  const { form, content, errorSummary, fieldForCode } = config;
  return {
    id: config.id,
    title: config.title,
    render: ({ submitLabel, onSubmit, onPrevious }) => (
      <Form
        form={form}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
        {...(errorSummary === undefined ? {} : { errorSummary })}
        {...(fieldForCode === undefined ? {} : { fieldForCode })}
        secondaryAction={
          onPrevious === undefined ? null : (
            <Button
              variant="outline"
              disabled={form.formState.isSubmitting}
              onPointerDown={(event) => {
                // Zoals de verzendknop: blurvalidatie mag de knop niet tussen indrukken en loslaten verschuiven.
                if (event.button === 0) event.preventDefault();
              }}
              onClick={onPrevious}
            >
              {uiTexts.wizardPrevious}
            </Button>
          )
        }
      >
        {content}
      </Form>
    ),
  };
}

function useActiveStep(count: number) {
  const [active, setActive] = useState(0);
  const last = count - 1;
  // De aanroeper kortte de lijst in tot onder de actieve stap: de laatste bestaande stap wordt actief, zonder focus.
  if (active > last) setActive(last);
  const current = Math.min(active, last);
  const focusRequested = useRef(false);
  const go = (index: number) => {
    focusRequested.current = true;
    setActive(index);
  };
  return { current, last, focusRequested, go };
}

function useHeadingFocus(current: number, focusRequested: { current: boolean }) {
  const headings = useRef(new Map<number, HTMLHeadingElement>());
  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    // Na een timer: een nog geplande focus van de foutsamenvatting van deze stap (eerdere verzendpoging) loopt eerder
    // en wint dan niet van de stapkop (AC-18).
    const timer = setTimeout(() => {
      headings.current.get(current)?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [current, focusRequested]);
  return headings;
}

// AC-6: een tweede submit van het formulier tijdens "Bezig…" (Enter of een script, langs de uitgeschakelde knop) deelt de
// lopende belofte in plaats van onSubmit opnieuw aan te roepen; zo zet die tweede ronde `isSubmitting` ook niet te vroeg uit.
function useSubmitOnce(onSubmit: () => Promise<unknown>) {
  const pending = useRef<Promise<unknown> | null>(null);
  return () => {
    pending.current ??= onSubmit().finally(() => {
      pending.current = null;
    });
    return pending.current;
  };
}

export function Wizard({ label, steps, onSubmit, submitLabel = uiTexts.wizardSubmit, headingLevel = 2 }: WizardProps) {
  const ids = steps.map((step) => step.id);
  assert(ids.length > 0, 'Wizard needs at least one step');
  assert(ids.every((id) => id !== '') && new Set(ids).size === ids.length, 'Wizard steps need unique non-empty ids');
  const base = useId();
  const { current, last, focusRequested, go } = useActiveStep(steps.length);
  const headings = useHeadingFocus(current, focusRequested);
  const submitOnce = useSubmitOnce(onSubmit);
  const listId = `${base}-list`;
  const headingId = (id: string) => `${base}-heading-${encodeURIComponent(id)}`;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ol id={listId} aria-label={label} className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
        {steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'flex min-w-0 max-w-full items-center gap-2 break-words',
              index === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                index === current && 'border-foreground',
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">{step.title}</span>
          </li>
        ))}
      </ol>
      {steps.map((step, index) => (
        <section key={step.id} aria-labelledby={headingId(step.id)} hidden={index !== current} className="min-w-0">
          <div className="flex flex-col gap-4">
            <Heading
              id={headingId(step.id)}
              tabIndex={-1}
              aria-describedby={listId}
              ref={(element: HTMLHeadingElement | null) => {
                if (element === null) headings.current.delete(index);
                else headings.current.set(index, element);
              }}
              className={cn(
                'font-semibold break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                headingLevel === 2 ? 'text-xl' : 'text-lg',
              )}
            >
              {uiTexts.wizardStepHeading(index + 1, steps.length, step.title)}
            </Heading>
            {step.render({
              submitLabel: index === last ? submitLabel : uiTexts.wizardNext,
              onSubmit:
                index === last
                  ? submitOnce
                  : () => {
                      go(index + 1);
                      return Promise.resolve();
                    },
              onPrevious:
                index === 0
                  ? undefined
                  : () => {
                      go(index - 1);
                    },
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
