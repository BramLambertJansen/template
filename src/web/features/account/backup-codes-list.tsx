import { useState } from 'react';
import { copy } from '#web/copy/ui.ts';
import { Button, List, ListItem, Notice, useErrorText } from '#web/ui/index.ts';

interface BackupCodesListProps {
  readonly codes: readonly string[];
  readonly onDone: () => Promise<void> | void;
}

// De herstelcodes, één keer getoond (ADR 0113 punt 2): na inschrijven (inlogscherm) en na opnieuw maken (/account). De knop
// staat na de lijst, zodat de focus pas na de codes op "Ik heb ze bewaard" komt (spec accountbeheer-uitbreiding).
export function BackupCodesList({ codes, onDone }: BackupCodesListProps) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDone();
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {error === null ? null : <Notice tone="error">{error}</Notice>}
      <List>
        {codes.map((code) => (
          <ListItem key={code} title={<code>{code}</code>} />
        ))}
      </List>
      <Button busy={busy} onClick={() => void done()}>
        {copy.backupCodes.saved}
      </Button>
    </div>
  );
}
