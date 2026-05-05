/** A single normalized record from either dataset */
export interface NormalizedRecord {
  sourceRow: number;          // Original row index for traceability
  firstName: string;          // Normalized first name (lowercase, trimmed)
  lastName: string;           // Normalized last name (lowercase, trimmed)
  fullName: string;           // "firstname lastname" joined
  street: string;             // Normalized street address
  city: string;               // Normalized city
  state: string;              // 2-letter uppercase abbreviation
  zip: string;                // 5-digit zero-padded string
  // Raw fields preserved for display
  rawName: string;
  rawAddress: string;
  installer: string;           // Installer company name (ES data only, empty for LR)
  // Optional fields
  email?: string;              // Normalized email (lowercase, trimmed)
  company?: string;            // Company name (trimmed, display only)
  customerId?: string;         // Customer/account ID for grouping LR multi-address records
  submittedDate?: string;      // Raw passthrough, no parsing
  rawData?: Record<string, string>; // All raw fields for extra-column passthrough
}

/** Independent scores -- NEVER combined into a single score */
export interface MatchScores {
  addressScore: number;       // 0-1, weighted Jaro-Winkler
  nameScore: number;          // 0-1, Jaro-Winkler on full names
  emailScore: number;         // 0 or 1, exact match (case-insensitive)
  installerScore: number;     // 0-1, Jaro-Winkler on installer/licensed-org names (display only)
  // Component scores for debugging/display
  streetScore: number;        // 0-1
  cityScore: number;          // 0-1
  stateMatch: boolean;        // Exact match
  zipMatch: boolean;          // Exact match
}

/** Thresholds for classification -- adjustable by user */
export interface MatchThresholds {
  addressThreshold: number;   // Default 0.85
  nameThreshold: number;      // Default 0.82
  emailThreshold: number;     // Default 1.0 (exact match only)
}

/** Match type derived at render time from scores + thresholds */
export enum MatchType {
  FullMatch = 'full_match',
  HouseholdMatch = 'household_match',
  NoMatch = 'no_match',
}

/** A single match result: one ES record matched against one LR record */
export interface MatchResult {
  esRecord: NormalizedRecord;
  scores: MatchScores;
}

/** All matches for a single LR customer -- top 3 ranked by address score */
export interface LRCustomerResult {
  lrRecord: NormalizedRecord;
  topMatches: MatchResult[];  // Max 3, sorted descending by addressScore
}

/** The full output of a matching run */
export interface MatchingOutput {
  results: LRCustomerResult[];
  thresholds: MatchThresholds;
  metadata: {
    esRowCount: number;
    lrRowCount: number;
    durationMs: number;
    lrExtraHeaders: string[];
  };
}

/** Derive match type from scores and thresholds (pure function signature) */
export type ClassifyFn = (scores: MatchScores, thresholds: MatchThresholds) => MatchType;
