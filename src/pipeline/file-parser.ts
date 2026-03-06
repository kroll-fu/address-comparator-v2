import * as XLSX from 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a file from an ArrayBuffer (testable without File API).
 * Returns headers from first row and all data rows as string[][].
 */
export function parseFileFromBuffer(buffer: ArrayBuffer, fileName: string): ParsedFile {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Failed to parse "${fileName}": ${detail}`);
  }
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  // Convert sheet to array of arrays, all values as strings
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  if (rawData.length === 0) {
    return { headers: [], rows: [] };
  }

  // First row is headers
  const headers = (rawData[0] as unknown[]).map(v => String(v ?? ''));

  // Remaining rows are data
  const rows = rawData.slice(1).map(row =>
    (row as unknown[]).map(v => String(v ?? ''))
  );

  return { headers, rows };
}

/**
 * Parse a File object (browser context).
 * Reads as ArrayBuffer then delegates to parseFileFromBuffer.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  return parseFileFromBuffer(buffer, file.name);
}
