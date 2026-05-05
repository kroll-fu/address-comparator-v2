# Matching Pipeline Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut matching runtime on 12.6k × 12.6k inputs from ~6 minutes to under 30 seconds with bit-identical results.

**Architecture:** Refactor `runMatching` in three composable internal layers (Top3 collector → scoreForRanking helper → state-bucket scan with cross-state fallback) plus an independent JW workspace-reuse micro-opt. Each layer is a behavior-preserving refactor verified by an inline `runMatchingNaive` baseline equivalence test.

**Tech Stack:** TypeScript strict, Vitest. No new dependencies, no public API breakage, no schema changes.

**Spec:** `docs/superpowers/specs/2026-05-05-matching-performance-design.md`

---

## File Map

Files modified (no new files):

- `src/pipeline/matching-engine.ts` — adds three internal helpers (`Top3` class, `scoreForRanking`, `bucketByState`); `runMatching` is rewritten to use them; gains optional `options` parameter. Public `scoreRecord` unchanged.
- `src/pipeline/matching-engine.test.ts` — adds inline `runMatchingNaive` baseline + a synthetic-data generator + the equivalence test, edge-case suite, and replaces the 2000×200 bench with 12.6k×12.6k.
- `src/pipeline/jaro-winkler.ts` — module-scoped reusable `Uint8Array` workspace; same external signature.
- `src/pipeline/matching-worker.ts` — collapses to a thin shim around `runMatching` with an `onProgress` callback.

No other files touched.

---

## Task Sequencing Rule

The equivalence test landing in Task 1 is the safety net. Tasks 3, 4, 5, 6, and 7 are all behavior-preserving refactors of `runMatching`'s internals — each one keeps the equivalence test green. The first task to land any algorithmic change (Task 5) must keep the equivalence test green; if it fails, blocking has leaked a result divergence and the change must be fixed before commit.

---

### Task 1: Equivalence test scaffolding

**Files:**
- Modify: `src/pipeline/matching-engine.test.ts` (add helpers + new test, no existing test changes)

This task establishes the regression net. After it lands, `runMatchingNaive` is a frozen copy of today's algorithm; subsequent tasks refactor `runMatching` while this test guarantees bit-identical output.

- [ ] **Step 1: Extend the existing import to include `LRCustomerResult`**

In `src/pipeline/matching-engine.test.ts`, the existing import on line 3 reads:

```ts
import type { NormalizedRecord } from '../types/matching';
```

Replace it with:

```ts
import type { NormalizedRecord, LRCustomerResult, MatchResult } from '../types/matching';
```

- [ ] **Step 2: Add the inline naive baseline + synthetic-data generator + equivalence test**

In `src/pipeline/matching-engine.test.ts`, append (after the existing `describe('runMatching', ...)` block, before the file ends):

```ts
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
  it('produces bit-identical output to the naive baseline on the synthetic dataset', () => {
    const { es, lr } = makeSyntheticDataset();
    const optimized = runMatching(es, lr);
    const naive = runMatchingNaive(es, lr);
    expect(optimized).toEqual(naive);
  });

  it('produces bit-identical output on the boundary-case dataset (cross-state pairs at exactly 0.85)', () => {
    // Identical street/city/zip but different state — addressScore = 0.85 exactly
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
});
```

- [ ] **Step 3: Run the new tests to verify they pass**

Run: `npx vitest run src/pipeline/matching-engine.test.ts`
Expected: PASS — all existing tests + 2 new ones (the equivalence test passes trivially because `runMatching` and `runMatchingNaive` are currently the same algorithm).

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/matching-engine.test.ts
git commit -m "Add runMatching equivalence test against frozen naive baseline"
```

---

### Task 2: State-edge-case test suite

**Files:**
- Modify: `src/pipeline/matching-engine.test.ts`

These tests enumerate the state-bucket boundary scenarios. They must pass against the current implementation AND the post-Task-5 implementation. The point is to catch divergence in tricky shapes that the synthetic generator might miss.

- [ ] **Step 1: Add edge-case tests**

The test file already has a module-scope `makeRecord(overrides: Partial<NormalizedRecord>)` helper (around lines 5–20). Use it directly — do not redefine it.

Append the following tests inside the existing `describe('runMatching', ...)` block (after the existing perf test, before the closing `});` of the describe):

```ts
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
```

- [ ] **Step 2: Run the new tests to verify they pass**

Run: `npx vitest run src/pipeline/matching-engine.test.ts`
Expected: PASS — all new edge cases green on the current implementation.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/matching-engine.test.ts
git commit -m "Add state-bucket edge case tests for runMatching"
```

