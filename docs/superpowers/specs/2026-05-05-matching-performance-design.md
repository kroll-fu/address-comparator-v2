# Matching pipeline performance — design

## Goal

Cut the matching loop's runtime on 12.6k × 12.6k inputs from ~6 minutes to under 30 seconds with **bit-identical results** (every LR record's top-3 list, in the same order, with the same scores). No public type changes, no UI changes, no schema changes.

## Where the time goes today

The current algorithm in `src/pipeline/matching-engine.ts` runs `O(n_es × n_lr)` with four Jaro-Winkler calls per pair (street, city, full name, installer). The Jaro-Winkler implementation in `src/pipeline/jaro-winkler.ts` allocates two `Array(N).fill(false)` per call, so a 12.6k × 12.6k run produces ≈1.3B short-lived arrays. After scoring, the per-LR loop builds a 12.6k-element array and sorts it before slicing the top 3. Both the JW allocations and the unnecessary sort are pure overhead.

A 2000 × 200 benchmark in the existing test suite completes in ~870 ms; linearly extrapolating to 12.6k × 12.6k matches the ~6-minute observation.

## Non-goals

- No multi-worker parallelism (sharding LR across N workers).
- No WASM-compiled Jaro-Winkler.
- No trigram inverted indexes or BK-trees.
- No zip-prefix blocking. State-bucket alone is enough for the goal.
- No change to the matching algorithm, scoring weights, classifier thresholds, or scoring components.
- No change to `MatchScores`, `NormalizedRecord`, `MatchingOutput`, `LRCustomerResult`, or `ColumnMapping`.

## Approach overview

Three composable optimizations, all applied together:

1. **Top-3 collector** — a sorted 3-element array with binary-insert + truncate replaces `push 12.6k → sort → slice 3`. Eliminates the per-LR `Array(12.6k)` allocation and the `O(n log n)` sort.
2. **Address-component pruning** — score components in cost order with a running floor (`top3.minScore`); skip the remaining JW work for any pair whose upper-bound `addressScore` cannot displace the heap minimum.
3. **State-bucket scan with cross-state fallback** — index ES records by `state` once. For each LR record, scan its state bucket first; only fall back to scanning the rest of ES when `top3.length < 3` OR `top3.minScore < 0.85` (the maximum possible cross-state `addressScore`). This is the bit-identical guarantee.

Plus one independent micro-optimization in `jaro-winkler.ts`:

4. **Reused JW workspace arrays** — module-scoped preallocated `Uint8Array`s of length `JW_MAX_LEN = 256`, zeroed via `array.fill(0, 0, len)` per call. For inputs longer than 256, allocate fresh (graceful degradation). Strict win — same algorithm, no allocations in the hot path.

## Data structures

### State buckets

```ts
type StateBuckets = Map<string, NormalizedRecord[]>
// Key is NormalizedRecord.state — already normalized by the normalizer
// to either a 2-letter uppercase abbreviation or "" (empty).
// Records with empty state live in the "" bucket.
```

Built once per `runMatching` call before the LR loop, `O(n_es)`.

### Top-3 collector

```ts
type Top3 = MatchResult[]
// Length 0..3, sorted desc by scores.addressScore.
// minScore() returns top3[top3.length - 1]?.scores.addressScore ?? -Infinity
// tryInsert(result):
//   - if length < 3, binary-insert
//   - else if result.scores.addressScore > minScore, binary-insert and pop the last
```

Sorted-array (binary insert) is faster than a generic heap at size 3 and zero-dependency. Insert is O(log 3 + 3) = O(1).

## Algorithm

`runMatching(esRecords, lrRecords, options?)`:

```
buckets = bucketByState(esRecords)
results = []

for (let i = 0; i < lrRecords.length; i++) {
  const lr = lrRecords[i]
  const top3: Top3 = []

  // Phase 1: in-state scan
  const inState = buckets.get(lr.state) ?? []
  for (const es of inState) {
    const result = scoreForRanking(es, lr, top3.minScore())
    if (result) top3.tryInsert(result)
  }

  // Phase 2: cross-state fallback (rare in clean data)
  if (top3.length < 3 || top3.minScore() < 0.85) {
    for (const es of esRecords) {
      if (es.state === lr.state) continue  // skip in-state, already scanned
      const result = scoreForRanking(es, lr, top3.minScore())
      if (result) top3.tryInsert(result)
    }
  }

  results.push({ lrRecord: lr, topMatches: top3.slice() })

  if (options?.onProgress) {
    const interval = options.progressInterval ?? 50
    if ((i + 1) % interval === 0 || i === lrRecords.length - 1) {
      options.onProgress(i + 1, lrRecords.length)
    }
  }
}

return results
```

### `scoreForRanking(es, lr, floor) → MatchScores | null`

Two-phase scoring with two floor checks. Returns `null` when the pair cannot make the top 3.

