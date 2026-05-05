import { describe, it, expect } from 'vitest';
import { scoreRecord, runMatching } from './matching-engine';
import type { NormalizedRecord, LRCustomerResult, MatchResult } from '../types/matching';

function makeRecord(overrides: Partial<NormalizedRecord>): NormalizedRecord {
  return {
    sourceRow: 0,
    firstName: 'john',
    lastName: 'smith',
    fullName: 'john smith',
    street: '123 main street',
    city: 'westport',
    state: 'CT',
    zip: '06880',
    rawName: 'John Smith',
    rawAddress: '123 Main Street, Westport, CT 06880',
    installer: '',
    ...overrides,
  };
}

describe('scoreRecord', () => {
  it('returns near-perfect scores for identical records', () => {
    const es = makeRecord({});
    const lr = makeRecord({});

    const scores = scoreRecord(es, lr);

    expect(scores.addressScore).toBeCloseTo(1.0, 2);
    expect(scores.nameScore).toBeCloseTo(1.0, 2);
    expect(scores.emailScore).toBe(0); // No emails on these records
    expect(scores.stateMatch).toBe(true);
    expect(scores.zipMatch).toBe(true);
  });

  it('returns high address score but low name score for same address, different name', () => {
    const es = makeRecord({ firstName: 'sarah', lastName: 'jones', fullName: 'sarah jones' });
    const lr = makeRecord({ firstName: 'john', lastName: 'smith', fullName: 'john smith' });

    const scores = scoreRecord(es, lr);

    expect(scores.addressScore).toBeCloseTo(1.0, 2);
    expect(scores.nameScore).toBeLessThan(0.5);
    expect(scores.emailScore).toBe(0);
  });

  it('returns low address score but high name score for different address, same name', () => {
    const es = makeRecord({ street: '999 oak avenue', city: 'hartford', zip: '06103' });
    const lr = makeRecord({ street: '123 main street', city: 'westport', zip: '06880' });

    const scores = scoreRecord(es, lr);

    expect(scores.addressScore).toBeLessThan(0.7);
    expect(scores.nameScore).toBeCloseTo(1.0, 2);
  });

  it('verifies weight breakdown: street 50%, city 25%, state 15%, zip 10%', () => {
    // All same except street
    const es1 = makeRecord({ street: 'completely different road' });
    const lr = makeRecord({});
    const scores1 = scoreRecord(es1, lr);

    // All same except city
    const es2 = makeRecord({ city: 'completely different city' });
    const scores2 = scoreRecord(es2, lr);

    // Street has more weight (50%) than city (25%)
    // So changing street should reduce score more than changing city
    expect(1.0 - scores1.addressScore).toBeGreaterThan(1.0 - scores2.addressScore);

    // Perfect score should be 1.0
    const esPerfect = makeRecord({});
    const scoresPerfect = scoreRecord(esPerfect, lr);
    expect(scoresPerfect.addressScore).toBeCloseTo(1.0, 2);

    // Only state different: should lose ~0.15
    const esNoState = makeRecord({ state: 'NY' });
    const scoresNoState = scoreRecord(esNoState, lr);
    expect(scoresNoState.addressScore).toBeCloseTo(0.85, 1);

    // Only zip different: should lose ~0.10
    const esNoZip = makeRecord({ zip: '99999' });
    const scoresNoZip = scoreRecord(esNoZip, lr);
    expect(scoresNoZip.addressScore).toBeCloseTo(0.90, 1);
  });
});

