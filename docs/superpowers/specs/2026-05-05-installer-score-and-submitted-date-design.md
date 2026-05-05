# Installer match score + Submitted Date passthrough — design

## Goal

Two changes to the address-comparator matching pipeline, both small schema extensions:

1. **Installer match score.** ES files have an `Installer` column; LR files have a `Licensed Organization Name` column — these refer to the same real-world entity (the solar installer). Today the column-mapping already pairs them as the `installer` field, but the value is purely display-only passthrough. We will compute a Jaro-Winkler similarity between them as `installerScore`, surface it in the ResultsTable and CSV export, and **not** wire it into `classifyMatch` — it is informational, like a tiebreaker for human review.
2. **Submitted Date passthrough.** Carry the ES "Submitted Date" column through the pipeline as a raw string and surface it in both the in-app ResultsTable and the CSV export.

## Non-goals

- No change to `classifyMatch`. Address + (name OR email) remains the FullMatch rule. `installerScore` is display-only; missing-installer and bad-installer matches do not change classification.
- No date parsing or normalization. Submitted Date is a raw passthrough — whatever string the file has is what the export shows.
- No additional pass-through ES columns. We rejected approach B (generic ES extra-column passthrough) in favor of one named field; if more columns need carrying through later, that's a separate decision.

## Schema changes

### `src/types/matching.ts`

`MatchScores`:
- **Drop** `companyScore`.
- **Add** `installerScore: number` — Jaro-Winkler 0–1, comparing lowercased installer strings.

`NormalizedRecord`:
- **Drop** `company`.
- **Add** `submittedDate?: string` — raw passthrough, optional, no normalization beyond `.trim()`.

### `src/pipeline/column-detector.ts`

`ColumnMapping`:
- **Drop** `company?: string`.
- **Add** `submittedDate?: string`.
- `installer?: string` is unchanged.

The orphan `company` field is removed entirely. It and `installer` represent the same real-world entity; keeping both creates dead code (`companyScore` was already computed-but-unused).

## Auto-detection patterns (`column-detector.ts` `PATTERNS` array)

Remove the five existing `company` entries (currently lines 66–70).

Add for `submittedDate`:

| Pattern                                            | Priority |
|---------------------------------------------------|----------|
| `^submitted[_\s-]?date$`                          | 1        |
| `^submission[_\s-]?date$`                         | 2        |
| `^lead[_\s-]?(creation\|created)[_\s-]?date$`     | 3        |
| `^date[_\s-]?(submitted\|created)$`               | 4        |
| `date$` (broad fallback)                          | 8        |

The detector's existing logic — pick lowest priority number per field, dedupe on already-used header — handles tie-breaking. A workbook with both "Submitted Date" and "Modified Date" will pick "Submitted Date" via priority 1 and never fall through to the broad rule.

`installer` patterns are unchanged. Real LR files use "Licensed Organization Name" which already matches `licensed[_\s-]?org` at priority 3.

## Normalizer (`src/pipeline/normalizer.ts`)

In `normalizeRecord`:
- Remove the `company` extraction (currently the line setting `company` from `columnMapping.company`).
- Add `submittedDate` extraction: `columnMapping.submittedDate ? (rawFields[columnMapping.submittedDate] ?? '').trim() || undefined : undefined`. Same conditional-spread shape used today for `email`/`company`/`customerId`.
- `installer` extraction is unchanged. **Casing is preserved** (only trimmed) so the UI can show "SunRun Solar" not "sunrun solar".

## Scoring (`src/pipeline/matching-engine.ts`)

Replace the current `companyScore` line in `scoreRecord` with:

```ts
const installerScore =
  (esRecord.installer && lrRecord.installer)
    ? jaroWinkler(esRecord.installer.toLowerCase(), lrRecord.installer.toLowerCase())
    : 0;
```

Notes:
- Lowercase only at scoring time — preserves display casing in `NormalizedRecord`.
- Returns `0` when either side is empty. This fixes a latent bug in the current `companyScore`, which calls `jaroWinkler('', '')` → `1.0` when both fields are missing, falsely reporting a perfect match. Aligns with how `emailScore` already gates on both sides being non-empty.

