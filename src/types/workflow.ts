export enum WorkflowStep {
  Upload = 'upload',
  ColumnMapping = 'column_mapping',
  Matching = 'matching',
  Results = 'results',
}

export interface WorkflowState {
  currentStep: WorkflowStep;
  esFile: FileState | null;
  lrFile: FileState | null;
  matchingOutput: null; // Typed as MatchingOutput | null in Phase 2 when wired
}

export interface FileState {
  name: string;
  rowCount: number;
  headers: string[];
  previewRows: string[][]; // First 3 rows for verification
  allRows: string[][];     // All data rows for matching
}
