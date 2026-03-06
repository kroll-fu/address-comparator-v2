import type { NormalizedRecord, MatchScores, LRCustomerResult, MatchResult } from '../types/matching';
import { jaroWinkler } from './jaro-winkler';

/**
 * Score a single ES record against a single LR record.
 * Returns independent address, name, email, and company scores.
 * Address score weighted: street 50%, city 25%, state exact 15%, zip exact 10%.
 */
export function scoreRecord(esRecord: NormalizedRecord, lrRecord: NormalizedRecord): MatchScores {
  const streetScore = jaroWinkler(esRecord.street, lrRecord.street);
  const cityScore = jaroWinkler(esRecord.city, lrRecord.city);
  const stateMatch = esRecord.state === lrRecord.state;
  const zipMatch = esRecord.zip === lrRecord.zip;

  const addressScore =
    streetScore * 0.50 +
    cityScore * 0.25 +
    (stateMatch ? 1 : 0) * 0.15 +
    (zipMatch ? 1 : 0) * 0.10;

  const nameScore = jaroWinkler(esRecord.fullName, lrRecord.fullName);

  // Email score: 1.0 if both have non-empty email and they match exactly, else 0
  const esEmail = esRecord.email ?? '';
  const lrEmail = lrRecord.email ?? '';
  const emailScore = (esEmail && lrEmail && esEmail === lrEmail) ? 1.0 : 0;

  // Company score: Jaro-Winkler on company names (informational only)
  const companyScore = jaroWinkler(esRecord.company ?? '', lrRecord.company ?? '');

  return {
    addressScore,
    nameScore,
    emailScore,
    companyScore,
    streetScore,
    cityScore,
    stateMatch,
    zipMatch,
  };
}

/**
 * Run matching: for each LR record, score against ALL ES records,
 * keep top 3 ranked by addressScore descending.
 */
export function runMatching(
  esRecords: NormalizedRecord[],
  lrRecords: NormalizedRecord[],
): LRCustomerResult[] {
  const results: LRCustomerResult[] = [];

  for (const lrRecord of lrRecords) {
    const allMatches: MatchResult[] = [];

    for (const esRecord of esRecords) {
      const scores = scoreRecord(esRecord, lrRecord);
      allMatches.push({ esRecord, scores });
    }

    // Sort by addressScore descending
    allMatches.sort((a, b) => b.scores.addressScore - a.scores.addressScore);

    // Keep top 3
    const topMatches = allMatches.slice(0, 3);

    results.push({ lrRecord, topMatches });
  }

  return results;
}