---

### Task 3: Top3 collector — replaces sort + slice

**Files:**
- Modify: `src/pipeline/matching-engine.ts`

Replace the `allMatches.push → sort → slice(0,3)` pattern with a sorted-array Top3 collector. Behavior-preserving: all existing tests + the equivalence test must pass.

- [ ] **Step 1: Add the Top3 helper class**

In `src/pipeline/matching-engine.ts`, add the new helper after the `scoreRecord` function (around line 41) and before `runMatching`:

```ts
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
```

- [ ] **Step 2: Refactor `runMatching` to use Top3**

In `src/pipeline/matching-engine.ts`, replace the body of `runMatching` (currently lines 47–71 — the function declaration and its `for` loops) with:

```ts
export function runMatching(
  esRecords: NormalizedRecord[],
  lrRecords: NormalizedRecord[],
): LRCustomerResult[] {
  const results: LRCustomerResult[] = [];

  for (const lrRecord of lrRecords) {
    const top3 = new Top3();
    for (const esRecord of esRecords) {
      const scores = scoreRecord(esRecord, lrRecord);
      top3.tryInsert({ esRecord, scores });
    }
    results.push({ lrRecord, topMatches: top3.toArray() });
  }

  return results;
}
```

Keep the docstring above the function unchanged.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests + Task 1 + Task 2 tests stay green. The equivalence test specifically guarantees `runMatching` still produces identical output.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/matching-engine.ts
git commit -m "Replace sort+slice with Top3 sorted-array collector"
```

---

### Task 4: scoreForRanking with address-component pruning

**Files:**
- Modify: `src/pipeline/matching-engine.ts`

Add the new internal helper that scores in cost order with two floor checks. Call it from `runMatching` instead of `scoreRecord`. Public `scoreRecord` is unchanged (still returns the full score record with all components computed).

- [ ] **Step 1: Add `scoreForRanking` helper**

In `src/pipeline/matching-engine.ts`, add after the `Top3` class (still before `runMatching`):

```ts
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
```

- [ ] **Step 2: Refactor `runMatching` to use `scoreForRanking`**

In `src/pipeline/matching-engine.ts`, replace the body of `runMatching` with:

```ts
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
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS. The equivalence test specifically guards against pruning bugs — if `scoreForRanking` ever drops a record that would have made the top 3, this test fails.

If equivalence test fails: there's a floor-check bug. Verify upper-bound math: floor check A uses `cityScore = 1.0` as the upper bound, which is the maximum possible — any record dropped here genuinely cannot displace the heap min.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/matching-engine.ts
git commit -m "Add scoreForRanking with address-component pruning"
```

---

### Task 5: State-bucket scan with cross-state fallback

**Files:**
- Modify: `src/pipeline/matching-engine.ts`

The main algorithmic change. Bucket ES records by state, scan in-state first, fall back to cross-state when needed. Bit-identical to the previous version because the fallback is invoked exactly when a cross-state pair could displace a heap entry.

- [ ] **Step 1: Add `bucketByState` helper**

In `src/pipeline/matching-engine.ts`, add after `scoreForRanking`, before `runMatching`:

```ts
/**
 * Group ES records by NormalizedRecord.state. Empty-state records live
 * in the "" bucket. The normalizer guarantees state is either a 2-letter
 * uppercase abbreviation or "" (see normalizer.ts).
 */
