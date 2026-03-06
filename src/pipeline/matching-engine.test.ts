import { describe, it, expect } from 'vitest';
import { scoreRecord, runMatching } from './matching-engine';
import type { NormalizedRecord } from '../types/matching';

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

  it('completes 2000 ES x 200 LR matching in under 5 seconds', () => {
    const esRecords: NormalizedRecord[] = Array.from({ length: 2000 }, (_, i) =>
      makeRecord({
        sourceRow: i,
        firstName: `first${i}`,
        lastName: `last${i}`,
        fullName: `first${i} last${i}`,
        street: `${i} main street apt ${i % 10}`,
        city: `city${i % 50}`,
        state: i % 2 === 0 ? 'CT' : 'NY',
        zip: String(10000 + i).padStart(5, '0'),
      })
    );

    const lrRecords: NormalizedRecord[] = Array.from({ length: 200 }, (_, i) =>
      makeRecord({
        sourceRow: i,
        firstName: `first${i * 10}`,
        lastName: `last${i * 10}`,
        fullName: `first${i * 10} last${i * 10}`,
        street: `${i * 10} main street apt ${(i * 10) % 10}`,
        city: `city${(i * 10) % 50}`,
        state: (i * 10) % 2 === 0 ? 'CT' : 'NY',
        zip: String(10000 + i * 10).padStart(5, '0'),
      })
    );

    const start = performance.now();
    const results = runMatching(esRecords, lrRecords);
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(200);
    expect(results[0].topMatches).toHaveLength(3);
    expect(elapsed).toBeLessThan(5000);

    // Log for visibility
    console.log(`2000x200 matching completed in ${elapsed.toFixed(0)}ms`);
  });
});
