import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CenteredCard } from './centered-card.tsx';
import { PageHeader } from './page-header.tsx';
import type { BuildInfo } from '../lib/api-client.ts';
import { ShellFrame, ShellSessionProvider } from './shell-frame.tsx';
import { SidebarShell } from './sidebar-shell.tsx';
import type { NavItem } from './sidebar.tsx';
import { OfflineNotice } from './offline-notice.tsx';
import { shellContract, shellContractCases } from './testing.tsx';
import { TopbarShell } from './topbar-shell.tsx';

const nav: NavItem<string>[] = [
  { label: 'Home', href: '/', permission: 'app.use' },
  { label: 'Accounts', href: '/accounts', permission: 'app.use' },
  { label: 'Instellingen', href: '/instellingen', permission: 'app.use' },
];
const props = { nav, userName: 'Ada Admin', menuItems: [] };

// De contracttest slaagt op beide schillen, ook zonder nav-items (dan geen nav, menuknop of sheet).
describe('schillen/AC-5: shellContract op beide schillen', () => {
  shellContract(SidebarShell, { props });
  shellContract(TopbarShell, { props });
  shellContract(SidebarShell, { props: { ...props, nav: [] } });
  shellContract(TopbarShell, { props: { ...props, nav: [] } });
});

// schillen/AC-16: focus bij de mount van een schil, met ShellSessionProvider onder StrictMode.
afterEach(cleanup);

const nextFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

// Eén router per test, zodat een rerender dezelfde router houdt.
function appWithRouter() {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return (node: ReactNode, session = true) => {
    const tree = <RouterContextProvider router={router}>{node}</RouterContextProvider>;
    return <StrictMode>{session ? <ShellSessionProvider>{tree}</ShellSessionProvider> : tree}</StrictMode>;
  };
}

const sidebar = (title: string, children?: ReactNode) => (
  <SidebarShell {...props} routeKey="/">
    <PageHeader title={title} />
    {children}
  </SidebarShell>
);
const topbar = (title: string) => (
  <TopbarShell {...props} routeKey="/">
    <PageHeader title={title} />
  </TopbarShell>
);
const login = <CenteredCard title="Inloggen">formulier</CenteredCard>;

async function settle() {
  await nextFrame();
  await nextFrame();
}

describe('schillen/AC-16: focus bij de mount van een schil', () => {
  test('schillen/AC-16: de schil mount in een latere commit dan de provider (async guard): focus blijft op body', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(null));
    await settle();
    rerender(wrap(sidebar('Dashboard')));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  test('schillen/AC-16: met een CenteredCard als kind in dezelfde commit blijft de focus op body', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(null));
    await settle();
    rerender(wrap(sidebar('Dashboard', <CenteredCard title="E-mailadres bevestigd">klaar</CenteredCard>)));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  test('schillen/AC-16: eerst een CenteredCard, daarna een schil: focus op de h1', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(login));
    await settle();
    rerender(wrap(sidebar('Dashboard')));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Dashboard' }));
  });

  test('schillen/AC-16: een schil die een andere vervangt: focus op de h1', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(sidebar('Beheer')));
    await settle();
    expect(document.activeElement).toBe(document.body);
    rerender(wrap(topbar('Portaal')));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Portaal' }));
  });

  test('schillen/AC-16: zonder provider geen focus bij de mount, wel bij een wissel van routeKey', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(login, false));
    await settle();
    rerender(wrap(sidebar('Dashboard'), false));
    await settle();
    expect(document.activeElement).toBe(document.body);
    rerender(
      wrap(
        <SidebarShell {...props} routeKey="/accounts">
          <PageHeader title="Accounts" />
        </SidebarShell>,
        false,
      ),
    );
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Accounts' }));
  });
});

// schillen/AC-10: een eigen schil op ShellFrame slaagt; een schil zonder skip-link, met een tweede main of met een eigen
// OfflineNotice faalt op het bijbehorende geval van de contracttest.
interface FixtureProps {
  readonly label: string;
  readonly routeKey?: string | undefined;
  // Spec release-versie: een schil geeft buildInfo door aan ShellFrame.
  readonly buildInfo?: BuildInfo | undefined;
  readonly children: ReactNode;
}

