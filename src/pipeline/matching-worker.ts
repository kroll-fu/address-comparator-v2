/**
 * Web Worker for running the O(n×m) matching off the main thread.
 * Accepts normalized records and returns results with progress updates.
 */
import { scoreRecord } from './matching-engine';
import type { NormalizedRecord, MatchResult, LRCustomerResult } from '../types/matching';

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

// Process in batches so we can report progress
const BATCH_SIZE = 50;

self.onmessage = function (e: MessageEvent<MatchWorkerRequest>) {
  const { esRecords, lrRecords } = e.data;
  const results: LRCustomerResult[] = [];
  const total = lrRecords.length;

  try {
    for (let i = 0; i < total; i++) {
      const lrRecord = lrRecords[i];
      const allMatches: MatchResult[] = [];

      for (const esRecord of esRecords) {
        const scores = scoreRecord(esRecord, lrRecord);
        allMatches.push({ esRecord, scores });
      }

      // Sort by addressScore descending and keep top 3
      allMatches.sort((a, b) => b.scores.addressScore - a.scores.addressScore);
      results.push({ lrRecord, topMatches: allMatches.slice(0, 3) });

      // Report progress every BATCH_SIZE records
      if ((i + 1) % BATCH_SIZE === 0 || i === total - 1) {
        const msg: MatchWorkerProgress = { type: 'progress', completed: i + 1, total };
        self.postMessage(msg);
      }
    }

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
