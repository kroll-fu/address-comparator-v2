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
