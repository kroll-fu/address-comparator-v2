# Installer Score + Submitted Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Jaro-Winkler `installerScore` (display-only) between ES "Installer" and LR "Licensed Organization Name", carry the ES "Submitted Date" column through to the CSV export and the in-app results table, and remove the dead `company` field that the new installer scoring obsoletes.

**Architecture:** Two schema extensions on the existing pipeline. Both are display-only — `classifyMatch` is unchanged. Auto-detection patterns gain broad `date$` fallback for `submittedDate`. Scoring, normalization, CSV export, and the results table each gain one or two cells.

**Tech Stack:** React 19 + Vite, TypeScript strict, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-05-installer-score-and-submitted-date-design.md`

---

## File Map

Files modified (no new files):

- `src/types/matching.ts` — `MatchScores` swaps `companyScore` for `installerScore`; `NormalizedRecord` drops `company`, adds `submittedDate?: string`.
- `src/pipeline/column-detector.ts` — `ColumnMapping` drops `company`, adds `submittedDate`. Patterns array: drop 5 `company` entries, add 5 `submittedDate` entries. `fieldsToAssign` array updated.
- `src/pipeline/column-detector.test.ts` — drop the standalone company test, drop the `mapping.company` assertion in the verbose-LightReach test, add submittedDate detection tests.
- `src/pipeline/normalizer.ts` — drop `company` extraction, add `submittedDate` extraction.
- `src/pipeline/normalizer.test.ts` — add submittedDate passthrough test.
- `src/pipeline/matching-engine.ts` — `scoreRecord` replaces `companyScore` line with `installerScore` (with empty-side-zero gating).
- `src/pipeline/matching-engine.test.ts` — add `installerScore` assertions.
- `src/pipeline/csv-exporter.ts` — header `'Company Score'` → `'Installer Score'`, `'LR Company'` → `'LR Installer'`, add `'ES Submitted Date'`. Row builder reads `lr.installer` and `topMatch.esRecord.submittedDate ?? ''`. No-match row gets one extra empty cell for the new ES column.
- `src/pipeline/csv-exporter.test.ts` — `makeScores` swap, header assertion updates, new test for Submitted Date passthrough.
- `src/pipeline/classifier.test.ts` — `makeScores` helper swap.
- `src/components/ColumnMappingPanel.tsx` — `ALL_FIELDS` and `OPTIONAL_FIELDS` swap `company` for `submittedDate`.
- `src/components/ResultsTable.tsx` — `Company %` header → `Installer %`; `companyScore` cells → `installerScore`; new `ES Submitted Date` header + cell.
- `test-data/es-test-50.csv` — append `Submitted Date` column with synthetic ISO dates.

---

## Task Sequencing Rule

Each task ends with a green commit: `npm test` and `npm run typecheck` both pass. Tasks 1–5 are additive (`submittedDate` rolled in across pipeline → UI → fixture, leaving `company` alone). Task 6 is the atomic `companyScore → installerScore` swap. Task 7 is the pure-deletion cleanup of the orphan `company` field. Task 8 is final verification.

---

### Task 1: Add `submittedDate` to schema, auto-detection, and normalizer

**Files:**
- Modify: `src/types/matching.ts` (the `NormalizedRecord` interface)
- Modify: `src/pipeline/column-detector.ts` (the `ColumnMapping` interface, the `PATTERNS` array, the `fieldsToAssign` array in `detectColumns`)
- Modify: `src/pipeline/column-detector.test.ts`
- Modify: `src/pipeline/normalizer.ts` (the `normalizeRecord` function)
- Modify: `src/pipeline/normalizer.test.ts`

- [ ] **Step 1: Write the failing detection tests**

Append to `src/pipeline/column-detector.test.ts` inside the `describe('detectColumns', ...)` block (after the existing `'detects verbose LightReach headers'` test, before `'handles headers with no matches'`):

```ts
it('detects "Submitted Date" exactly', () => {
  const headers = ['First Name', 'Last Name', 'Street', 'City', 'State', 'Zip', 'Submitted Date'];
  const mapping = detectColumns(headers);
  expect(mapping.submittedDate).toBe('Submitted Date');
});

