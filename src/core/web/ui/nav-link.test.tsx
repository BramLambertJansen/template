import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { isActiveHref, NavLink } from './nav-link.tsx';

afterEach(cleanup);

function linkAt(href: string, url: string): HTMLElement {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <RouterContextProvider router={router}>
      <NavLink href={href}>Link</NavLink>
    </RouterContextProvider>,
  );
  return screen.getByRole('link', { name: 'Link' });
}

const at = (url: string) => {
  const [pathname = '', query = ''] = url.split('?');
  return { pathname, searchStr: query === '' ? '' : `?${query}` };
};

describe('schillen/AC-18: NavLink met zoekparameters', () => {
  test('schillen/AC-18: actief bij /design-system?vak=formulieren&schil=topbalk, niet bij ?vak=basis', () => {
    const active = linkAt('/design-system?vak=formulieren', '/design-system?vak=formulieren&schil=topbalk');
    expect(active.getAttribute('aria-current')).toBe('page');
    cleanup();
    expect(
      linkAt('/design-system?vak=formulieren', '/design-system?vak=basis').getAttribute('aria-current'),
    ).toBeNull();
  });

  test('schillen/AC-18: elke parameter uit href moet dezelfde waarde hebben, en het pad moet gelijk zijn', () => {
    const href = '/design-system?schil=topbalk&items=9&vak=formulieren';
    expect(isActiveHref(href, at('/design-system?vak=formulieren&items=9&schil=topbalk'))).toBe(true);
    expect(isActiveHref(href, at('/design-system?vak=formulieren&schil=topbalk'))).toBe(false);
    expect(isActiveHref(href, at('/design-system?vak=formulieren&items=3&schil=topbalk'))).toBe(false);
    expect(isActiveHref(href, at('/design-system/sub?vak=formulieren&items=9&schil=topbalk'))).toBe(false);
  });

  test('schillen/AC-18: zonder query in href gelijk aan nu: pad of subpad, query in de URL telt niet', () => {
    expect(isActiveHref('/admin', at('/admin'))).toBe(true);
    expect(isActiveHref('/admin', at('/admin/accounts?q=ada'))).toBe(true);
    expect(isActiveHref('/admin', at('/administratie'))).toBe(false);
    expect(isActiveHref('/', at('/'))).toBe(true);
    expect(isActiveHref('/', at('/admin'))).toBe(false);
    expect(linkAt('/admin', '/admin/accounts?vak=basis').getAttribute('aria-current')).toBe('page');
  });
});