const fixtureHeader = (label: string, extra?: ReactNode) => (
  <header className="print:hidden">
    <span>{label}</span>
    {extra}
  </header>
);

function EigenSchil({ label, routeKey, buildInfo, children }: FixtureProps) {
  return (
    <ShellFrame
      className="flex flex-col"
      routeKey={routeKey}
      buildInfo={buildInfo}
      header={fixtureHeader(label)}
      nav={null}
    >
      {children}
    </ShellFrame>
  );
}

// Spec release-versie: geeft buildInfo niet door aan ShellFrame.
function SchilZonderBuildInfo({ label, routeKey, children }: FixtureProps) {
  return (
    <ShellFrame className="flex flex-col" routeKey={routeKey} header={fixtureHeader(label)} nav={null}>
      {children}
    </ShellFrame>
  );
}

function SchilZonderSkipLink({ label, children }: FixtureProps) {
  return (
    <div>
      {fixtureHeader(label)}
      <main tabIndex={-1}>{children}</main>
    </div>
  );
}

function SchilMetTweedeMain({ label, routeKey, children }: FixtureProps) {
  return (
    <ShellFrame className="flex flex-col" routeKey={routeKey} header={fixtureHeader(label)} nav={null}>
      <main>{children}</main>
    </ShellFrame>
  );
}

function SchilMetEigenOfflineNotice({ label, routeKey, children }: FixtureProps) {
  return (
    <ShellFrame
      className="flex flex-col"
      routeKey={routeKey}
      header={fixtureHeader(label, <OfflineNotice />)}
      nav={null}
    >
      {children}
    </ShellFrame>
  );
}

const fixtureProps = { props: { label: 'Eigen schil' } };

// Voert elk geval uit en geeft de namen van de gevallen die falen.
async function failingCases(cases: ReturnType<typeof shellContractCases>): Promise<string[]> {
  const failed: string[] = [];
  for (const geval of cases) {
    try {
      await geval.run();
    } catch {
      failed.push(geval.naam);
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  }
  return failed;
}

async function expectCaseToFail(cases: ReturnType<typeof shellContractCases>, fragment: string) {
  const geval = cases.find((candidate) => candidate.naam.includes(fragment));
  expect(geval, `geval met "${fragment}" ontbreekt`).toBeDefined();
  await expect(geval?.run()).rejects.toThrow();
  cleanup();
  vi.restoreAllMocks();
}

describe('schillen/AC-10: shellContract op een eigen schil', () => {
  // De suite zelf registreert de gevallen als tests: een schil op ShellFrame slaagt op alle.
  shellContract(EigenSchil, fixtureProps);

  test('schillen/AC-10: shellContractCases geeft structuur- en focusgevallen en een eigen schil slaagt op alle', async () => {
    const cases = shellContractCases(EigenSchil, fixtureProps);
    expect(cases.length).toBeGreaterThanOrEqual(7);
    expect(cases.map((geval) => geval.naam)).toContain('OfflineNotice staat er precies één keer');
    expect(await failingCases(cases)).toStrictEqual([]);
  });

  test('schillen/AC-10: een schil zonder skip-link laat het skip-linkgeval falen', async () => {
    const cases = shellContractCases(SchilZonderSkipLink, fixtureProps);
    await expectCaseToFail(cases, 'de skip-link is de eerste Tab-stop');
  });

  test('schillen/AC-10: een schil met een tweede main laat het main-geval falen', async () => {
    const cases = shellContractCases(SchilMetTweedeMain, fixtureProps);
    await expectCaseToFail(cases, 'precies één main');
  });

  test('schillen/AC-10: een schil met een eigen OfflineNotice laat het OfflineNotice-geval falen', async () => {
    const cases = shellContractCases(SchilMetEigenOfflineNotice, fixtureProps);
    await expectCaseToFail(cases, 'OfflineNotice staat er precies één keer');
  });

  test('release-versie/AC-11: een schil die buildInfo niet doorgeeft laat het voetgeval falen', async () => {
    const cases = shellContractCases(SchilZonderBuildInfo, fixtureProps);
    await expectCaseToFail(cases, 'met buildInfo staat de voet');
  });
});
