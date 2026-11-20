import { uiTexts } from '../copy/ui.ts';
import { supportReference } from '../lib/api-client.ts';
import { CopyButton } from './copy-button.tsx';

export interface ErrorReferenceProps {
  readonly error: unknown;
}

// Spec foutreferentie: "Referentie: <id>" met een kopieerknop bij een serverfout met geldige requestId, anders niets (geen
// lege regel). Toont nooit code, status, message of iets anders van de fout; de id is selecteerbare tekst als kopiëren faalt.
export function ErrorReference({ error }: ErrorReferenceProps) {
  const id = supportReference(error);
  if (id === null) return null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">
        {uiTexts.errorReference} <span className="font-mono break-all">{id}</span>
      </p>
      <CopyButton value={id} label={uiTexts.copyErrorReference} copiedLabel={uiTexts.errorReferenceCopied} />
    </div>
  );
}