`MatchScores` returned object: replace `companyScore` with `installerScore` in the spread.

## Classifier (`src/pipeline/classifier.ts`)

**No change.** `installerScore` is display-only.

## Matching worker (`src/pipeline/matching-worker.ts`)

**No change.** It calls `scoreRecord` and copies the resulting `MatchScores` verbatim.

## UI

### `src/components/ColumnMappingPanel.tsx`

In `ALL_FIELDS`: replace `{ key: 'company', label: 'Company Name' }` with `{ key: 'submittedDate', label: 'Submitted Date' }`.
In `OPTIONAL_FIELDS`: same swap (`'company'` → `'submittedDate'`).

The new field shows up as just another optional row with auto-detect, dropdown override, and "○ not mapped" placeholder if absent. Both ES and LR see the row; in practice only ES populates it. Same UX as `installer` today.

### `src/components/ResultsTable.tsx`

- Replace any "Company"/`companyScore` cell with **Installer Score**, rendered as percent like the other score cells.
- Add an **ES Submitted Date** cell for each ES match row, displaying the raw string (blank if not mapped).

Other components (`MatchingStep.tsx`, `SummaryStatsBar.tsx`) will be grepped during implementation for any stray `company` references; current evidence says they don't drive scoring or display, but the implementation plan will verify.

## CSV export (`src/pipeline/csv-exporter.ts`)

In `buildCSVHeaders`:
- `'Company Score'` → `'Installer Score'`
- `'LR Company'` → `'LR Installer'`
- Add `'ES Submitted Date'` to the ES section (positioned next to the other ES_* columns).

In the row builder:
- Emit `formatPercent(scores.installerScore)` where `companyScore` was emitted.
- Emit `lrRecord.installer` where `lrRecord.company` was emitted.
- Emit `esRecord.submittedDate ?? ''` for the new ES Submitted Date column.

LR extra-header passthrough mechanism is unchanged. The `lrExtraHeaders` calculation in `WorkflowContext.runMatch` excludes mapped fields from passthrough, so removing `company` from `ColumnMapping` automatically means a column literally named "Company" on an LR file would now flow through as an extra-header rather than be silently consumed — which is the right behavior.

## Tests

Update in-place (no new test files):

**`column-detector.test.ts`:**
- Drop the `company` detection cases.
- Add `submittedDate`: exact "Submitted Date" maps; "submitted_date"/"submitted-date" map; "Submission Date" maps; "Lead Creation Date" / "Lead Created Date" map; broad fallback — "Modified Date" alone maps to `submittedDate`, but with "Submitted Date" also present "Submitted Date" wins and "Modified Date" is left for the LR extra-header passthrough.

**`normalizer.test.ts`:**
- Drop the `company` passthrough test.
- Add `submittedDate` passthrough: trimmed, no other transforms; missing column → `undefined`; empty value → `undefined`.
- Add an `installer` casing-preservation assertion if not already present.

**`matching-engine.test.ts`:**
- Drop the `companyScore` cases.
- Add `installerScore`: identical strings → 1; fuzzy strings → between 0 and 1; either side empty → 0 (regression for the `jaroWinkler('', '') === 1` bug); case differences do not reduce score.

**`csv-exporter.test.ts`:**
- Update header assertions for the renamed columns.
- Add coverage for the new `ES Submitted Date` column carrying through the raw string.

## Test fixtures

Append a `Submitted Date` column to `test-data/es-test-50.csv` with synthetic ISO-ish strings (e.g. `2025-01-15`). `lr-test-50.csv` is unchanged.

## Out-of-scope follow-ups

- Promoting `installerScore` to a classification factor (third alternative for FullMatch). Explicitly deferred — the user picked display-only.
- Generic ES extra-column passthrough — alternative B from brainstorming, deferred until a second column needs carrying through.
- Date parsing/normalization — deferred unless filtering or sorting on date is needed in the UI.
