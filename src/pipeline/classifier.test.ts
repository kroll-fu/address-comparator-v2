import { describe, it, expect } from 'vitest';
import { classifyMatch, classifyAllResults, DEFAULT_THRESHOLDS } from './classifier';
import { MatchType } from '../types/matching';
import type { MatchScores, LRCustomerResult, NormalizedRecord, MatchResult } from '../types/matching';

function makeScores(overrides: Partial<MatchScores>): MatchScores {
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

function makeRecord(): NormalizedRecord {
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
  };
}

function makeResult(scores: MatchScores): LRCustomerResult {
  return {
    lrRecord: makeRecord(),
    topMatches: [{ esRecord: makeRecord(), scores }],
  };
}

describe('classifyMatch', () => {
  it('classifies Full Match when both scores above thresholds', () => {
    const scores = makeScores({ addressScore: 0.90, nameScore: 0.85 });
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.FullMatch);
  });

  it('classifies Household Match when address above but name below (spouse scenario)', () => {
    const scores = makeScores({ addressScore: 0.90, nameScore: 0.50 });
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.HouseholdMatch);
  });

  it('classifies No Match when address below threshold', () => {
    const scores = makeScores({ addressScore: 0.50, nameScore: 0.90 });
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.NoMatch);
  });

  it('classifies Full Match at exact boundary', () => {
    const scores = makeScores({ addressScore: 0.85, nameScore: 0.82 });
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.FullMatch);
  });

  it('classifies No Match just below address threshold', () => {
    const scores = makeScores({ addressScore: 0.84, nameScore: 0.82 });
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.NoMatch);
  });

  it('re-classifies with different thresholds without re-running engine', () => {
    const scores = makeScores({ addressScore: 0.70, nameScore: 0.70 });

    // With default thresholds: No Match (address 0.70 < 0.85)
    expect(classifyMatch(scores, DEFAULT_THRESHOLDS)).toBe(MatchType.NoMatch);

    // With lower thresholds: Full Match
    const lowerThresholds = { addressThreshold: 0.60, nameThreshold: 0.60, emailThreshold: 1.0 };
    expect(classifyMatch(scores, lowerThresholds)).toBe(MatchType.FullMatch);

    // With low address but high name threshold: Household Match
    const mixedThresholds = { addressThreshold: 0.60, nameThreshold: 0.80, emailThreshold: 1.0 };
    expect(classifyMatch(scores, mixedThresholds)).toBe(MatchType.HouseholdMatch);
  });
});

describe('classifyAllResults', () => {
  it('classifies a mix of result types', () => {
    const fullMatch = makeResult(makeScores({ addressScore: 0.90, nameScore: 0.85 }));
    const household = makeResult(makeScores({ addressScore: 0.90, nameScore: 0.50 }));
    const noMatch = makeResult(makeScores({ addressScore: 0.50, nameScore: 0.90 }));

    const results = [fullMatch, household, noMatch];
    const classified = classifyAllResults(results, DEFAULT_THRESHOLDS);

    expect(classified.get(fullMatch)).toBe(MatchType.FullMatch);
    expect(classified.get(household)).toBe(MatchType.HouseholdMatch);
    expect(classified.get(noMatch)).toBe(MatchType.NoMatch);
  });

  it('classifies empty topMatches as NoMatch', () => {
    const emptyResult: LRCustomerResult = {
      lrRecord: makeRecord(),
      topMatches: [],
    };

    const classified = classifyAllResults([emptyResult], DEFAULT_THRESHOLDS);
    expect(classified.get(emptyResult)).toBe(MatchType.NoMatch);
  });
});