describe('runMatching', () => {
  it('returns top 3 matches per LR customer sorted by addressScore', () => {
    const lr = [makeRecord({ sourceRow: 0 })];
    const es = [
      makeRecord({ sourceRow: 0, street: '123 main street' }),       // best match
      makeRecord({ sourceRow: 1, street: '125 main street' }),       // close
      makeRecord({ sourceRow: 2, street: '200 oak avenue' }),        // moderate
      makeRecord({ sourceRow: 3, street: '999 pine road' }),         // worst
      makeRecord({ sourceRow: 4, street: '500 elm boulevard' }),     // bad
    ];

    const results = runMatching(es, lr);

    expect(results).toHaveLength(1);
    expect(results[0].topMatches).toHaveLength(3);

    // Verify sorted descending by addressScore
    const scores = results[0].topMatches.map(m => m.scores.addressScore);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]);
  });

  it('stores only top 3 even with more ES records', () => {
    const lr = [makeRecord({ sourceRow: 0 })];
    const es = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ sourceRow: i, street: `${i * 100} some street` })
    );

    const results = runMatching(es, lr);
    expect(results[0].topMatches).toHaveLength(3);
  });

  it('handles multiple LR records independently', () => {
    const lr = [
      makeRecord({ sourceRow: 0, street: '100 first street' }),
      makeRecord({ sourceRow: 1, street: '200 second avenue' }),
    ];
    const es = [
      makeRecord({ sourceRow: 0, street: '100 first street' }),
      makeRecord({ sourceRow: 1, street: '200 second avenue' }),
    ];

    const results = runMatching(es, lr);

    expect(results).toHaveLength(2);
    // First LR should match first ES best
    expect(results[0].topMatches[0].esRecord.street).toBe('100 first street');
    // Second LR should match second ES best
    expect(results[1].topMatches[0].esRecord.street).toBe('200 second avenue');
  });

  it('returns 1.0 installerScore when ES and LR installers match exactly (case-insensitive)', () => {
    const es = makeRecord({ installer: 'SunRun Solar' });
    const lr = makeRecord({ installer: 'sunrun solar' });
    const scores = scoreRecord(es, lr);
    expect(scores.installerScore).toBeCloseTo(1.0, 2);
  });

  it('returns a Jaro-Winkler score between 0 and 1 for similar but non-identical installers', () => {
    const es = makeRecord({ installer: 'SunRun Solar' });
    const lr = makeRecord({ installer: 'SunRun Solar Inc' });
    const scores = scoreRecord(es, lr);
    expect(scores.installerScore).toBeGreaterThan(0.8);
    expect(scores.installerScore).toBeLessThan(1.0);
  });

  it('returns 0 installerScore when either side is empty', () => {
    const esEmpty = makeRecord({ installer: '' });
    const lrFull = makeRecord({ installer: 'SunRun Solar' });
    expect(scoreRecord(esEmpty, lrFull).installerScore).toBe(0);
    expect(scoreRecord(lrFull, esEmpty).installerScore).toBe(0);
    expect(scoreRecord(esEmpty, esEmpty).installerScore).toBe(0);
  });

  it('completes 12600 ES x 12600 LR matching in under 30 seconds', () => {
    const states = ['CT', 'NY', 'NJ', 'MA', 'CA', 'TX', 'FL', 'IL', 'PA', 'OH'];

    const esRecords: NormalizedRecord[] = Array.from({ length: 12600 }, (_, i) =>
      makeRecord({
        sourceRow: i,
        firstName: `first${i % 500}`,
        lastName: `last${i % 500}`,
        fullName: `first${i % 500} last${i % 500}`,
        street: `${i} main street apt ${i % 10}`,
        city: `city${i % 200}`,
        state: states[i % states.length],
        zip: String(10000 + (i % 1000)).padStart(5, '0'),
      })
    );

    const lrRecords: NormalizedRecord[] = Array.from({ length: 12600 }, (_, i) =>
      makeRecord({
        sourceRow: i,
        firstName: `first${(i * 3) % 500}`,
        lastName: `last${(i * 3) % 500}`,
        fullName: `first${(i * 3) % 500} last${(i * 3) % 500}`,
        street: `${(i * 3) % 12600} main street apt ${(i * 3) % 10}`,
        city: `city${(i * 3) % 200}`,
        state: states[(i * 3) % states.length],
        zip: String(10000 + ((i * 3) % 1000)).padStart(5, '0'),
      })
    );

    const start = performance.now();
    const results = runMatching(esRecords, lrRecords);
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(12600);
    expect(elapsed).toBeLessThan(30000);

    console.log(`12600x12600 matching completed in ${elapsed.toFixed(0)}ms`);
  }, 60000); // 60s test timeout to comfortably exceed the 30s assertion

  it('handles LR record with empty state by scanning all ES records', () => {
    const es = [
      makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' }),
      makeRecord({ sourceRow: 1, state: 'NY', street: '123 main street' }),
      makeRecord({ sourceRow: 2, state: 'NJ', street: '999 oak avenue' }),
    ];
    const lr = [makeRecord({ sourceRow: 0, state: '', street: '123 main street' })];
    const results = runMatching(es, lr);
    expect(results).toHaveLength(1);
    expect(results[0].topMatches).toHaveLength(3);
    // Top 2 should be the perfect-street matches (rank order can be either CT or NY first)
    expect(results[0].topMatches[0].scores.streetScore).toBeCloseTo(1.0, 2);
    expect(results[0].topMatches[1].scores.streetScore).toBeCloseTo(1.0, 2);
  });

  it('returns top-3 from cross-state fallback when LR state has zero ES records', () => {
    const es = [
      makeRecord({ sourceRow: 0, state: 'NY', street: '123 main street' }),
      makeRecord({ sourceRow: 1, state: 'NJ', street: '125 main street' }),
      makeRecord({ sourceRow: 2, state: 'MA', street: '127 main street' }),
    ];
    const lr = [makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' })];
    const results = runMatching(es, lr);
    expect(results[0].topMatches).toHaveLength(3);
    expect(results[0].topMatches[0].esRecord.state).toBe('NY'); // perfect street match
  });

  it('combines in-state and cross-state matches when in-state bucket is undersized', () => {
    const es = [
      makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' }),       // in-state perfect
      makeRecord({ sourceRow: 1, state: 'NY', street: '123 main street' }),       // cross-state perfect
      makeRecord({ sourceRow: 2, state: 'NJ', street: '125 main street' }),       // cross-state close
    ];
    const lr = [makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' })];
    const results = runMatching(es, lr);
    expect(results[0].topMatches).toHaveLength(3);
    // In-state CT wins (state=match adds 0.15)
    expect(results[0].topMatches[0].esRecord.state).toBe('CT');
    expect(results[0].topMatches[0].scores.stateMatch).toBe(true);
  });

  it('returns shorter top-3 when fewer than 3 ES records exist', () => {
    const es = [
      makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' }),
      makeRecord({ sourceRow: 1, state: 'CT', street: '125 main street' }),
    ];
    const lr = [makeRecord({ sourceRow: 0, state: 'CT', street: '123 main street' })];
    const results = runMatching(es, lr);
    expect(results[0].topMatches).toHaveLength(2);
  });

  it('returns empty top-3 when ES is empty', () => {
    const es: NormalizedRecord[] = [];
    const lr = [makeRecord({ sourceRow: 0, state: 'CT' })];
    const results = runMatching(es, lr);
    expect(results[0].topMatches).toHaveLength(0);
  });
});