function bucketByState(records: NormalizedRecord[]): Map<string, NormalizedRecord[]> {
  const map = new Map<string, NormalizedRecord[]>();
  for (const record of records) {
    const bucket = map.get(record.state);
    if (bucket) {
      bucket.push(record);
    } else {
      map.set(record.state, [record]);
    }
  }
  return map;
}
```

- [ ] **Step 2: Refactor `runMatching` to use state-bucket scan with fallback**

In `src/pipeline/matching-engine.ts`, replace `runMatching`'s body:

```ts
export function runMatching(
  esRecords: NormalizedRecord[],
  lrRecords: NormalizedRecord[],
): LRCustomerResult[] {
  // Maximum cross-state addressScore: street*0.5 + city*0.25 + 0*0.15 + zip*0.10 = 0.85.
  // If top3.minScore() >= 0.85 with 3 entries, no cross-state pair can displace any of them.
  const CROSS_STATE_MAX = 0.85;

  const buckets = bucketByState(esRecords);
  const results: LRCustomerResult[] = [];

  for (const lrRecord of lrRecords) {
    const top3 = new Top3();

    // Phase 1: in-state scan
    const inState = buckets.get(lrRecord.state) ?? [];
    for (const esRecord of inState) {
      const scores = scoreForRanking(esRecord, lrRecord, top3.minScore());
      if (scores !== null) {
        top3.tryInsert({ esRecord, scores });
      }
    }

    // Phase 2: cross-state fallback — only when an out-of-state pair could plausibly displace a heap entry
    if (top3.toArray().length < 3 || top3.minScore() < CROSS_STATE_MAX) {
      for (const esRecord of esRecords) {
        if (esRecord.state === lrRecord.state) continue; // already scanned in Phase 1
        const scores = scoreForRanking(esRecord, lrRecord, top3.minScore());
        if (scores !== null) {
          top3.tryInsert({ esRecord, scores });
        }
      }
    }

    results.push({ lrRecord, topMatches: top3.toArray() });
  }

  return results;
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS. The equivalence test (Task 1) is the critical guard here — any divergence between bucketed and naive output fails the test. The boundary-case test (cross-state pair at exactly 0.85) is the most stringent.

If the equivalence test fails: check the fallback condition. The maximum cross-state addressScore is 0.85; if `top3.minScore() === 0.85` and we skipped the fallback, a record at 0.86 (impossible cross-state) couldn't have changed the result. If the test fails on a 0.85 case, ordering may differ — investigate the `>=` vs `<` boundary in `Top3.tryInsert`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/matching-engine.ts
git commit -m "Bucket ES by state with cross-state fallback at 0.85 threshold"
```

---

### Task 6: Reuse Jaro-Winkler workspace arrays

**Files:**
- Modify: `src/pipeline/jaro-winkler.ts`

Replace `Array(N).fill(false)` with module-scoped `Uint8Array` workspaces zeroed in-place. Independent micro-opt; no algorithmic change.

- [ ] **Step 1: Replace the workspace arrays**

In `src/pipeline/jaro-winkler.ts`, replace the entire `jaroSimilarity` function with:

```ts
const JW_MAX_LEN = 256;
const s1WorkspaceFixed = new Uint8Array(JW_MAX_LEN);
const s2WorkspaceFixed = new Uint8Array(JW_MAX_LEN);

/**
 * Jaro similarity (the base for Jaro-Winkler).
 * Uses module-scoped Uint8Array workspaces to avoid per-call allocations.
 * For inputs longer than JW_MAX_LEN, allocates fresh — graceful degradation.
 */
function jaroSimilarity(s1: string, s2: string): number {
  const s1Len = s1.length;
  const s2Len = s2.length;

  // Match window
  const matchWindow = Math.max(0, Math.floor(Math.max(s1Len, s2Len) / 2) - 1);

  // Acquire workspaces — reuse fixed buffers when within size limit, else allocate
  const s1Matches = s1Len <= JW_MAX_LEN ? s1WorkspaceFixed : new Uint8Array(s1Len);
  const s2Matches = s2Len <= JW_MAX_LEN ? s2WorkspaceFixed : new Uint8Array(s2Len);
  s1Matches.fill(0, 0, s1Len);
  s2Matches.fill(0, 0, s2Len);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1Len; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2Len);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = 1;
      s2Matches[j] = 1;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1Len; i++) {
    if (!s1Matches[i]) continue;
    while (k < s2Len && !s2Matches[k]) k++;
    if (k >= s2Len) break;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1Len + matches / s2Len + (matches - transpositions / 2) / matches) / 3
  );
}
```

Notes for the engineer:

- `Uint8Array.fill(0, 0, len)` only zeroes the active prefix — not the whole buffer.
- The reused workspaces are not thread-safe across concurrent calls. Since matching runs in a single web worker, this is fine. **Do not call `jaroWinkler` recursively or from multiple workers sharing this module instance.**
- Truthiness checks (`!s1Matches[i]`, `s2Matches[j]`) work the same on `Uint8Array` (0/1) as on the previous boolean array.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS. All existing JW behavior is preserved; the equivalence test in matching-engine.test.ts is your end-to-end check.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/jaro-winkler.ts
git commit -m "Reuse module-scoped Uint8Array workspaces in jaroSimilarity"
```

