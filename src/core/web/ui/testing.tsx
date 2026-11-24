import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, createElement, type ComponentType, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { uiTexts } from '../copy/ui.ts';
import { CenteredCard } from './centered-card.tsx';
import { PageHeader } from './page-header.tsx';
import { ShellSessionProvider } from './shell-frame.tsx';
import { ToastProvider } from './toast.tsx';

// Alleen voor testbestanden (dependency-cruiser: testing-alleen-in-tests): de contracttest van een schil (spec schillen).
// shellContract(Schil, opties) eist wat ShellFrame garandeert: één main; de skip-link is de eerste Tab-stop en zet de focus
// op main; na een wissel van routeKey, en bij een mount nadat het document al een scherm toonde, staat de focus op de
// h1; bij de eerste weergave verplaatst de schil de focus niet, ook niet onder StrictMode; OfflineNotice staat er precies
// één keer; de schil rendert geen meldingen (geen [data-toaster] binnen de schil); bij afdrukken zijn navigatie en balk
// verborgen. De suite toetst zowel zonder ShellSessionProvider als met (eerste weergave en een eerder getoond scherm).
// Het eerste argument is het component zelf, zodat een check statisch ziet welke schil een suite toetst.

interface ContractShellProps {
  readonly routeKey?: string | undefined;
  readonly children: ReactNode;
}

export interface ShellContractOptions<Props extends ContractShellProps> {
  // De props van de schil, zonder children en routeKey (die zet de suite).
  readonly props: Omit<Props, 'children' | 'routeKey'>;
}

interface Setup {
  readonly session?: boolean;
  readonly strict?: boolean;
}

const nextFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

// NavLink en het menu "Meer" lezen de router; een router zonder routes in het geheugen is genoeg. Eén per test, zodat een
// rerender dezelfde router houdt.
const testRouter = () =>
  createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/'] }) });
let router = testRouter();

function wrap(node: ReactNode, { session = false, strict = false }: Setup): ReactNode {
  const inner = (
    <RouterContextProvider router={router}>
      {session ? <ShellSessionProvider>{node}</ShellSessionProvider> : node}
    </RouterContextProvider>
  );
  const withToasts = <ToastProvider>{inner}</ToastProvider>;
  return strict ? <StrictMode>{withToasts}</StrictMode> : withToasts;
}

// De buitenste node van de schil: de voorouder van main direct onder de container van render().
function shellRoot(container: HTMLElement): Element {
  let node: Element = screen.getByRole('main');
  while (node.parentElement !== null && node.parentElement !== container) node = node.parentElement;
  return node;
}

function hiddenInPrint(element: Element, root: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node === root ? null : node.parentElement) {
    if (node.classList.contains('print:hidden')) return true;
  }
  return false;
}

// Eén geval van de contracttest: naam en een run die bij een schending gooit. De aanroeper ruimt na elk geval op
// (cleanup, vi.restoreAllMocks); shellContract doet dat in afterEach.
export interface ShellContractCase {
  readonly naam: string;
  readonly run: () => Promise<void>;
}

// Intern: een geval mag synchroon zijn; shellContractCases maakt er een Promise van.
interface Geval {
  readonly naam: string;
  readonly run: () => void | Promise<void>;
}

type ShellFactory = (routeKey: string, title: string) => ReactNode;

// De gevallen van de contracttest los (spec schillen, AC-10): zo toetst een test dat een kapotte schil de suite laat falen.
// shellContract registreert precies deze gevallen als tests.
export function shellContractCases<Props extends ContractShellProps>(
  Schil: ComponentType<Props>,
  opties: ShellContractOptions<Props>,
): readonly ShellContractCase[] {
  const shell: ShellFactory = (routeKey, title) =>
    createElement(
      Schil,
      unsafeCast<Props>(
        { ...opties.props, routeKey, children: <PageHeader title={title} /> },
        'props zonder children en routeKey plus die twee vormen samen de props van de schil',
      ),
    );
  // Elk geval met een eigen router, ook buiten shellContract.
  return [...structureCases(shell), ...focusCases(shell)].map((geval) => ({
    naam: geval.naam,
    run: async () => {
      router = testRouter();
      await geval.run();
    },
  }));
}