// Inline byte-for-byte copy of the matching algorithm AS OF this commit.
// Frozen — never edit. Subsequent refactors of runMatching must keep
// the equivalence test green against this baseline.
function runMatchingNaive(
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
    allMatches.sort((a, b) => b.scores.addressScore - a.scores.addressScore);
    results.push({ lrRecord, topMatches: allMatches.slice(0, 3) });
  }
  return results;
}

function makeSyntheticDataset(): { es: NormalizedRecord[]; lr: NormalizedRecord[] } {
  const states = ['CT', 'NY', 'NJ', 'MA', 'CA'];
  const es: NormalizedRecord[] = [];
  const lr: NormalizedRecord[] = [];

  // 200 LR records, 500 ES records, mixed shapes
  for (let i = 0; i < 500; i++) {
    es.push({
      sourceRow: i,
      firstName: `first${i % 50}`,
      lastName: `last${i % 50}`,
      fullName: `first${i % 50} last${i % 50}`,
      street: `${i} main street apt ${i % 10}`,
      city: `city${i % 8}`,
      state: states[i % states.length],
      zip: String(10000 + (i % 100)).padStart(5, '0'),
      rawName: `First${i % 50} Last${i % 50}`,
      rawAddress: `${i} Main Street`,
      installer: i % 3 === 0 ? 'sunrun solar' : '',
      ...(i % 5 === 0 && { email: `user${i}@example.com` }),
    });
  }

  for (let i = 0; i < 200; i++) {
    // Mix:
    //   i % 7 === 0 → empty state (forces fallback)
    //   i % 11 === 0 → garbage state "XX" (forces fallback)
    //   i % 13 === 0 → cross-state-only would be a strong match (boundary)
    //   otherwise   → normal in-state distribution
    let state: string;
    if (i % 7 === 0) state = '';
    else if (i % 11 === 0) state = 'XX';
    else state = states[i % states.length];

    lr.push({
      sourceRow: i,
      firstName: `first${i % 50}`,
      lastName: `last${i % 50}`,
      fullName: `first${i % 50} last${i % 50}`,
      street: `${i} main street apt ${i % 10}`,
      city: `city${i % 8}`,
      state,
      zip: String(10000 + (i % 100)).padStart(5, '0'),
      rawName: `First${i % 50} Last${i % 50}`,
      rawAddress: `${i} Main Street`,
      installer: i % 4 === 0 ? 'sunrun solar inc' : '',
      ...(i % 5 === 0 && { email: `user${i}@example.com` }),
    });
  }

  return { es, lr };
}

