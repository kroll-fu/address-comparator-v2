# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on port 5173
- `npm run build` — production build
- `npm run preview` — serve the production build
- `npm test` — run Vitest once (used in CI)
- `npm run test:watch` — Vitest watch mode
- `npx vitest run src/pipeline/matching-engine.test.ts` — run a single test file
- `npx vitest run -t "scoreRecord"` — run tests by name pattern
- `npm run typecheck` — `tsc --noEmit` (no test runner does type-checking; run this before claiming work is complete)

Test discovery is restricted to `src/**/*.test.ts` (see `vitest.config.ts`); colocate tests next to the module they cover. The `@/*` import alias resolves to `src/*` and is configured in three places that must stay in sync: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`.

## Architecture

Browser-only React 19 + Vite app that takes two CSV/XLSX files (an "ES" dataset and an "LR" dataset), maps their columns, runs fuzzy address matching, and exports results. There is no backend — `xlsx` parses files in-browser and matching runs in a Web Worker.

### Pipeline (`src/pipeline/`) — pure, testable, framework-free

The pipeline is the heart of the app. Every module is a pure function with no React or DOM dependencies, which is what makes them unit-testable and worker-portable.

1. **`file-parser.ts`** — `XLSX.read` → `{ headers, rows: string[][] }`. Handles both CSV and XLSX uniformly.
2. **`column-detector.ts`** — regex-based auto-mapping from headers to a `ColumnMapping` (firstName/lastName/fullName, street/city/state/zip, plus optional installer/email/company/customerId). Patterns have explicit priorities; lower number wins.
3. **`normalizer.ts`** — `normalizeRecord(rawFields, columnMapping, sourceRow) → NormalizedRecord`. Lowercases names/streets/cities, expands states via `src/data/state-abbreviations.ts`, zero-pads zip to 5 digits, handles "Last, First" vs "First Last", and preserves `rawData` for extra-column passthrough on export.
4. **`jaro-winkler.ts`** — string similarity used for fuzzy fields.
5. **`matching-engine.ts`** — `scoreRecord` produces independent component scores. Address score is fixed-weighted: street 50%, city 25%, state exact 15%, zip exact 10%. **Scores are never combined into one** — name/email/company stay separate so classification can be re-run without re-scoring. `runMatching` is the synchronous version; the live app uses the Web Worker (next item).
6. **`matching-worker.ts`** — Web Worker that runs the O(n×m) loop off the main thread, posting `{type: 'progress'}` every 50 LR rows, then `{type: 'done', results}`. Top 3 ES matches per LR record are kept, sorted by `addressScore` desc.
7. **`classifier.ts`** — pure `classifyMatch(scores, thresholds) → MatchType`. `NoMatch` if `addressScore < addressThreshold`; otherwise `FullMatch` if name OR email passes its threshold, else `HouseholdMatch`. Defaults: address 0.85, name 0.82, email 1.0.
8. **`csv-exporter.ts`** — flattens `LRCustomerResult[]` to CSV rows including LR extra-column passthrough.

The split between `classifier` and `matching-engine` matters: thresholds can be re-tuned in the UI and the table re-classifies instantly without rerunning the worker.

### React layer (`src/components/`, `src/context/`)

`WorkflowContext` is the single source of truth and derives `currentStep` from state (`Upload → ColumnMapping → Matching → Results`) — never set the step directly. `runMatch` instantiates the worker via `new Worker(new URL('../pipeline/matching-worker.ts', import.meta.url), { type: 'module' })` (Vite's worker idiom — keep this exact form). The worker is terminated on completion, error, or when `runMatch` is called again.

`AppShell` renders sections progressively based on the derived step; it does not own state. `MatchingStep`/`ResultsTable` consume the worker output and re-classify on threshold changes via `classifyAllResults`.

### Types (`src/types/`)

`matching.ts` and `workflow.ts` define the contracts between pipeline and UI. `NormalizedRecord` carries both normalized fields (used for scoring) and raw fields (used for display/export) — when adding a new matchable field, you generally need to extend `NormalizedRecord`, `ColumnMapping`, the patterns in `column-detector.ts`, the field extraction in `normalizer.ts`, and (if it participates in scoring) `MatchScores` + `scoreRecord`.

### Theme

`src/theme/energysage.ts` defines CSS variables (`--es-navy`, `--es-gray*`, etc.) applied to `:root` by `applyTheme()` on mount. Components use these via inline styles — there is no CSS framework, no CSS modules, no styled-components.

## Test data

`test-data/es-test-50.csv` and `test-data/lr-test-50.csv` are the canonical fixtures for manual end-to-end testing in the dev server.
