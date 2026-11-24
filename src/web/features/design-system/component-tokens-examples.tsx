import { useSyncExternalStore } from 'react';
import { uiTexts } from '#core/web/copy/ui.ts';
import { Section, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#web/ui/index.ts';
import { COMPONENT_TOKENS } from './component-tokens.ts';

// Spec app-thema (AC-7): de sectie "Componenttokens" met token, component, standaard en de berekende waarde.

// De berekende waarde op <html>; leeg in een omgeving zonder CSS (vitest).
function computedValue(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

// Opnieuw renderen als licht/donker of het app-thema op <html> wisselt, zodat de waarde meeloopt.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-app-theme'] });
  return () => {
    observer.disconnect();
  };
}

function themeSnapshot(): string {
  const html = document.documentElement;
  return `${html.getAttribute('data-theme') ?? ''}|${html.getAttribute('data-app-theme') ?? ''}`;
}

export function ComponentTokensExamples() {
  useSyncExternalStore(subscribe, themeSnapshot);
  return (
    <Section
      id="example-componenttokens"
      title={uiTexts.componentTokens}
      description={uiTexts.componentTokensIntro}
      framed
    >
      <Table label={uiTexts.componentTokensTable}>
        <TableHeader>
          <TableRow>
            <TableHead>{uiTexts.tokenColumn}</TableHead>
            <TableHead>{uiTexts.componentColumn}</TableHead>
            <TableHead>{uiTexts.defaultColumn}</TableHead>
            <TableHead>{uiTexts.valueColumn}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMPONENT_TOKENS.map(({ token, component, standaard }) => (
            <TableRow key={token}>
              <TableCell>{token}</TableCell>
              <TableCell>{component}</TableCell>
              <TableCell>{standaard}</TableCell>
              <TableCell>{computedValue(token)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
