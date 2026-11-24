import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ThemeScope } from './theme-scope.tsx';

// Spec app-thema (AC-14): ThemeScope is alleen een wrapper met data-app-theme en display: contents (geen eigen box).
afterEach(cleanup);

test('app-thema/AC-14: ThemeScope zet data-app-theme op een contents-wrapper; zonder thema geen attribuut', () => {
  const { rerender } = render(
    <ThemeScope theme="zacht">
      <p>inhoud</p>
    </ThemeScope>,
  );
  const wrapper = screen.getByText('inhoud').parentElement;
  expect([wrapper?.getAttribute('data-app-theme'), wrapper?.className]).toStrictEqual(['zacht', 'contents']);

  rerender(
    <ThemeScope theme={null}>
      <p>inhoud</p>
    </ThemeScope>,
  );
  expect(screen.getByText('inhoud').parentElement?.hasAttribute('data-app-theme')).toBe(false);
});
