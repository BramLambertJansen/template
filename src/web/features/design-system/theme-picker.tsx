import { useId } from 'react';
import { uiTexts } from '#core/web/copy/ui.ts';
import { themeOptions, type ThemeRegister } from '#core/web/lib/theme.ts';
import { Field, Select } from '#web/ui/index.ts';

// Spec app-thema (AC-16, AC-17): kiest het thema waarin de voorbeelden op /design-system staan. Alleen deze pagina en niet
// bewaard; <html> verandert niet. Zonder thema's in het register is er geen kiezer.
export function ThemePicker({
  themes,
  value,
  onChange,
}: {
  readonly themes: ThemeRegister;
  readonly value: string | null;
  readonly onChange: (theme: string | null) => void;
}) {
  const id = useId();
  const options = themeOptions(themes);
  if (options.length === 0) return null;
  return (
    <div className="max-w-xs">
      <Field id={id} label={uiTexts.appTheme}>
        <Select
          id={id}
          options={options}
          value={value ?? ''}
          onChange={(event) => {
            onChange(event.target.value === '' ? null : event.target.value);
          }}
        />
      </Field>
    </div>
  );
}
