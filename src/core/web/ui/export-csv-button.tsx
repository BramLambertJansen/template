import { useState } from 'react';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { assertCsvColumns, toCsv, type CsvColumn } from './csv.ts';

export interface ExportCsvButtonProps<Row> {
  readonly rows: readonly Row[];
  readonly columns: readonly CsvColumn<Row>[];
  readonly filename: string;
  readonly label?: string;
  readonly doneLabel?: string;
  readonly errorLabel?: string;
  readonly disabled?: boolean;
}

function csvFilename(filename: string): string {
  const name = filename.trim();
  assert(name !== '', 'ExportCsvButton needs a non-empty filename');
  return name.toLowerCase().endsWith('.csv') ? name : `${name}.csv`;
}

// Het anker wordt alleen programmatisch gemaakt en direct weer verwijderd; de URL vrijgeven na deze klik.
function download(csv: string, name: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

export function ExportCsvButton<Row>({
  rows,
  columns,
  filename,
  label = uiTexts.exportCsv,
  doneLabel = uiTexts.exportCsvDone,
  errorLabel = uiTexts.exportCsvFailed,
  disabled = false,
}: ExportCsvButtonProps<Row>) {
  const name = csvFilename(filename);
  assertCsvColumns(columns);
  const [result, setResult] = useState<'done' | 'failed' | null>(null);
  const exportRows = () => {
    if (disabled) return;
    try {
      download(toCsv(rows, columns), name);
      setResult('done');
    } catch {
      setResult('failed');
    }
  };
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button type="button" variant="outline" disabled={disabled} onClick={exportRows}>
        {label}
      </Button>
      <p role="status">{result === 'done' ? doneLabel : ''}</p>
      <p role="alert">{result === 'failed' ? errorLabel : ''}</p>
    </div>
  );
}
