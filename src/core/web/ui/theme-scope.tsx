import type { ReactNode } from 'react';

// Zet een app-thema op een deel van de app (spec app-thema, deel C): componenten erbinnen rekenen met de tokens van dat
// thema, erbuiten met die van het document. `display: contents`: de wrapper voegt geen box toe aan de layout. Zonder thema
// (null) erft de deelboom het thema van het document. Meldingen (ToastProvider) staan buiten elke scope en volgen het document.
export function ThemeScope({ theme, children }: { readonly theme: string | null; readonly children: ReactNode }) {
  return (
    <div data-app-theme={theme ?? undefined} className="contents">
      {children}
    </div>
  );
}
