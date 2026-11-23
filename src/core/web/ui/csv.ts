import { assert } from '#core/shared/assert.ts';

// Spec csv-export: CSV voor Nederlandse Excel (BOM, puntkomma, CRLF), zonder DOM.
export interface CsvColumn<Row> {
  readonly header: string;
  readonly value: (row: Row) => string;
}

const BOM = '﻿';
const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r']);
const NEEDS_QUOTES = /[;"\r\n]/;

// Een cel die Excel als formule zou lezen, krijgt eerst een apostrof; daarna quoten indien nodig.
function cell(value: string): string {
  const safe = FORMULA_START.has(value.charAt(0)) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function assertCsvColumns<Row>(columns: readonly CsvColumn<Row>[]): void {
  assert(columns.length > 0, 'CSV export needs at least one column');
  assert(
    columns.every((column) => column.header.trim() !== ''),
    'CSV export needs a non-empty header for every column',
  );
}

export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  assertCsvColumns(columns);
  const lines = [
    columns.map((column) => cell(column.header)).join(';'),
    ...rows.map((row) => columns.map((column) => cell(column.value(row))).join(';')),
  ];
  return BOM + lines.join('\r\n');
}
