import { MatchType } from '../types/matching';
import type { MatchScores, MatchThresholds, LRCustomerResult } from '../types/matching';

/** Default thresholds for classification */
export const DEFAULT_THRESHOLDS: MatchThresholds = {
  addressThreshold: 0.85,
  nameThreshold: 0.82,
  emailThreshold: 1.0,
};

/**
 * Classify a match from scores and thresholds.
 * This is a PURE function: scores + thresholds -> MatchType.
 * No side effects, no stored state.
 * Enables instant re-classification when user adjusts thresholds.
 *
 * NoMatch:       addressScore < addressThreshold
 * FullMatch:     addressScore >= addressThreshold AND (nameScore >= nameThreshold OR emailScore >= emailThreshold)
 * HouseholdMatch: everything else above address threshold
 */
export function classifyMatch(scores: MatchScores, thresholds: MatchThresholds): MatchType {
  if (scores.addressScore < thresholds.addressThreshold) {
    return MatchType.NoMatch;
  }
  if (scores.nameScore >= thresholds.nameThreshold || scores.emailScore >= thresholds.emailThreshold) {
    return MatchType.FullMatch;
  }
  return MatchType.HouseholdMatch;
}

/**
 * Classify all results by their top match (topMatches[0]).
 * Returns a Map of result -> MatchType.
 */
export function classifyAllResults(
  results: LRCustomerResult[],
  thresholds: MatchThresholds,
): Map<LRCustomerResult, MatchType> {
  const map = new Map<LRCustomerResult, MatchType>();

  for (const result of results) {
    if (result.topMatches.length === 0) {
      map.set(result, MatchType.NoMatch);
    } else {
      map.set(result, classifyMatch(result.topMatches[0].scores, thresholds));
    }
  }

  return map;
}
