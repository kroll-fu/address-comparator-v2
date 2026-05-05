import type { NormalizedRecord, MatchScores, LRCustomerResult, MatchResult } from '../types/matching';
import { jaroWinkler } from './jaro-winkler';

/**
 * Score a single ES record against a single LR record.
 * Returns independent address, name, email, and installer scores.
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

  // Installer score: Jaro-Winkler on installer / licensed-organization names.
  // Returns 0 when either side is empty (avoids the JW('','') === 1 false-perfect-match).
  const installerScore =
    (esRecord.installer && lrRecord.installer)
      ? jaroWinkler(esRecord.installer.toLowerCase(), lrRecord.installer.toLowerCase())
      : 0;

  return {
    addressScore,
    nameScore,
    emailScore,
    installerScore,
    streetScore,
    cityScore,
    stateMatch,
    zipMatch,
  };
}

/**
 * Sorted-array collector for the top 3 matches by addressScore (desc).
 * Faster than push + sort + slice for size 3: O(1) per insert vs O(n log n) overall.
 */
class Top3 {
  private items: MatchResult[] = [];

  /** Returns the lowest addressScore in the collector, or -Infinity if not yet full to 3. */
  minScore(): number {
    return this.items.length === 3
      ? this.items[2].scores.addressScore
      : -Infinity;
  }

  /** Inserts result if it belongs in the top 3; otherwise drops it. */
  tryInsert(result: MatchResult): void {
    const score = result.scores.addressScore;
    if (this.items.length < 3) {
      this.insertSorted(result);
    } else if (score > this.items[2].scores.addressScore) {
      this.items.pop();
      this.insertSorted(result);
    }
  }

  /** Returns a fresh array (caller-owned), preserving sort order. */
  toArray(): MatchResult[] {
    return [...this.items];
  }

  private insertSorted(result: MatchResult): void {
    const score = result.scores.addressScore;
    let i = 0;
    while (i < this.items.length && this.items[i].scores.addressScore >= score) i++;
    this.items.splice(i, 0, result);
  }
}

/**
 * Scoring helper for the ranking loop. Computes address components in cost
 * order and short-circuits via floor checks — returns null when the pair
 * cannot displace the current top-3 minimum.
 *
 * Bit-identical to scoreRecord for any pair that is not pruned (i.e., for
 * every pair that ends up displayed in the top 3).
 */
function scoreForRanking(
  esRecord: NormalizedRecord,
  lrRecord: NormalizedRecord,
  floor: number,
): MatchScores | null {
  const stateMatch = esRecord.state === lrRecord.state;
  const zipMatch = esRecord.zip === lrRecord.zip;
  const stateWeight = stateMatch ? 0.15 : 0;
  const zipWeight = zipMatch ? 0.10 : 0;

  const streetScore = jaroWinkler(esRecord.street, lrRecord.street);

  // Floor check A: assume cityScore = 1.0 (max possible)
  const upperBoundA = streetScore * 0.50 + 1.0 * 0.25 + stateWeight + zipWeight;
  if (upperBoundA < floor) return null;

  const cityScore = jaroWinkler(esRecord.city, lrRecord.city);

  const addressScore = streetScore * 0.50 + cityScore * 0.25 + stateWeight + zipWeight;

  // Floor check B: exact addressScore
  if (addressScore < floor) return null;

  const nameScore = jaroWinkler(esRecord.fullName, lrRecord.fullName);

  const esEmail = esRecord.email ?? '';
  const lrEmail = lrRecord.email ?? '';
  const emailScore = (esEmail && lrEmail && esEmail === lrEmail) ? 1.0 : 0;

  const installerScore =
    (esRecord.installer && lrRecord.installer)
      ? jaroWinkler(esRecord.installer.toLowerCase(), lrRecord.installer.toLowerCase())
      : 0;

  return {
    addressScore,
    nameScore,
    emailScore,
    installerScore,
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
    const top3 = new Top3();
    for (const esRecord of esRecords) {
      const scores = scoreForRanking(esRecord, lrRecord, top3.minScore());
      if (scores !== null) {
        top3.tryInsert({ esRecord, scores });
      }
    }
    results.push({ lrRecord, topMatches: top3.toArray() });
  }

  return results;
}
