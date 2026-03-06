import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFileFromBuffer } from './file-parser';

function createXLSXBuffer(data: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return output;
}

function createCSVBuffer(data: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const output = XLSX.write(workbook, { type: 'array', bookType: 'csv' });
  return output;
}

describe('parseFileFromBuffer', () => {
  it('parses XLSX with correct headers and rows', () => {
    const data = [
      ['First Name', 'Last Name', 'City', 'State'],
      ['John', 'Smith', 'Westport', 'CT'],
      ['Jane', 'Doe', 'Hartford', 'CT'],
    ];

    const buffer = createXLSXBuffer(data);
    const result = parseFileFromBuffer(buffer, 'test.xlsx');

    expect(result.headers).toEqual(['First Name', 'Last Name', 'City', 'State']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['John', 'Smith', 'Westport', 'CT']);
    expect(result.rows[1]).toEqual(['Jane', 'Doe', 'Hartford', 'CT']);
  });

  it('returns string values for numeric data', () => {
    const data = [
      ['Name', 'Zip', 'Score'],
      ['John', 6510, 95.5],
    ];

    const buffer = createXLSXBuffer(data);
    const result = parseFileFromBuffer(buffer, 'test.xlsx');

    expect(result.rows[0][0]).toBe('John');
    expect(typeof result.rows[0][1]).toBe('string');
    expect(typeof result.rows[0][2]).toBe('string');
  });

  it('parses CSV content', () => {
    const data = [
      ['Customer', 'Address', 'City', 'State'],
      ['Abu Daniel', '174 Fort Lee Road', 'Leonia', 'New Jersey'],
    ];

    const buffer = createCSVBuffer(data);
    const result = parseFileFromBuffer(buffer, 'test.csv');

    expect(result.headers).toEqual(['Customer', 'Address', 'City', 'State']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]).toBe('Abu Daniel');
  });

  it('handles empty workbook', () => {
    const sheet = XLSX.utils.aoa_to_sheet([]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const result = parseFileFromBuffer(buffer, 'empty.xlsx');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('handles row count correctly', () => {
    const data = [
      ['Name'],
      ['Row1'],
      ['Row2'],
      ['Row3'],
      ['Row4'],
      ['Row5'],
    ];

    const buffer = createXLSXBuffer(data);
    const result = parseFileFromBuffer(buffer, 'test.xlsx');

    expect(result.headers).toEqual(['Name']);
    expect(result.rows).toHaveLength(5);
  });
});
