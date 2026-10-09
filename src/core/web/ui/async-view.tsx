import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { useErrorText } from './error-texts.tsx';

interface AsyncViewProps<Data> {
  readonly query: UseQueryResult<Data>;
  // Wanneer de data als leeg telt (bijv. een lege lijst); dan staat emptyText er in plaats van children.
  readonly isEmpty?: (data: Data) => boolean;
  readonly emptyText?: string;
  readonly children: (data: Data) => ReactNode;
}

// Laden, fout, leeg en data op één plek (framework §5): features lezen nooit zelf isLoading of isError.
export function AsyncView<Data>({ query, isEmpty, emptyText = uiTexts.empty, children }: AsyncViewProps<Data>) {
  const errorText = useErrorText();
  if (query.isPending) return <p role="status">{uiTexts.loading}</p>;
  if (query.isError) {
    return (
      <div role="alert">
        <p>{errorText(query.error)}</p>
        <button type="button" onClick={() => void query.refetch()}>
          {uiTexts.retry}
        </button>
      </div>
    );
  }
  if (isEmpty?.(query.data) === true) return <p>{emptyText}</p>;
  return <>{children(query.data)}</>;
}
