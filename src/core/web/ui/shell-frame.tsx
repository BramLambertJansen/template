import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { uiTexts } from '../copy/ui.ts';
import type { BuildInfo } from '../lib/api-client.ts';
import { cn } from './cn.ts';
import type { MenuItem } from './dropdown-menu.tsx';
import { OfflineNotice } from './offline-notice.tsx';
import type { NavItem } from './sidebar.tsx';

// Het frame onder elke schil (spec schillen): skip-link als eerste Tab-stop, precies één main met het doel van de
// skip-link, focus naar de h1 na een routewissel en bij een mount nadat er al een scherm stond, OfflineNotice precies
// één keer boven main, het lichte thema bij afdrukken en de print-regels. Het frame bepaalt geen indeling: de schil geeft
// de layout-klassen (className) en vult de plekken. Meldingen rendert ToastProvider, niet het frame.

const MAIN_ID = 'inhoud';

// --- Eerste weergave van het document ---------------------------------------------------------------------------------
// ShellSessionProvider (om de router, src/web/main.tsx) houdt bij of er al een scherm is getoond. Niet de provider zet dat,
// maar het eerste scherm zelf (ShellFrame en CenteredCard via useMarkScreenShown): zo telt een guard die de sessie async
// laadt niet als weergave. Binnen een frame doet useMarkScreenShown niets: effecten van kinderen lopen vóór die van de
// ouder, dus een CenteredCard in een schil zou de ref anders zetten voordat het frame hem leest.
const ShellSessionContext = createContext<RefObject<boolean> | null>(null);
const InsideFrameContext = createContext(false);

export function ShellSessionProvider({ children }: { readonly children: ReactNode }) {
  const shown = useRef(false);
  return <ShellSessionContext.Provider value={shown}>{children}</ShellSessionContext.Provider>;
}

// Markeert dat er een scherm is getoond. enabled=false (CenteredCard preview), binnen een frame of zonder provider: niets.
export function useMarkScreenShown(enabled = true): void {
  const session = useContext(ShellSessionContext);
  const inside = useContext(InsideFrameContext);
  useEffect(() => {
    if (!enabled || inside || session === null) return;
    session.current = true;
  }, [enabled, inside, session]);
}

// --- Focus naar de h1 --------------------------------------------------------------------------------------------------
// main en de h1 krijgen focus zonder focusring: niet interactief en niet met Tab bereikbaar (bewuste uitzondering op de
// regel "focusring nooit uit"); de schermlezer leest de plek voor.
// routeKey verandert pas als het nieuwe scherm gerenderd is (resolvedLocation), maar een scherm kan zijn h1 later tonen
// (lazy onderdeel, Suspense): dan wachten we tot er een h1 in main staat, en na HEADING_WAIT_MS zonder h1 gaat de focus
// naar main. Na de render, zodat een sluitend menu zijn focus eerst teruggeeft.
const HEADING_WAIT_MS = 2000;

// Een zichtbare h1: tijdens het laden van een lazy route verbergt React Suspense het oude scherm met een inline
// display: none en blijft zijn h1 in de DOM; focus() op een verborgen element doet niets.
function isHiddenWithin(element: HTMLElement, main: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null && node !== main; node = node.parentElement) {
    if (node.hidden || node.style.display === 'none') return true;
  }
  return false;
}

function focusVisibleHeading(main: HTMLElement): boolean {
  const heading = [...main.querySelectorAll<HTMLElement>('h1')].find((element) => !isHiddenWithin(element, main));
  heading?.focus();
  return heading !== undefined && document.activeElement === heading;
}

// Is de focus verloren (op body, of op een element dat net uit de DOM ging)? Dan mag de focus terug naar de h1; staat hij
// ergens anders, dan heeft de gebruiker hem verplaatst en blijven we eraf.
function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

function focusHeadingWhenPresent(main: HTMLElement): () => void {
  let focused = false;
  // Tot HEADING_WAIT_MS: een lazy scherm kan zijn h1 nog vervangen (opnieuw renderen), dan verdwijnt de gefocuste node.
  const attempt = () => {
    if (focused && !focusLost()) return;
    if (focusVisibleHeading(main)) focused = true;
  };
  const observer = new MutationObserver(attempt);
  const frame = requestAnimationFrame(() => {
    attempt();
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  });
  const timer = setTimeout(() => {
    stop();
    attempt();
    if (!focused) main.focus();
  }, HEADING_WAIT_MS);
  function stop() {
    cancelAnimationFrame(frame);
    observer.disconnect();
    clearTimeout(timer);
  }
  return stop;
}

// Bij de mount: de focus naar de h1, behalve bij de eerste weergave van het document. De beslissing valt bij de eerste
// effect-run en staat daarna in een eigen ref; elke run (ook de extra run van StrictMode) voert die beslissing uit met een
// eigen cleanup. Zo verplaatst de tweede run de focus bij het eerste scherm niet, en annuleert de cleanup van de eerste
// run de focus bij een latere mount niet. Zonder provider: geen focus bij de mount.
function useFocusOnMount(mainRef: RefObject<HTMLElement | null>) {
  const session = useContext(ShellSessionContext);
  const decision = useRef<boolean | null>(null);
  useEffect(() => {
    decision.current ??= session?.current === true;
    const main = mainRef.current;
    return decision.current && main !== null ? focusHeadingWhenPresent(main) : undefined;
  }, [session, mainRef]);
}

