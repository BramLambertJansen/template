import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { BuildInfo } from '../lib/api-client.ts';
import { ShellFrame, type ShellProps } from './shell-frame.tsx';
import { SidebarShell } from './sidebar-shell.tsx';
import { TopbarShell } from './topbar-shell.tsx';

// Spec release-versie, addendum: versie en build onderaan in elke schil.

afterEach(cleanup);

const SHA = '0123456789abcdef0123456789abcdef01234567';

function withRouter(node: React.ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterContextProvider router={router}>{node}</RouterContextProvider>);
}

function frame(buildInfo?: BuildInfo) {
  return withRouter(
    <ShellFrame header={null} nav={null} buildInfo={buildInfo}>
      <h1>Inhoud</h1>
    </ShellFrame>,
  );
}

describe('release-versie/AC-11: voet met versie en build in ShellFrame', () => {
  test('release-versie/AC-11: versie en de eerste 7 tekens van de build in een contentinfo', () => {
    frame({ version: '0.2.0', build: SHA });
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toBe('Versie 0.2.0 · build 0123456');
  });

  test('release-versie/AC-11: zonder build alleen de versie, zonder het woord build', () => {
    frame({ version: '0.2.0' });
    const footer = screen.getByRole('contentinfo');
    // Exact gelijk: dus geen build en geen scheidingsteken.
    expect(footer.textContent).toBe('Versie 0.2.0');
  });

  test('release-versie/AC-11: zonder buildInfo geen contentinfo', () => {
    frame();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  test('release-versie/AC-11: de voet staat buiten main en is verborgen bij afdrukken', () => {
    frame({ version: '0.2.0' });
    const footer = screen.getByRole('contentinfo');
    expect(screen.getByRole('main').contains(footer)).toBe(false);
    expect(footer.className).toContain('print:hidden');
  });
});

const props: Omit<ShellProps, 'children'> = { nav: [], userName: 'Ada Admin', menuItems: [] };

describe.each([
  ['SidebarShell', SidebarShell],
  ['TopbarShell', TopbarShell],
] as const)('release-versie/AC-11: %s geeft buildInfo door', (_naam, Shell) => {
  test('release-versie/AC-11: met buildInfo de voet, zonder geen voet', () => {
    const { unmount } = withRouter(
      <Shell {...props} buildInfo={{ version: '0.2.0', build: 'abc1234' }}>
        <h1>Inhoud</h1>
      </Shell>,
    );
    expect(screen.getByRole('contentinfo').textContent).toBe('Versie 0.2.0 · build abc1234');
    unmount();
    withRouter(
      <Shell {...props}>
        <h1>Inhoud</h1>
      </Shell>,
    );
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });
});