export function shellContract<Props extends ContractShellProps>(
  Schil: ComponentType<Props>,
  opties: ShellContractOptions<Props>,
): void {
  describe(`shellContract: ${Schil.displayName ?? Schil.name}`, () => {
    afterEach(() => {
      cleanup();
      vi.restoreAllMocks();
    });
    for (const geval of shellContractCases(Schil, opties)) test(geval.naam, geval.run);
  });
}

function structureCases(shell: ShellFactory): Geval[] {
  return [
    {
      naam: 'precies één main; de skip-link is de eerste Tab-stop en zet de focus op main',
      run: () => {
        const { container } = render(wrap(shell('/', 'Home'), {}));
        expect(screen.getAllByRole('main')).toHaveLength(1);
        const first = container.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        expect(first?.textContent).toBe(uiTexts.skipToContent);
        if (!(first instanceof HTMLElement)) throw new Error('geen focusbaar element');
        fireEvent.click(first);
        expect(document.activeElement).toBe(screen.getByRole('main'));
      },
    },
    {
      naam: 'OfflineNotice staat er precies één keer',
      run: () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        render(wrap(shell('/', 'Home'), {}));
        act(() => {
          window.dispatchEvent(new Event('offline'));
        });
        expect(screen.getAllByText(uiTexts.offline)).toHaveLength(1);
      },
    },
    {
      naam: 'de schil rendert geen meldingen: geen [data-toaster] binnen de schil',
      run: () => {
        const { container } = render(wrap(shell('/', 'Home'), {}));
        expect(shellRoot(container).querySelector('[data-toaster]')).toBeNull();
        expect(container.querySelectorAll('[data-toaster]')).toHaveLength(1);
      },
    },
    {
      naam: 'bij afdrukken zijn skip-link, navigatie en balk verborgen',
      run: () => {
        const { container } = render(wrap(shell('/', 'Home'), {}));
        const root = shellRoot(container);
        const parts = [
          screen.getByRole('link', { name: uiTexts.skipToContent }),
          ...root.querySelectorAll('header, nav, aside'),
        ];
        expect(root.querySelector('header')).not.toBeNull();
        expect(parts.filter((part) => !hiddenInPrint(part, root)).map((part) => part.outerHTML)).toStrictEqual([]);
      },
    },
  ];
}

function focusCases(shell: ShellFactory): Geval[] {
  return [
    {
      naam: 'na een wissel van routeKey staat de focus op de h1; bij het eerste scherm niet (zonder provider)',
      run: async () => {
        const { rerender } = render(wrap(shell('/', 'Home'), {}));
        await nextFrame();
        expect(document.activeElement).toBe(document.body);
        rerender(wrap(shell('/b', 'Later'), {}));
        await nextFrame();
        expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Later' }));
      },
    },
    {
      naam: 'eerste weergave onder StrictMode met ShellSessionProvider: de focus blijft op body',
      run: async () => {
        render(wrap(shell('/', 'Home'), { session: true, strict: true }));
        await nextFrame();
        await nextFrame();
        expect(document.activeElement).toBe(document.body);
      },
    },
    {
      naam: 'mount nadat het document al een scherm toonde (StrictMode): de focus staat op de h1',
      run: async () => {
        const setup = { session: true, strict: true };
        const { rerender } = render(wrap(<CenteredCard title="Inloggen">formulier</CenteredCard>, setup));
        await nextFrame();
        rerender(wrap(shell('/', 'Dashboard'), setup));
        await nextFrame();
        await nextFrame();
        expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Dashboard' }));
      },
    },
  ];
}
