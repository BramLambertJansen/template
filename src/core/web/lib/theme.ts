import { uiTexts } from '../copy/ui.ts';
import type { ThemeRegister } from './theme-register.ts';

// Licht of donker thema (framework §7: dark mode via [data-theme=dark] op <html>). De keuze blijft in deze browser bewaard;
// zonder keuze is het thema licht. localStorage kan ontbreken of weigeren (privévenster): dan geldt de keuze alleen nu.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'thema';
// Spec app-thema (deel C): het app-thema is een eigen as naast licht en donker, met een eigen sleutel.
const APP_THEME_KEY = 'app-thema';

export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  return root.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset['theme'] = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Niet bewaard; het thema geldt nog wel tot de pagina herlaadt.
  }
}

// Het register (defineThemes) staat in theme-register.ts, zonder DOM, zodat ook de node-tests het kunnen laden.
export { defineThemes, type ThemeDefinition, type ThemeRegister } from './theme-register.ts';

// Eigen sleutel van het register (geen geërfde zoals `constructor`).
const known = (themes: ThemeRegister, name: string) => Object.hasOwn(themes, name);

export function currentAppTheme(themes: ThemeRegister, root: HTMLElement = document.documentElement): string | null {
  const name = root.dataset['appTheme'] ?? null;
  return name !== null && known(themes, name) ? name : null;
}

function store(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(APP_THEME_KEY);
    else localStorage.setItem(APP_THEME_KEY, name);
  } catch {
    // Niet bewaard; het thema geldt nog wel tot de pagina herlaadt.
  }
}

// Zet het app-thema op het hele document en bewaart de keuze; null of een naam buiten het register = geen thema.
export function setAppTheme(
  name: string | null,
  themes: ThemeRegister,
  root: HTMLElement = document.documentElement,
): void {
  const theme = name !== null && known(themes, name) ? name : null;
  if (theme === null) delete root.dataset['appTheme'];
  else root.dataset['appTheme'] = theme;
  store(theme);
}

// Bij het opstarten (main.tsx), vóór de eerste render: licht/donker en het app-thema terugzetten. Een bewaarde naam die
// niet (meer) in het register staat, wordt genegeerd en gewist.
export function applyStoredTheme(themes: ThemeRegister = {}, root: HTMLElement = document.documentElement): void {
  root.dataset['theme'] = storedTheme();
  const stored = read(APP_THEME_KEY);
  if (stored !== null && known(themes, stored)) root.dataset['appTheme'] = stored;
  else {
    delete root.dataset['appTheme'];
    if (stored !== null) store(null);
  }
}

// Opties voor een kiezer: eerst "Standaard" (geen thema, waarde ''), dan elk thema; leeg als het register leeg is.
export function themeOptions(themes: ThemeRegister): { readonly value: string; readonly label: string }[] {
  const entries = Object.entries(themes).map(([value, { label }]) => ({ value, label }));
  return entries.length === 0 ? [] : [{ value: '', label: uiTexts.defaultAppTheme }, ...entries];
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storedTheme(): Theme {
  return read(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}