it('detects underscore/dash variants of submitted date', () => {
  expect(detectColumns(['submitted_date']).submittedDate).toBe('submitted_date');
  expect(detectColumns(['Submission Date']).submittedDate).toBe('Submission Date');
});

it('detects "Lead Creation Date" and "Lead Created Date" as submittedDate', () => {
  expect(detectColumns(['Lead Creation Date']).submittedDate).toBe('Lead Creation Date');
  expect(detectColumns(['Lead Created Date']).submittedDate).toBe('Lead Created Date');
});

it('falls back to broad "...date" pattern when no specific match exists', () => {
  expect(detectColumns(['Modified Date']).submittedDate).toBe('Modified Date');
});

it('prefers "Submitted Date" over a broad-pattern "...date" sibling', () => {
  const headers = ['Submitted Date', 'Modified Date'];
  const mapping = detectColumns(headers);
  expect(mapping.submittedDate).toBe('Submitted Date');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pipeline/column-detector.test.ts`
Expected: FAIL — the new tests reference `mapping.submittedDate` which does not exist yet on `ColumnMapping`. TypeScript compile error or runtime undefined assertion.

- [ ] **Step 3: Add `submittedDate` to `ColumnMapping` and patterns**

In `src/pipeline/column-detector.ts`, update the `ColumnMapping` interface — add the new field at the bottom (alongside the other optional fields):

```ts
export interface ColumnMapping {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  installer?: string;
  email?: string;
  company?: string;        // (still present — removed in Task 7 below)
  customerId?: string;
  submittedDate?: string;
}
```

In the same file, append five entries to the `PATTERNS` array (after the customerId entries, before the closing `];`):

```ts
  // Submitted date — ES "Submitted Date" carries lead creation timestamps
  { field: 'submittedDate', pattern: /^submitted[_\s-]?date$/i, priority: 1 },
  { field: 'submittedDate', pattern: /^submission[_\s-]?date$/i, priority: 2 },
  { field: 'submittedDate', pattern: /^lead[_\s-]?(creation|created)[_\s-]?date$/i, priority: 3 },
  { field: 'submittedDate', pattern: /^date[_\s-]?(submitted|created)$/i, priority: 4 },
  { field: 'submittedDate', pattern: /date$/i, priority: 8 }, // broad fallback
```

In `detectColumns`, update the `fieldsToAssign` array to include the new field — change:

```ts
  const fieldsToAssign: (keyof ColumnMapping)[] = [
    'firstName', 'lastName', 'street', 'city', 'state', 'zip', 'installer',
    'email', 'company', 'customerId',
  ];
```

to:

```ts
  const fieldsToAssign: (keyof ColumnMapping)[] = [
    'firstName', 'lastName', 'street', 'city', 'state', 'zip', 'installer',
    'email', 'company', 'customerId', 'submittedDate',
  ];
```

- [ ] **Step 4: Run column-detector tests, verify pass**

Run: `npx vitest run src/pipeline/column-detector.test.ts`
Expected: PASS — all existing + new tests green.

- [ ] **Step 5: Write the failing normalizer test**

Append to `src/pipeline/normalizer.test.ts` inside the final `describe('normalizeRecord', ...)` block:

```ts
it('passes Submitted Date through as a raw trimmed string', () => {
  const rawFields = {
    'First Name': 'John',
    'Last Name': 'Smith',
    'Street Address': '123 Main St',
    'City': 'Westport',
    'State': 'CT',
    'Zip Code': '06880',
    'Submitted Date': '  2025-01-15  ',
  };
  const mapping = {
    firstName: 'First Name',
    lastName: 'Last Name',
    street: 'Street Address',
    city: 'City',
    state: 'State',
    zip: 'Zip Code',
    submittedDate: 'Submitted Date',
  };
  const result = normalizeRecord(rawFields, mapping, 0);
  expect(result.submittedDate).toBe('2025-01-15');
});

it('omits submittedDate when not mapped', () => {
  const rawFields = {
    'First Name': 'John',
    'Last Name': 'Smith',
    'Street Address': '123 Main St',
    'City': 'Westport',
    'State': 'CT',
    'Zip Code': '06880',
  };
  const mapping = {
    firstName: 'First Name',
    lastName: 'Last Name',
    street: 'Street Address',
    city: 'City',
    state: 'State',
    zip: 'Zip Code',
  };
  const result = normalizeRecord(rawFields, mapping, 0);
  expect(result.submittedDate).toBeUndefined();
});

it('treats empty Submitted Date as undefined', () => {
  const rawFields = {
    'First Name': 'John',
    'Last Name': 'Smith',
    'Street Address': '123 Main St',
    'City': 'Westport',
    'State': 'CT',
    'Zip Code': '06880',
    'Submitted Date': '   ',
  };
  const mapping = {
    firstName: 'First Name',
    lastName: 'Last Name',
    street: 'Street Address',
    city: 'City',
    state: 'State',
    zip: 'Zip Code',
    submittedDate: 'Submitted Date',
  };
  const result = normalizeRecord(rawFields, mapping, 0);
  expect(result.submittedDate).toBeUndefined();
});
```

- [ ] **Step 6: Run normalizer tests to verify they fail**

Run: `npx vitest run src/pipeline/normalizer.test.ts`
Expected: FAIL — `result.submittedDate` is `undefined` for all three (the type doesn't have the field yet, and the normalizer doesn't extract it).

- [ ] **Step 7: Add `submittedDate` to `NormalizedRecord` and the normalizer**

In `src/types/matching.ts`, append `submittedDate` to the optional-fields block of `NormalizedRecord`:

```ts
  // Optional fields
  email?: string;
  company?: string;            // (still present — removed in Task 7 below)
  customerId?: string;
  submittedDate?: string;      // Raw passthrough, no parsing
  rawData?: Record<string, string>;
```

In `src/pipeline/normalizer.ts`, in `normalizeRecord` (around line 116, immediately after the `customerId` extraction), add:

```ts
  const submittedDate = columnMapping.submittedDate
    ? (rawFields[columnMapping.submittedDate] ?? '').trim() || undefined
    : undefined;
```

In the returned object spread (around lines 130–134), add the conditional spread immediately after `customerId`:

```ts
    ...(email !== undefined && { email }),
    ...(company !== undefined && { company }),
    ...(customerId !== undefined && { customerId }),
    ...(submittedDate !== undefined && { submittedDate }),
    rawData: rawFields,
```

- [ ] **Step 8: Run normalizer tests to verify pass**

Run: `npx vitest run src/pipeline/normalizer.test.ts`
Expected: PASS.

- [ ] **Step 9: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/matching.ts src/pipeline/column-detector.ts src/pipeline/column-detector.test.ts src/pipeline/normalizer.ts src/pipeline/normalizer.test.ts
git commit -m "Add submittedDate field with auto-detection and normalizer passthrough"
```

---

### Task 2: Carry Submitted Date through the CSV export

**Files:**
- Modify: `src/pipeline/csv-exporter.ts` (`buildCSVHeaders`, `buildCSVRow`)
- Modify: `src/pipeline/csv-exporter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/pipeline/csv-exporter.test.ts` inside `describe('exportMatchesToCSV', ...)`:

```ts
it('includes ES Submitted Date column header', () => {
  const csv = exportMatchesToCSV([], thresholds);
  const headers = csv.split('\n')[0];
  expect(headers).toContain('ES Submitted Date');
});

it('emits the ES submittedDate value in the export row', () => {
  const result: LRCustomerResult = {
    lrRecord: makeRecord(),
    topMatches: [{
      esRecord: makeRecord({ submittedDate: '2025-01-15' }),
      scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }),
    }],
  };
  const csv = exportMatchesToCSV([result], thresholds);
  expect(csv).toContain('2025-01-15');
});

it('emits an empty cell when ES submittedDate is missing', () => {
  const result: LRCustomerResult = {
    lrRecord: makeRecord(),
    topMatches: [{
      esRecord: makeRecord(),
      scores: makeScores({ addressScore: 0.90, nameScore: 0.85 }),
    }],
  };
  const csv = exportMatchesToCSV([result], thresholds);
  const dataLine = csv.split('\n')[1];
  // The line should still parse: same comma count as the header
  const headerCommas = csv.split('\n')[0].split(',').length;
  const dataCommas = dataLine.split(',').length;
  expect(dataCommas).toBe(headerCommas);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pipeline/csv-exporter.test.ts`
Expected: FAIL — header doesn't contain `'ES Submitted Date'`; data row missing the value.

- [ ] **Step 3: Update the CSV exporter**

In `src/pipeline/csv-exporter.ts`, update `buildCSVHeaders` — append `'ES Submitted Date'` after `'ES_Installer'`:

```ts
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
```

In `buildCSVRow`, the matched-row return — append the date cell after `topMatch.esRecord.installer`:

```ts
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
```

In the no-topMatch branch, the trailing ES placeholder line is currently `'', '', '', '', '', '', '',` (seven empties). Add one more for the new column — change to:

```ts
      '', '', '', '', '', '', '', '',
      ...extraValues,
    ];
```

- [ ] **Step 4: Run csv-exporter tests, verify pass**

Run: `npx vitest run src/pipeline/csv-exporter.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/csv-exporter.ts src/pipeline/csv-exporter.test.ts
git commit -m "Add ES Submitted Date column to CSV export"
```

---

### Task 3: Show Submitted Date row in the column-mapping panel

**Files:**
- Modify: `src/components/ColumnMappingPanel.tsx`

This is a UI-only change with no unit-test coverage today. Verification is by visual smoke test.

- [ ] **Step 1: Add `submittedDate` to the panel's field lists**

In `src/components/ColumnMappingPanel.tsx`:

Change line 18:

```ts
const OPTIONAL_FIELDS = new Set<MappingField>(['installer', 'email', 'company', 'customerId', 'submittedDate']);
```

Change the `ALL_FIELDS` array (lines 20–32) — append the new entry after `customerId`:

```ts
const ALL_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'installer', label: 'Installer' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company Name' },
  { key: 'customerId', label: 'Customer ID' },
  { key: 'submittedDate', label: 'Submitted Date' },
];
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the dev server and smoke-test**

Run: `npm run dev` (background), then upload `test-data/es-test-50.csv` (the original — fixture is updated in Task 5) and verify the column mapping panel renders a "Submitted Date" row with `○ not mapped` (it won't map yet because the fixture has no Submitted Date column). Stop the dev server.

Note: do not commit the dev server log; only commit the source change.

- [ ] **Step 4: Commit**

```bash
git add src/components/ColumnMappingPanel.tsx
git commit -m "Show Submitted Date row in column-mapping panel"
```

---

### Task 4: Show ES Submitted Date column in the results table

**Files:**
- Modify: `src/components/ResultsTable.tsx`

UI-only change, no test coverage. Smoke verify.

- [ ] **Step 1: Add the column header**

In `src/components/ResultsTable.tsx` around line 329, add a non-sortable `<th>` between `ES Address` and the trailing empty header cell:

```tsx
                <th style={thStyle} onClick={() => handleSort('esAddress')}>ES Address{renderSortArrow('esAddress')}</th>
                <th style={{ ...thStyle, cursor: 'default' }}>ES Submitted</th>
                <th style={{ ...thStyle, cursor: 'default' }}></th>
```

- [ ] **Step 2: Add the matching `<td>` in `renderRow`**

In the same file around line 265 (after the ES Address `<td>`, before the trailing actions `<td>`), add:

```tsx
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.submittedDate ?? ''}</td>
```

The full sequence will read:

```tsx
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.rawName}</td>
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.rawAddress}</td>
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.submittedDate ?? ''}</td>
        <td style={{ ...tdStyle, ...groupBorderStyle }}>
          {!isAlternative && result.topMatches.length > 1 && (
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultsTable.tsx
git commit -m "Show ES Submitted Date column in results table"
```

---

### Task 5: Append Submitted Date column to the test fixture

**Files:**
- Modify: `test-data/es-test-50.csv`

The header row currently is `First Name,Last Name,Street Address,City,State,Zip Code,Installer`. Each data row has 7 columns.

- [ ] **Step 1: Append a `Submitted Date` column to every row**

Use a script to append synthetic ISO dates (no exposure to date math: just stamp `2025-01-NN` cycling 01..28). Run from the repo root:

```bash
python3 - <<'PY'
from pathlib import Path
src = Path('test-data/es-test-50.csv')
lines = src.read_text().splitlines()
out = []
for i, line in enumerate(lines):
    if i == 0:
        out.append(f"{line},Submitted Date")
    else:
        day = ((i - 1) % 28) + 1
        out.append(f"{line},2025-01-{day:02d}")
src.write_text('\n'.join(out) + '\n')
PY
```

- [ ] **Step 2: Verify the file shape**

Run: `head -3 test-data/es-test-50.csv`
Expected: header now ends with `,Submitted Date`; first data row ends with `,2025-01-01`; second data row ends with `,2025-01-02`.

Run: `awk -F, '{print NF}' test-data/es-test-50.csv | sort -u`
Expected: a single value (8) — every row has the same column count.

- [ ] **Step 3: Commit**

```bash
git add test-data/es-test-50.csv
git commit -m "Add Submitted Date column to ES test fixture"
```

---

### Task 6: Atomic swap — `companyScore` → `installerScore`

*Note: this is the installer-scoring half of the spec. Tasks 1–5 were the Submitted-Date half.*

**Files:**
- Modify: `src/types/matching.ts`
- Modify: `src/pipeline/matching-engine.ts`
- Modify: `src/pipeline/matching-engine.test.ts`
- Modify: `src/pipeline/csv-exporter.ts`
- Modify: `src/pipeline/csv-exporter.test.ts`
- Modify: `src/pipeline/classifier.test.ts`
- Modify: `src/components/ResultsTable.tsx`

This is an atomic refactor. After this task, `companyScore` no longer exists anywhere in the codebase, but `lr.company`/`ColumnMapping.company` (the dead schema field) remain — Task 7 cleans those up.

- [ ] **Step 1: Write the failing matching-engine tests**

Append to `src/pipeline/matching-engine.test.ts` inside `describe('scoreRecord', ...)`:

```ts
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
```

- [ ] **Step 2: Run matching-engine tests to verify they fail**

Run: `npx vitest run src/pipeline/matching-engine.test.ts`
Expected: FAIL — `scores.installerScore` does not exist on the `MatchScores` type.

- [ ] **Step 3: Update the `MatchScores` type**

In `src/types/matching.ts`, replace the `companyScore` line in `MatchScores` with:

```ts
export interface MatchScores {
  addressScore: number;
  nameScore: number;
  emailScore: number;
  installerScore: number;     // 0-1, Jaro-Winkler on installer/licensed-org names (display only)
  // Component scores for debugging/display
  streetScore: number;
  cityScore: number;
  stateMatch: boolean;
  zipMatch: boolean;
}
```

- [ ] **Step 4: Update `scoreRecord` to compute `installerScore`**

In `src/pipeline/matching-engine.ts`, replace the `companyScore` line (currently `const companyScore = jaroWinkler(esRecord.company ?? '', lrRecord.company ?? '');`) with:

```ts
  // Installer score: Jaro-Winkler on installer / licensed-organization names.
  // Returns 0 when either side is empty (avoids the JW('','') === 1 false-perfect-match).
  const installerScore =
    (esRecord.installer && lrRecord.installer)
      ? jaroWinkler(esRecord.installer.toLowerCase(), lrRecord.installer.toLowerCase())
      : 0;
```

In the returned object, replace `companyScore,` with `installerScore,`:

```ts
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
```

- [ ] **Step 5: Update the CSV exporter**

In `src/pipeline/csv-exporter.ts`:

Rename `'Company Score'` → `'Installer Score'` and `'LR Company'` → `'LR Installer'` in `buildCSVHeaders`:

```ts
    'Match Type',
    'Address Score',
    'Name Score',
    'Email Score',
    'Installer Score',
    'LR First Name',
    'LR Last Name',
    'LR Email',
    'LR Installer',
    'LR Customer ID',
```

In `buildCSVRow` no-topMatch branch (around lines 67), change `lr.company ?? ''` to `lr.installer`:

```ts
      lr.firstName,
      lr.lastName,
      lr.email ?? '',
      lr.installer,
      lr.customerId ?? '',
```

In the matched-row branch (around lines 85 and 89), change `formatPercent(topMatch.scores.companyScore)` → `formatPercent(topMatch.scores.installerScore)` and `lr.company ?? ''` → `lr.installer`:

```ts
    formatPercent(topMatch.scores.addressScore),
    formatPercent(topMatch.scores.nameScore),
    formatPercent(topMatch.scores.emailScore),
    formatPercent(topMatch.scores.installerScore),
    lr.firstName,
    lr.lastName,
    lr.email ?? '',
    lr.installer,
    lr.customerId ?? '',
```

- [ ] **Step 6: Update the CSV exporter test helpers**

In `src/pipeline/csv-exporter.test.ts`:

Change `companyScore: 0` to `installerScore: 0` in the `makeScores` helper (line 27).

Change the existing header assertion `expect(headers).toContain('Company Score');` (line 72) to `expect(headers).toContain('Installer Score');` and add `expect(headers).toContain('LR Installer');`.

- [ ] **Step 7: Update the classifier test helper**

In `src/pipeline/classifier.test.ts`, change `companyScore: 0` (line 11) to `installerScore: 0`.

- [ ] **Step 8: Update `ResultsTable.tsx`**

In `src/components/ResultsTable.tsx`:

Change the `<th>` at line 324 from `Company %` to `Installer %`:

```tsx
                <th style={{ ...thStyle, cursor: 'default' }}>Installer %</th>
```

Change the two `companyScore` references at lines 250–251:

```tsx
        <td style={{ ...tdStyle, color: scoreColor(top.scores.installerScore), fontWeight: 500, ...groupBorderStyle }}>
          {formatPercent(top.scores.installerScore)}
        </td>
```

- [ ] **Step 9: Run the full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS.

If typecheck fails with a residual `companyScore`/`lr.company` reference outside the files above, search the codebase: `grep -rn "companyScore\|\.company\b" src/`. The plan as written should leave only the dead `ColumnMapping.company` and `NormalizedRecord.company` schema fields (cleaned up in Task 7 next) and possibly a stale comment in `types/matching.ts` near line 14 that mentions "Installer company name" — that comment is fine, leave it alone.

- [ ] **Step 10: Commit**

```bash
git add src/types/matching.ts src/pipeline/matching-engine.ts src/pipeline/matching-engine.test.ts src/pipeline/csv-exporter.ts src/pipeline/csv-exporter.test.ts src/pipeline/classifier.test.ts src/components/ResultsTable.tsx
git commit -m "Replace companyScore with installerScore (display-only, empty-side-gated)"
```

---

### Task 7: Drop the orphan `company` field

**Files:**
- Modify: `src/types/matching.ts` (`NormalizedRecord`)
- Modify: `src/pipeline/column-detector.ts` (`ColumnMapping`, `PATTERNS`, `fieldsToAssign`)
- Modify: `src/pipeline/column-detector.test.ts`
- Modify: `src/pipeline/normalizer.ts`
- Modify: `src/components/ColumnMappingPanel.tsx`

Pure deletion: `companyScore` is already gone (Task 6). Now we remove the schema field. No tests need to be added — this is a `git rm`-shaped change.

- [ ] **Step 1: Drop `company` from `NormalizedRecord`**

In `src/types/matching.ts`, delete the line:

```ts
  company?: string;            // Company name (trimmed, display only)
```

- [ ] **Step 2: Drop `company` from `ColumnMapping` and patterns**

In `src/pipeline/column-detector.ts`:

Delete `company?: string;` from the `ColumnMapping` interface.

Delete the five company `PATTERNS` entries (the block currently lines 65–70):

```ts
  // Company patterns — also match "Organization Name"
  { field: 'company', pattern: /^company$/i, priority: 1 },
  { field: 'company', pattern: /^company[_\s-]?name$/i, priority: 2 },
  { field: 'company', pattern: /^organization$/i, priority: 3 },
  { field: 'company', pattern: /^organization[_\s-]?name$/i, priority: 4 },
  { field: 'company', pattern: /organization[_\s-]?name$/i, priority: 5 },
```

In `detectColumns`, drop `'company'` from `fieldsToAssign`:

```ts
  const fieldsToAssign: (keyof ColumnMapping)[] = [
    'firstName', 'lastName', 'street', 'city', 'state', 'zip', 'installer',
    'email', 'customerId', 'submittedDate',
  ];
```

- [ ] **Step 3: Update column-detector tests**

In `src/pipeline/column-detector.test.ts`:

**Delete** the entire `'detects company name as company field'` test (lines 57–63):

```ts
  it('detects company name as company field', () => {
    const headers = ['Name', 'Address', 'City', 'State', 'Zip', 'Company Name'];
    const mapping = detectColumns(headers);

    expect(mapping.company).toBe('Company Name');
    expect(mapping.installer).toBeUndefined();
  });
```

In the `'detects verbose LightReach headers'` test, **delete** the assertion `expect(mapping.company).toBe('Organization Name');` (line 95).

- [ ] **Step 4: Drop the company extraction from the normalizer**

In `src/pipeline/normalizer.ts`:

Delete this line (around line 115):

```ts
  const company = columnMapping.company ? (rawFields[columnMapping.company] ?? '').trim() || undefined : undefined;
```

In the returned object (around lines 130–134), delete the conditional spread:

```ts
    ...(company !== undefined && { company }),
```

- [ ] **Step 5: Drop `company` from the column-mapping panel**

In `src/components/ColumnMappingPanel.tsx`:

Change line 18 (`OPTIONAL_FIELDS`) — remove `'company'`:

```ts
const OPTIONAL_FIELDS = new Set<MappingField>(['installer', 'email', 'customerId', 'submittedDate']);
```

In `ALL_FIELDS`, delete the line `{ key: 'company', label: 'Company Name' },`.

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, PASS.

If typecheck fails, run `grep -rn "\.company\b\|'company'\|\"company\"\|ColumnMapping.company" src/` and fix any straggler. Per the spec: a column literally named "Company" on an LR file will now flow through as an LR extra-header (no longer silently consumed) — this is intentional.

- [ ] **Step 7: Commit**

```bash
git add src/types/matching.ts src/pipeline/column-detector.ts src/pipeline/column-detector.test.ts src/pipeline/normalizer.ts src/components/ColumnMappingPanel.tsx
git commit -m "Drop dead company field now that installer is the match column"
```

---

### Task 8: Final verification

**Files:** none.

- [ ] **Step 1: Full test + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all three PASS.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev` (background). In the browser:

1. Upload `test-data/es-test-50.csv` as ES; upload `test-data/lr-test-50.csv` as LR.
2. Verify ES column-mapping panel auto-maps `Submitted Date → Submitted Date` (the new patterns make this happen).
3. Confirm "Company Name" no longer appears in the panel.
4. Click through to results.
5. Verify the table has columns `Match Type | Addr % | Name % | Email % | Installer % | LR Name | LR Address | ES Name | ES Address | ES Submitted` and that the Installer % column shows non-zero values where ES has an Installer (LR's "Licensed Organization Name" is missing in this fixture, so most rows will be 0% — that's expected per the empty-side-gating bugfix).
6. Verify ES Submitted column shows e.g. `2025-01-01` for row 1.
7. Click "Export Matches CSV". Open the downloaded file; confirm headers include `Installer Score`, `LR Installer`, `ES Submitted Date`; confirm `Company Score` and `LR Company` are gone.
8. Stop the dev server.

- [ ] **Step 3: No commit required (verification only)**

If the smoke test surfaces an issue, fix it in a follow-up commit referencing the failure mode.

---

## Self-Review Notes

Spec coverage:
- Schema swap (companyScore → installerScore, company drop, submittedDate add) — Tasks 1, 6, 7.
- Auto-detection patterns for submittedDate — Task 1, Step 3.
- Empty-side-gating bugfix on installerScore — Task 6, Step 4 + tests in Step 1.
- CSV header rename + new ES Submitted Date column — Tasks 2, 6.
- ResultsTable Installer % header + ES Submitted column — Tasks 4, 6.
- ColumnMappingPanel field swap — Tasks 3, 7.
- Test fixture date column — Task 5.
- Final smoke covers UI flow — Task 8.

Type consistency: every reference to `installerScore`, `submittedDate`, `lr.installer`, `topMatch.esRecord.submittedDate` used in later tasks is defined in earlier tasks (Tasks 1 and 6).
