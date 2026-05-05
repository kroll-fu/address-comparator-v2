import type { LRCustomerResult, MatchThresholds } from '../types/matching';
import { MatchType } from '../types/matching';
import { classifyMatch } from './classifier';

/** Escape a CSV value: wrap in quotes if contains comma, quote, or newline */
export function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  [MatchType.FullMatch]: 'Full Match',
  [MatchType.HouseholdMatch]: 'Household Match',
  [MatchType.NoMatch]: 'No Match',
};

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function buildCSVHeaders(lrExtraHeaders: string[]): string[] {
  return [
    'Match Type',
    'Address Score',
    'Name Score',
    'Email Score',
    'Company Score',
    'LR First Name',
    'LR Last Name',
    'LR Email',
    'LR Company',
    'LR Customer ID',
    'LR Street',
    'LR City',
    'LR State',
    'LR Zip',
    'ES_First Name',
    'ES_Last Name',
    'ES_Street',
    'ES_City',
    'ES_State',
    'ES_Zip',
    'ES_Installer',
    'ES Submitted Date',
    ...lrExtraHeaders,
  ];
}

function buildCSVRow(result: LRCustomerResult, thresholds: MatchThresholds, lrExtraHeaders: string[]): string[] {
  const topMatch = result.topMatches[0];
  const lr = result.lrRecord;

  const extraValues = lrExtraHeaders.map(h => lr.rawData?.[h] ?? '');

  if (!topMatch) {
    const matchType = MatchType.NoMatch;
    return [
      MATCH_TYPE_LABELS[matchType],
      '0%',
      '0%',
      '0%',
      '0%',
      lr.firstName,
      lr.lastName,
      lr.email ?? '',
      lr.company ?? '',
      lr.customerId ?? '',
      lr.street,
      lr.city,
      lr.state,
      lr.zip,
      '', '', '', '', '', '', '', '',
      ...extraValues,
    ];
  }

  const matchType = classifyMatch(topMatch.scores, thresholds);

  return [
    MATCH_TYPE_LABELS[matchType],
    formatPercent(topMatch.scores.addressScore),
    formatPercent(topMatch.scores.nameScore),
    formatPercent(topMatch.scores.emailScore),
    formatPercent(topMatch.scores.companyScore),
    lr.firstName,
    lr.lastName,
    lr.email ?? '',
    lr.company ?? '',
    lr.customerId ?? '',
    lr.street,
    lr.city,
    lr.state,
    lr.zip,
    topMatch.esRecord.firstName,
    topMatch.esRecord.lastName,
    topMatch.esRecord.street,
    topMatch.esRecord.city,
    topMatch.esRecord.state,
    topMatch.esRecord.zip,
    topMatch.esRecord.installer,
    topMatch.esRecord.submittedDate ?? '',
    ...extraValues,
  ];
}

function rowToCSVLine(row: string[]): string {
  return row.map(escapeCSV).join(',');
}

/**
 * Export Full Match + Household Match results to CSV string.
 */
export function exportMatchesToCSV(
  results: LRCustomerResult[],
  thresholds: MatchThresholds,
  lrExtraHeaders: string[] = [],
): string {
  const headers = buildCSVHeaders(lrExtraHeaders);
  const lines: string[] = [rowToCSVLine(headers)];

  for (const result of results) {
    const matchType = result.topMatches.length > 0
      ? classifyMatch(result.topMatches[0].scores, thresholds)
      : MatchType.NoMatch;
    if (matchType === MatchType.NoMatch) continue;

    lines.push(rowToCSVLine(buildCSVRow(result, thresholds, lrExtraHeaders)));
  }

  return lines.join('\n');
}

/**
 * Export all results (including No Match) to CSV string.
 */
export function exportAllToCSV(
  results: LRCustomerResult[],
  thresholds: MatchThresholds,
  lrExtraHeaders: string[] = [],
): string {
  const headers = buildCSVHeaders(lrExtraHeaders);
  const lines: string[] = [rowToCSVLine(headers)];

  for (const result of results) {
    lines.push(rowToCSVLine(buildCSVRow(result, thresholds, lrExtraHeaders)));
  }

  return lines.join('\n');
}