```
1. stateMatch = (es.state === lr.state)            // ~1 op
2. zipMatch = (es.zip === lr.zip)                  // ~1 op

3. streetScore = jaroWinkler(es.street, lr.street) // expensive

4. // Floor check A — assume cityScore = 1.0 (max)
   ubAddressA = streetScore*0.5 + 1.0*0.25 + (stateMatch?0.15:0) + (zipMatch?0.10:0)
   if (ubAddressA < floor) return null

5. cityScore = jaroWinkler(es.city, lr.city)       // expensive

6. addressScore = streetScore*0.5 + cityScore*0.25 + (stateMatch?0.15:0) + (zipMatch?0.10:0)

7. // Floor check B — exact addressScore
   if (addressScore < floor) return null

8. nameScore       = jaroWinkler(es.fullName, lr.fullName)
9. emailScore      = (es.email && lr.email && es.email === lr.email) ? 1.0 : 0
10. installerScore = (es.installer && lr.installer)
                       ? jaroWinkler(es.installer.toLowerCase(), lr.installer.toLowerCase())
                       : 0

11. return { addressScore, nameScore, emailScore, installerScore,
             streetScore, cityScore, stateMatch, zipMatch }
```

`floor` is `-Infinity` (no pruning) until the heap fills to 3 entries.

### Bit-identical guarantee

Two claims to verify by equivalence test:

1. **Floor checks never drop a record that today would land in the top 3.** Floor check A uses `cityScore = 1.0` as the upper bound, which is the maximum possible — so any record dropped here has `addressScore < floor`, meaning it can't displace the current top 3. Floor check B is the exact `addressScore` — ditto.

2. **Cross-state fallback is invoked whenever the in-state scan might miss a top-3 entry.** The maximum possible cross-state `addressScore` is `street*0.5 + city*0.25 + 0*0.15 + 1*0.10 = 0.85` (with `street = city = 1.0` and `zipMatch = true`). If `top3.length === 3 && top3.minScore() >= 0.85`, no cross-state pair could displace any heap entry. Otherwise, we must scan cross-state — and we do.

## Public API

`runMatching` adds optional options. No breaking change.

```ts
function runMatching(
  esRecords: NormalizedRecord[],
  lrRecords: NormalizedRecord[],
  options?: {
    onProgress?: (completed: number, total: number) => void;
    progressInterval?: number;  // default 50
  }
): LRCustomerResult[]
```

`matching-worker.ts` collapses from ~58 lines (with its own duplicated inner loop and progress reporting) to a thin shim that calls `runMatching` with an `onProgress` callback. The worker keeps its existing message protocol (`progress`, `done`, `error`).

`scoreRecord(es, lr) → MatchScores` stays as the public, batch-friendly scoring entry point — it remains the function called by tests that exercise scoring in isolation.

## Files modified

- **`src/pipeline/jaro-winkler.ts`** — replace `Array(N).fill(false)` with reused `Uint8Array(JW_MAX_LEN)`. Same external signature.
- **`src/pipeline/matching-engine.ts`** — new `bucketByState`, `scoreForRanking`, and `Top3` helpers; `runMatching` gains options and the new two-phase algorithm. `scoreRecord` unchanged.
- **`src/pipeline/matching-worker.ts`** — collapse to a thin shim over `runMatching`.
- **`src/pipeline/matching-engine.test.ts`** — add equivalence test, edge-case tests, replace the 2000×200 perf bench with a 12.6k×12.6k bench.

No other files touched. No type changes, no schema changes, no UI changes.

## Testing

### Equivalence test (the bit-identical safety net)

Define `runMatchingNaive` inline as the current implementation (ported byte-for-byte to a private helper in the test file). Generate a synthetic 200-LR × 500-ES dataset with mixed shapes:

- In-state perfect matches.
- In-state weak matches (state matches but street differs).
- Cross-state strong matches at exactly `addressScore = 0.85` (street + city + zip max, state mismatch — the boundary case).
- LR records with empty state.
- LR records with garbage state ("XX").
- States with 0, 1, 2, 3, and many ES records.

Assert `deepEqual(runMatching(es, lr), runMatchingNaive(es, lr))`. This is the single most important regression guard — if blocking ever leaks a result divergence, this test catches it.

### Edge cases

- LR record with `state === ""` → falls through to cross-state fallback (because the `""` bucket may be empty or sparse).
- ES has 0 records in LR's state → fallback fills all 3 slots.
- ES has 1 record in LR's state → fallback fills the other 2.
- ES has 2 records in LR's state → fallback fills the third.
- All ES in same state → fallback never runs (in-state has 12.6k records).
- All LR records have empty state → fallback runs every iteration (worst case for state blocking).

### Performance bench

Replace the existing 2000×200 in-5-seconds benchmark with **12.6k × 12.6k under 30 seconds** on commodity hardware. Synthetic dataset:

- ~50 distinct states (uniformly distributed).
- ~12k distinct streets with overlapping prefixes (to exercise JW).
- ~50% of LR records have at least one in-state ES match.

This is a real-world-shaped workload. The 30s ceiling is a comfortable budget given the projected 4–10s typical case; tighten later if the headroom is not needed.

### Existing tests

All 8 existing `scoreRecord` and `runMatching` tests in `matching-engine.test.ts` continue to pass unmodified. The new algorithm preserves the public contract.

## Out-of-scope follow-ups

- **Multi-worker parallelism** — shard LR records across N web workers. Adds 2–4× on top, requires a SharedArrayBuffer or per-worker ES copy. Defer until 30s isn't enough.
- **WASM Jaro-Winkler** — likely 2–3× on the inner loop. Defer; the algorithmic wins above dominate.
- **Trigram inverted index on street** — sublinear nearest-neighbor lookup. Defer; full overkill for the current input size.
- **Zip-prefix or street-token blocking** — even tighter than state. Defer; state-bucket alone hits the goal.
