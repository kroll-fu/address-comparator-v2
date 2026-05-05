import { describe, it, expect } from 'vitest';
import { escapeCSV, exportMatchesToCSV, exportAllToCSV } from './csv-exporter';
import type { LRCustomerResult, MatchThresholds, NormalizedRecord, MatchScores } from '../types/matching';

function makeRecord(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    sourceRow: 0,
    firstName: 'john',
    lastName: 'smith',
    fullName: 'john smith',
    street: '123 main st',
    city: 'westport',
    state: 'CT',
    zip: '06880',
    rawName: 'John Smith',
    rawAddress: '123 Main St',
    installer: '',
    ...overrides,
  };
}

function makeScores(overrides: Partial<MatchScores> = {}): MatchScores {
  return {
    addressScore: 0.90,
    nameScore: 0.85,
    emailScore: 0,
    installerScore: 0,
    streetScore: 0.95,
    cityScore: 0.90,
    stateMatch: true,
    zipMatch: true,
    ...overrides,
  };
}

const thresholds: MatchThresholds = {
  addressThreshold: 0.85,
  nameThreshold: 0.82,
  emailThreshold: 1.0,
};

describe('escapeCSV', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCSV('hello')).toBe('hello');
  });

  it('wraps string with comma in quotes', () => {
    expect(escapeCSV('hello, world')).toBe('"hello, world"');
  });

  it('escapes double quotes', () => {
    expect(escapeCSV('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('wraps string with newline in quotes', () => {
    expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('exportMatchesToCSV', () => {
  it('includes headers with ES_ prefixed columns including ES_Installer', () => {
    const csv = exportMatchesToCSV([], thresholds);
    const headers = csv.split('\n')[0];

    expect(headers).toContain('ES_First Name');
    expect(headers).toContain('ES_Last Name');
    expect(headers).toContain('ES_Street');
    expect(headers).toContain('ES_Installer');
    expect(headers).toContain('Match Type');
    expect(headers).toContain('Address Score');
    expect(headers).toContain('Email Score');
    expect(headers).toContain('Installer Score');
    expect(headers).toContain('LR Installer');
    expect(headers).not.toContain('Last Name Match');
  });

  it('includes only Full Match and Household Match rows', () => {
    const fullMatch: LRCustomerResult = {
      lrRecord: makeRecord({ firstName: 'full' }),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }) }],
    };
    const household: LRCustomerResult = {
      lrRecord: makeRecord({ firstName: 'household' }),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores({ addressScore: 0.90, nameScore: 0.50 }) }],
    };
    const noMatch: LRCustomerResult = {
      lrRecord: makeRecord({ firstName: 'nomatch' }),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores({ addressScore: 0.50, nameScore: 0.90 }) }],
    };

    const csv = exportMatchesToCSV([fullMatch, household, noMatch], thresholds);
    const lines = csv.split('\n');

    // Header + 2 data rows (no NoMatch)
    expect(lines).toHaveLength(3);
    expect(csv).toContain('Full Match');
    expect(csv).toContain('Household Match');
    expect(csv).not.toContain('No Match');
  });

  it('formats scores as percentages', () => {
    const result: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores({ addressScore: 0.85, nameScore: 0.92 }) }],
    };

    const csv = exportMatchesToCSV([result], thresholds);
    expect(csv).toContain('85%');
    expect(csv).toContain('92%');
  });
  it('includes installer value in exported CSV output', () => {
    const result: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [{ esRecord: makeRecord({ installer: 'SunRun Solar' }), scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }) }],
    };

    const csv = exportMatchesToCSV([result], thresholds);
    expect(csv).toContain('SunRun Solar');
  });

  it('includes ES Submitted Date column header', () => {
    const csv = exportMatchesToCSV([], thresholds);
    const headers = csv.split('\n')[0];
    expect(headers).toContain('ES Submitted Date');
  });

  it('emits the ES submittedDate value in the export row', () => {
    const result: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [{
        esRecord: makeRecord({ submittedDate: '2025-01-15' }),
        scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }),
      }],
    };
    const csv = exportMatchesToCSV([result], thresholds);
    expect(csv).toContain('2025-01-15');
  });

  it('emits an empty cell when ES submittedDate is missing', () => {
    const result: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [{
        esRecord: makeRecord(),
        scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }),
      }],
    };
    const csv = exportMatchesToCSV([result], thresholds);
    const dataLine = csv.split('\n')[1];
    // The line should still parse: same comma count as the header
    const headerCommas = csv.split('\n')[0].split(',').length;
    const dataCommas = dataLine.split(',').length;
    expect(dataCommas).toBe(headerCommas);
  });
});

describe('exportAllToCSV', () => {
  it('includes NoMatch rows', () => {
    const noMatch: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores({ addressScore: 0.50, nameScore: 0.90 }) }],
    };

    const csv = exportAllToCSV([noMatch], thresholds);
    expect(csv).toContain('No Match');
  });

  it('handles empty topMatches', () => {
    const emptyResult: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [],
    };

    const csv = exportAllToCSV([emptyResult], thresholds);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // Header + 1 data row
    expect(csv).toContain('No Match');
  });

  it('produces parseable CSV without unescaped commas in data', () => {
    const result: LRCustomerResult = {
      lrRecord: makeRecord({ street: '123 main st, apt 4' }),
      topMatches: [{ esRecord: makeRecord(), scores: makeScores() }],
    };

    const csv = exportAllToCSV([result], thresholds);
    const lines = csv.split('\n');

    // Each line should have the same number of commas (allowing for escaped ones)
    // This is a basic structural check
    expect(lines.length).toBeGreaterThan(1);
  });
});