---

### Task 7: `runMatching` options + worker shim collapse

**Files:**
- Modify: `src/pipeline/matching-engine.ts`
- Modify: `src/pipeline/matching-worker.ts`

Add an optional `options` parameter to `runMatching` so the worker no longer needs its own duplicate inner loop.

- [ ] **Step 1: Update `runMatching` signature with options**

In `src/pipeline/matching-engine.ts`, replace `runMatching`'s function signature and body:

```ts
export interface RunMatchingOptions {
  onProgress?: (completed: number, total: number) => void;
  /** How often (in LR records processed) to invoke onProgress. Default 50. */
  progressInterval?: number;
}

export function runMatching(
  esRecords: NormalizedRecord[],
  lrRecords: NormalizedRecord[],
  options?: RunMatchingOptions,
): LRCustomerResult[] {
  const CROSS_STATE_MAX = 0.85;
  const onProgress = options?.onProgress;
  const progressInterval = options?.progressInterval ?? 50;

  const buckets = bucketByState(esRecords);
  const results: LRCustomerResult[] = [];

  for (let i = 0; i < lrRecords.length; i++) {
    const lrRecord = lrRecords[i];
    const top3 = new Top3();

    // Phase 1: in-state scan
    const inState = buckets.get(lrRecord.state) ?? [];
    for (const esRecord of inState) {
      const scores = scoreForRanking(esRecord, lrRecord, top3.minScore());
      if (scores !== null) {
        top3.tryInsert({ esRecord, scores });
      }
    }

    // Phase 2: cross-state fallback
    if (top3.toArray().length < 3 || top3.minScore() < CROSS_STATE_MAX) {
      for (const esRecord of esRecords) {
        if (esRecord.state === lrRecord.state) continue;
        const scores = scoreForRanking(esRecord, lrRecord, top3.minScore());
        if (scores !== null) {
          top3.tryInsert({ esRecord, scores });
        }
      }
    }

    results.push({ lrRecord, topMatches: top3.toArray() });

    if (onProgress && ((i + 1) % progressInterval === 0 || i === lrRecords.length - 1)) {
      onProgress(i + 1, lrRecords.length);
    }
  }

  return results;
}
```

- [ ] **Step 2: Collapse the worker into a thin shim**

Replace the entire body of `src/pipeline/matching-worker.ts`:

```ts
/**
 * Web Worker for running the O(n×m) matching off the main thread.
 * Thin shim around runMatching; routes progress callbacks to the main
 * thread as 'progress' messages.
 */
import { runMatching } from './matching-engine';
import type { NormalizedRecord, LRCustomerResult } from '../types/matching';

export interface MatchWorkerRequest {
  esRecords: NormalizedRecord[];
  lrRecords: NormalizedRecord[];
}

export interface MatchWorkerProgress {
  type: 'progress';
  completed: number;
  total: number;
}

export interface MatchWorkerDone {
  type: 'done';
  results: LRCustomerResult[];
}

export interface MatchWorkerError {
  type: 'error';
  message: string;
}

export type MatchWorkerMessage = MatchWorkerProgress | MatchWorkerDone | MatchWorkerError;

self.onmessage = function (e: MessageEvent<MatchWorkerRequest>) {
  const { esRecords, lrRecords } = e.data;

  try {
    const results = runMatching(esRecords, lrRecords, {
      onProgress: (completed, total) => {
        const msg: MatchWorkerProgress = { type: 'progress', completed, total };
        self.postMessage(msg);
      },
    });
    const msg: MatchWorkerDone = { type: 'done', results };
    self.postMessage(msg);
  } catch (err) {
    const msg: MatchWorkerError = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown worker error',
    };
    self.postMessage(msg);
  }
};
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all 90+ tests stay green. (No tests directly exercise the worker, but the equivalence test exercises runMatching, which now contains the progress hook.)

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the dev build**

Run: `npm run build`
Expected: PASS — confirms the worker module still resolves and bundles.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/matching-engine.ts src/pipeline/matching-worker.ts
git commit -m "Collapse matching-worker into a thin runMatching shim with onProgress"
```

---

### Task 8: Replace 2000×200 perf bench with 12.6k×12.6k goal-state bench

**Files:**
- Modify: `src/pipeline/matching-engine.test.ts`

The existing benchmark proves the algorithm runs but doesn't reflect the actual workload. Replace it with the spec's target shape.

- [ ] **Step 1: Replace the existing perf test**

In `src/pipeline/matching-engine.test.ts`, locate the existing test `'completes 2000 ES x 200 LR matching in under 5 seconds'` (currently around line 139) and replace its body:

```ts
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
```

The third argument `60000` is the vitest test timeout (in ms) — it must exceed the 30000ms assertion budget so a slow run reports a meaningful failure rather than a timeout.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — including the new perf test. Note: the test suite duration will increase by however long the 12.6k bench takes (typically 5–15s post-optimization). On a slow machine it may approach the 30s budget; that's the point of the test.

If the new bench fails (`elapsed >= 30000`): the optimization isn't doing what the spec promised. Investigate which task's micro-opt isn't biting: check that `scoreForRanking` is being called (not bypassed), that `bucketByState` is producing buckets larger than 0, and that the JW workspace reuse is in place.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/matching-engine.test.ts
git commit -m "Replace 2000x200 perf bench with 12600x12600 under 30s"
```

---

### Task 9: Final verification

**Files:** none.

- [ ] **Step 1: Full test + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all three PASS.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev` (background). In the browser:

1. Upload `test-data/es-test-50.csv` as ES; upload `test-data/lr-test-50.csv` as LR.
2. Walk through column mapping → run match.
3. Verify the results table renders with the same matches and scores as before this branch.
4. Verify the progress indicator updates during matching (the 50-record interval should be visible on this small dataset).
5. Stop the dev server.

- [ ] **Step 3: No commit required (verification only)**

If the smoke surfaces an issue, fix it in a follow-up commit referencing the failure mode.

---

## Self-Review Notes

Spec coverage:

- Top-3 sorted-array collector — Task 3.
- Address-component pruning — Task 4.
- State-bucket scan with cross-state fallback at 0.85 threshold — Task 5.
- Reused JW workspace arrays — Task 6.
- `runMatching` API gains `options` — Task 7.
- Worker shim collapse — Task 7.
- Equivalence test against frozen naive baseline — Task 1.
- Edge-case test suite — Task 2.
- 12.6k × 12.6k under 30s benchmark — Task 8.
- All existing tests preserved — implicit in every task; verified at each green commit.

Type consistency: every reference to `Top3`, `scoreForRanking`, `bucketByState`, `RunMatchingOptions`, `MatchResult`, `MatchScores`, `LRCustomerResult`, `NormalizedRecord` used in later tasks is defined in earlier tasks or the existing codebase.

The key risk is the equivalence test failing on Task 5 (state-bucket fallback). If that happens, the cross-state fallback condition is wrong — likely a `<` vs `<=` mistake at the 0.85 boundary. The test in Task 1 specifically includes a 0.85 boundary case to surface this.
