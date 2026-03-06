import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { WorkflowStep, FileState } from '@/types/workflow';
import { ColumnMapping } from '@/pipeline/column-detector';
import type { MatchingOutput, MatchThresholds, NormalizedRecord } from '@/types/matching';
import { normalizeRecord } from '@/pipeline/normalizer';
import { runMatching } from '@/pipeline/matching-engine';
import { DEFAULT_THRESHOLDS } from '@/pipeline/classifier';

export interface WorkflowContextState {
  currentStep: WorkflowStep;
  esFile: FileState | null;
  lrFile: FileState | null;
  esColumnMapping: ColumnMapping | null;
  lrColumnMapping: ColumnMapping | null;
  matchingOutput: MatchingOutput | null;
  thresholds: MatchThresholds;
  isMatching: boolean;
  matchError: string | null;
  setEsFile: (file: FileState, mapping: ColumnMapping) => void;
  setLrFile: (file: FileState, mapping: ColumnMapping) => void;
  removeEsFile: () => void;
  removeLrFile: () => void;
  swapFiles: () => void;
  updateEsMapping: (mapping: ColumnMapping) => void;
  updateLrMapping: (mapping: ColumnMapping) => void;
  confirmMappings: () => void;
  runMatch: () => void;
  setThresholds: (thresholds: MatchThresholds) => void;
  resetAll: () => void;
}

interface State {
  esFile: FileState | null;
  lrFile: FileState | null;
  esColumnMapping: ColumnMapping | null;
  lrColumnMapping: ColumnMapping | null;
  confirmed: boolean;
  matchingOutput: MatchingOutput | null;
  thresholds: MatchThresholds;
  isMatching: boolean;
  matchError: string | null;
}

type Action =
  | { type: 'SET_ES_FILE'; file: FileState; mapping: ColumnMapping }
  | { type: 'SET_LR_FILE'; file: FileState; mapping: ColumnMapping }
  | { type: 'REMOVE_ES_FILE' }
  | { type: 'REMOVE_LR_FILE' }
  | { type: 'SWAP_FILES' }
  | { type: 'UPDATE_ES_MAPPING'; mapping: ColumnMapping }
  | { type: 'UPDATE_LR_MAPPING'; mapping: ColumnMapping }
  | { type: 'CONFIRM_MAPPINGS' }
  | { type: 'RUN_MATCH_START' }
  | { type: 'RUN_MATCH_COMPLETE'; output: MatchingOutput }
  | { type: 'RUN_MATCH_ERROR'; error: string }
  | { type: 'SET_THRESHOLDS'; thresholds: MatchThresholds }
  | { type: 'RESET_ALL' };

function deriveStep(state: State): WorkflowStep {
  if (state.matchingOutput) return WorkflowStep.Results;
  if (state.confirmed) return WorkflowStep.Matching;
  if (state.esFile && state.lrFile) return WorkflowStep.ColumnMapping;
  return WorkflowStep.Upload;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_ES_FILE':
      return { ...state, esFile: action.file, esColumnMapping: action.mapping, confirmed: false, matchingOutput: null };
    case 'SET_LR_FILE':
      return { ...state, lrFile: action.file, lrColumnMapping: action.mapping, confirmed: false, matchingOutput: null };
    case 'REMOVE_ES_FILE':
      return { ...state, esFile: null, esColumnMapping: null, confirmed: false, matchingOutput: null };
    case 'REMOVE_LR_FILE':
      return { ...state, lrFile: null, lrColumnMapping: null, confirmed: false, matchingOutput: null };
    case 'SWAP_FILES':
      return {
        ...state,
        esFile: state.lrFile,
        lrFile: state.esFile,
        esColumnMapping: state.lrColumnMapping,
        lrColumnMapping: state.esColumnMapping,
        confirmed: false,
        matchingOutput: null,
      };
    case 'UPDATE_ES_MAPPING':
      return { ...state, esColumnMapping: action.mapping, confirmed: false };
    case 'UPDATE_LR_MAPPING':
      return { ...state, lrColumnMapping: action.mapping, confirmed: false };
    case 'CONFIRM_MAPPINGS':
      return { ...state, confirmed: true };
    case 'RUN_MATCH_START':
      return { ...state, isMatching: true, matchError: null };
    case 'RUN_MATCH_COMPLETE':
      return { ...state, isMatching: false, matchingOutput: action.output };
    case 'RUN_MATCH_ERROR':
      return { ...state, isMatching: false, matchError: action.error };
    case 'SET_THRESHOLDS':
      return { ...state, thresholds: action.thresholds };
    case 'RESET_ALL':
      return { ...initialState };
    default:
      return state;
  }
}

