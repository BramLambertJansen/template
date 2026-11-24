// @vitest-environment jsdom
// In het unit-project (bestandsnaam uit de spec, .ts) maar met een DOM: <html> en localStorage.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyStoredTheme, currentTheme, defineThemes, setAppTheme, setTheme, themeOptions } from './theme.ts';

// Spec app-thema, deel C: het app-thema op <html> (data-app-theme), bewaard onder `app-thema`, los van licht/donker
// (`thema`). Een register uit de test, niet dat van de app (core importeert nooit app-code, R-LAAG-02).
const themes = defineThemes({ a: { label: 'A' }, 'b-twee': { label: 'B' } });
const html = document.documentElement;

afterEach(() => {
  localStorage.clear();
  delete html.dataset['theme'];
  delete html.dataset['appTheme'];
  vi.restoreAllMocks();
});

describe('setAppTheme en applyStoredTheme', () => {
  test('app-thema/AC-13: setAppTheme zet data-app-theme en de keuze is na herladen terug', () => {
    setAppTheme('a', themes);
    expect(html.getAttribute('data-app-theme')).toBe('a');
    expect(localStorage.getItem('app-thema')).toBe('a');

    // Herladen: het attribuut is weg tot applyStoredTheme het terugzet.
    delete html.dataset['appTheme'];
    applyStoredTheme(themes);
    expect(html.getAttribute('data-app-theme')).toBe('a');
  });

  test('app-thema/AC-13: setAppTheme(null) haalt het attribuut weg en wist de keuze', () => {
    setAppTheme('b-twee', themes);
    setAppTheme(null, themes);
    expect(html.hasAttribute('data-app-theme')).toBe(false);
    expect(localStorage.getItem('app-thema')).toBeNull();
  });

  test('app-thema/AC-13: een bewaarde naam buiten het register wordt genegeerd en gewist', () => {
    localStorage.setItem('app-thema', 'verwijderd');
    applyStoredTheme(themes);
    expect(html.hasAttribute('data-app-theme')).toBe(false);
    expect(localStorage.getItem('app-thema')).toBeNull();

    // Ook een geërfde sleutel van een object telt niet als thema.
    setAppTheme('constructor', themes);
    expect(html.hasAttribute('data-app-theme')).toBe(false);
  });

  test('app-thema/AC-13: zonder localStorage geldt het thema tot herladen', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('geweigerd');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('geweigerd');
    });
    setAppTheme('a', themes);
    expect(html.getAttribute('data-app-theme')).toBe('a');
    applyStoredTheme(themes);
    expect([html.hasAttribute('data-app-theme'), html.getAttribute('data-theme')]).toStrictEqual([false, 'light']);
  });

  test('app-thema/AC-13: defineThemes weigert een naam die geen kebab-case is', () => {
    expect(() => defineThemes({ Strak: { label: 'Strak' } })).toThrow('Strak');
    expect(() => defineThemes({ 'twee woorden': { label: 'x' } })).toThrow('twee woorden');
  });
});

describe('licht/donker naast het app-thema', () => {
  test('app-thema/AC-15: setTheme wisselt licht/donker zonder het app-thema te raken, met eigen sleutels', () => {
    setAppTheme('a', themes);
    setTheme('dark');
    expect([currentTheme(), html.getAttribute('data-app-theme')]).toStrictEqual(['dark', 'a']);
    expect([localStorage.getItem('thema'), localStorage.getItem('app-thema')]).toStrictEqual(['dark', 'a']);

    setAppTheme(null, themes);
    expect([currentTheme(), localStorage.getItem('thema')]).toStrictEqual(['dark', 'dark']);
    setTheme('light');
    applyStoredTheme(themes);
    expect([html.getAttribute('data-theme'), html.hasAttribute('data-app-theme')]).toStrictEqual(['light', false]);
  });

  test('app-thema/AC-15: applyStoredTheme zet beide assen terug uit hun eigen sleutel', () => {
    localStorage.setItem('thema', 'dark');
    localStorage.setItem('app-thema', 'b-twee');
    applyStoredTheme(themes);
    expect([html.getAttribute('data-theme'), html.getAttribute('data-app-theme')]).toStrictEqual(['dark', 'b-twee']);
  });
});

describe('leeg register', () => {
  test('app-thema/AC-17: met defineThemes({}) zet applyStoredTheme geen data-app-theme', () => {
    localStorage.setItem('app-thema', 'a');
    applyStoredTheme(defineThemes({}));
    expect(html.hasAttribute('data-app-theme')).toBe(false);
    applyStoredTheme();
    expect(html.hasAttribute('data-app-theme')).toBe(false);
  });

  test("app-thema/AC-17: zonder thema's zijn er geen kiezeropties (de catalogus rendert dan geen kiezer)", () => {
    expect(themeOptions(defineThemes({}))).toStrictEqual([]);
    expect(themeOptions(themes)).toStrictEqual([
      { value: '', label: 'Standaard' },
      { value: 'a', label: 'A' },
      { value: 'b-twee', label: 'B' },
    ]);
  });
});