describe('runMatching equivalence', () => {
  it('produces output equivalent to the naive baseline on the synthetic dataset (no exact-score ties)', () => {
    const { es, lr } = makeSyntheticDataset();
    const optimized = runMatching(es, lr);
    const naive = runMatchingNaive(es, lr);
    expect(optimized).toEqual(naive);
  });

  it('produces output equivalent on the boundary-case dataset (single cross-state pair at 0.85)', () => {
    // Identical street/city/zip but different state — addressScore = 0.85 exactly.
    // With one ES record only, in-state phase finds nothing, fallback is forced.
    const es: NormalizedRecord[] = [
      { sourceRow: 0, firstName: 'a', lastName: 'b', fullName: 'a b', street: '1 main st', city: 'westport',
        state: 'CT', zip: '06880', rawName: 'A B', rawAddress: '1 Main St', installer: '' },
    ];
    const lr: NormalizedRecord[] = [
      { sourceRow: 0, firstName: 'a', lastName: 'b', fullName: 'a b', street: '1 main st', city: 'westport',
        state: 'NY', zip: '06880', rawName: 'A B', rawAddress: '1 Main St', installer: '' },
    ];
    expect(runMatching(es, lr)).toEqual(runMatchingNaive(es, lr));
  });

  // Documented intentional divergence: when multiple records tie at exactly the same
  // addressScore AND the ties span the in-state/cross-state phase boundary, the
  // optimized algorithm preserves bucket-traversal order rather than the naive's
  // input-stable order. Practical impact: requires duplicate exact-tied addresses
  // across states; scores and classification are unaffected; only the displayed
  // top-3 ordering for the tied entries differs.
  it('documents tie-handling divergence: in-state ties at 0.85 fill heap and skip the cross-state tie', () => {
    const lr: NormalizedRecord[] = [
      { sourceRow: 0, firstName: 'a', lastName: 'b', fullName: 'a b', street: '12345678', city: 'foo',
        state: 'CT', zip: '11111', rawName: 'A', rawAddress: '', installer: '' },
    ];
    const es: NormalizedRecord[] = [
      // NY perfect-street/city, zip match, state mismatch -> 0.5 + 0.25 + 0 + 0.10 = 0.85
      { sourceRow: 0, firstName: 'a', lastName: 'b', fullName: 'a b', street: '12345678', city: 'foo',
        state: 'NY', zip: '11111', rawName: 'A', rawAddress: '', installer: '' },
      // CT partial-street, perfect city, state match, zip mismatch -> 0.5*JW + 0.25 + 0.15 + 0
      { sourceRow: 1, firstName: 'a', lastName: 'b', fullName: 'a b', street: '123456ab', city: 'foo',
        state: 'CT', zip: '99999', rawName: 'A', rawAddress: '', installer: '' },
      { sourceRow: 2, firstName: 'a', lastName: 'b', fullName: 'a b', street: '123456ab', city: 'foo',
        state: 'CT', zip: '99999', rawName: 'A', rawAddress: '', installer: '' },
      { sourceRow: 3, firstName: 'a', lastName: 'b', fullName: 'a b', street: '123456ab', city: 'foo',
        state: 'CT', zip: '99999', rawName: 'A', rawAddress: '', installer: '' },
    ];

    const optimized = runMatching(es, lr);
    const naive = runMatchingNaive(es, lr);

    // Both produce three entries all scoring 0.85 — same scores, same count.
    expect(optimized[0].topMatches).toHaveLength(3);
    expect(naive[0].topMatches).toHaveLength(3);
    for (const m of optimized[0].topMatches) expect(m.scores.addressScore).toBeCloseTo(0.85, 4);
    for (const m of naive[0].topMatches) expect(m.scores.addressScore).toBeCloseTo(0.85, 4);

    // Naive picks NY first by stable input order; optimized fills the heap in-state and
    // skips the (no-longer-displaceable) cross-state tie. Documented & accepted.
    const optimizedRows = optimized[0].topMatches.map(m => m.esRecord.sourceRow);
    const naiveRows = naive[0].topMatches.map(m => m.esRecord.sourceRow);
    expect(optimizedRows).toEqual([1, 2, 3]);
    expect(naiveRows).toEqual([0, 1, 2]);
  });
});