const initialState: State = {
  esFile: null,
  lrFile: null,
  esColumnMapping: null,
  lrColumnMapping: null,
  confirmed: false,
  matchingOutput: null,
  thresholds: { ...DEFAULT_THRESHOLDS },
  isMatching: false,
  matchError: null,
};

const WorkflowContext = createContext<WorkflowContextState | null>(null);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<WorkflowContextState>(() => {
    const currentStep = deriveStep(state);
    return {
      currentStep,
      esFile: state.esFile,
      lrFile: state.lrFile,
      esColumnMapping: state.esColumnMapping,
      lrColumnMapping: state.lrColumnMapping,
      matchingOutput: state.matchingOutput,
      thresholds: state.thresholds,
      isMatching: state.isMatching,
      setEsFile: (file, mapping) => dispatch({ type: 'SET_ES_FILE', file, mapping }),
      setLrFile: (file, mapping) => dispatch({ type: 'SET_LR_FILE', file, mapping }),
      removeEsFile: () => dispatch({ type: 'REMOVE_ES_FILE' }),
      removeLrFile: () => dispatch({ type: 'REMOVE_LR_FILE' }),
      swapFiles: () => dispatch({ type: 'SWAP_FILES' }),
      updateEsMapping: (mapping) => dispatch({ type: 'UPDATE_ES_MAPPING', mapping }),
      updateLrMapping: (mapping) => dispatch({ type: 'UPDATE_LR_MAPPING', mapping }),
      confirmMappings: () => dispatch({ type: 'CONFIRM_MAPPINGS' }),
      matchError: state.matchError,
      runMatch: () => {
        if (!state.esFile || !state.lrFile || !state.esColumnMapping || !state.lrColumnMapping) return;
        if (state.isMatching) return;
        dispatch({ type: 'RUN_MATCH_START' });

        try {
          const startTime = performance.now();

          // Normalize ES records
          const esRecords: NormalizedRecord[] = state.esFile.allRows.map((row, i) => {
            const rawFields: Record<string, string> = {};
            state.esFile!.headers.forEach((h, ci) => { rawFields[h] = row[ci] ?? ''; });
            return normalizeRecord(rawFields, state.esColumnMapping!, i);
          });

          // Normalize LR records
          const lrRecords: NormalizedRecord[] = state.lrFile.allRows.map((row, i) => {
            const rawFields: Record<string, string> = {};
            state.lrFile!.headers.forEach((h, ci) => { rawFields[h] = row[ci] ?? ''; });
            return normalizeRecord(rawFields, state.lrColumnMapping!, i);
          });

          // Run matching
          const results = runMatching(esRecords, lrRecords);
          const durationMs = Math.round(performance.now() - startTime);

          // Compute extra LR headers: headers not covered by the LR column mapping
          const lrMappedValues = new Set(
            Object.values(state.lrColumnMapping!).filter(Boolean) as string[]
          );
          const lrExtraHeaders = state.lrFile!.headers.filter(h => !lrMappedValues.has(h));

          const output: MatchingOutput = {
            results,
            thresholds: state.thresholds,
            metadata: {
              esRowCount: esRecords.length,
              lrRowCount: lrRecords.length,
              durationMs,
              lrExtraHeaders,
            },
          };

          dispatch({ type: 'RUN_MATCH_COMPLETE', output });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'An unexpected error occurred during matching.';
          dispatch({ type: 'RUN_MATCH_ERROR', error: message });
        }
      },
      setThresholds: (thresholds) => dispatch({ type: 'SET_THRESHOLDS', thresholds }),
      resetAll: () => dispatch({ type: 'RESET_ALL' }),
    };
  }, [state]);

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow(): WorkflowContextState {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