function useFocusOnRouteChange(mainRef: RefObject<HTMLElement | null>, routeKey: string | undefined) {
  const previous = useRef(routeKey);
  useEffect(() => {
    if (previous.current === routeKey) return;
    previous.current = routeKey;
    const main = mainRef.current;
    return main === null ? undefined : focusHeadingWhenPresent(main);
  }, [mainRef, routeKey]);
}

// --- Afdrukken ---------------------------------------------------------------------------------------------------------
// Afdrukken in lichte kleuren: bij beforeprint tijdelijk data-theme="light", bij afterprint (of unmount tijdens het afdrukken)
// het vorige thema terug. Zonder setTheme: de bewaarde keuze in localStorage blijft (spec offline-en-print, OV-1).
function usePrintInLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    let saved: { readonly theme: string | null } | null = null;
    const handleBeforePrint = () => {
      if (saved !== null) return;
      saved = { theme: root.getAttribute('data-theme') };
      root.setAttribute('data-theme', 'light');
    };
    const handleAfterPrint = () => {
      if (saved === null) return;
      if (saved.theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', saved.theme);
      saved = null;
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      handleAfterPrint();
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);
}

// --- Het frame ---------------------------------------------------------------------------------------------------------
interface ShellFrameProps {
  // De balk boven de inhoud (Topbar); verborgen bij afdrukken.
  readonly header: ReactNode;
  // Navigatie buiten de balk en de kolom, bijv. de menusheet voor smalle schermen; null zonder navigatie.
  readonly nav: ReactNode;
  // Optionele kolom naast de inhoud, bijv. <aside> met de Sidebar; verborgen bij afdrukken.
  readonly aside?: ReactNode;
  // Layout-klassen van de buitenste container (grid of flex); het frame voegt alleen print:block toe.
  readonly className?: string;
  // Verandert bij elke routewissel (bijv. het pad); de focus gaat dan naar de h1 van het nieuwe scherm (WCAG 2.4.3).
  readonly routeKey?: string | undefined;
  // Versie en build van de server voor de voet onder main (spec release-versie); zonder geen voet.
  readonly buildInfo?: BuildInfo | undefined;
  readonly children: ReactNode;
}

export function ShellFrame({ header, nav, aside, className, routeKey, buildInfo, children }: ShellFrameProps) {
  const mainRef = useRef<HTMLElement>(null);
  // Volgorde telt: eerst lezen of er al een scherm stond, daarna markeren dat dit frame er nu staat.
  useFocusOnMount(mainRef);
  useMarkScreenShown();
  useFocusOnRouteChange(mainRef, routeKey);
  usePrintInLightTheme();

  return (
    <InsideFrameContext.Provider value={true}>
      <div className={cn('min-h-dvh', className, 'print:block')}>
        {/* Eerste Tab-stop (WCAG 2.4.1): langs navigatie en balk direct naar de inhoud. Alleen zichtbaar met focus. */}
        {/* Zonder fragment in de URL of extra history-stap: de klik zet zelf de focus op main. */}
        <a
          href={`#${MAIN_ID}`}
          onClick={(event) => {
            event.preventDefault();
            mainRef.current?.focus();
          }}
          className="sr-only rounded-md bg-background text-sm text-foreground focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-toast focus:inline-flex focus:min-h-control focus:items-center focus:px-3 focus:ring-2 focus:ring-ring print:hidden"
        >
          {uiTexts.skipToContent}
        </a>
        {aside}
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          {/* In de flow, niet fixed of sticky: de melding schuift de inhoud omlaag en dekt niets af. Leeg (online) neemt de
              wrapper geen ruimte in. */}
          <div className="px-shell-content pt-shell-content empty:hidden md:px-shell-content-wide print:hidden">
            <OfflineNotice />
          </div>
          <main
            ref={mainRef}
            id={MAIN_ID}
            tabIndex={-1}
            className="mx-auto w-full max-w-shell-main min-w-0 flex-1 p-shell-content focus:outline-none md:p-shell-content-wide print:max-w-none print:p-0"
          >
            {children}
          </main>
          {/* De voet (spec release-versie): klein en gedempt, "Versie x.y.z" en met een build " · build <7 tekens>". */}
          {buildInfo === undefined ? null : (
            <footer className="px-shell-content pb-shell-content text-xs text-muted-foreground md:px-shell-content-wide print:hidden">
              {uiTexts.buildInfo(buildInfo.version, buildInfo.build?.slice(0, 7))}
            </footer>
          )}
        </div>
        {nav}
      </div>
    </InsideFrameContext.Provider>
  );
}

// De props van elke schil op het frame (SidebarShell, TopbarShell, een eigen schil van de app).
export interface ShellProps {
  readonly nav: readonly NavItem<string>[];
  readonly userName: string;
  readonly menuItems: readonly MenuItem[];
  // In de topbalk, vóór het profielmenu (bijv. <ThemeToggle />).
  readonly topbarActions?: ReactNode;
  // Verandert bij elke routewissel (bijv. het pad); de focus gaat dan naar de h1 van het nieuwe scherm (WCAG 2.4.3).
  readonly routeKey?: string | undefined;
  // Versie en build voor de voet; de schil geeft hem door aan ShellFrame (spec release-versie).
  readonly buildInfo?: BuildInfo | undefined;
  readonly children: ReactNode;
}
