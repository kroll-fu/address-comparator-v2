import React, { useState, useMemo } from 'react';
import { useWorkflow } from '@/context/WorkflowContext';
import { WorkflowStep } from '@/types/workflow';
import { MatchType } from '@/types/matching';
import ThresholdControls from './ThresholdControls';
import SummaryStatsBar from './SummaryStatsBar';
import ResultsTable from './ResultsTable';
import ExportButtons from './ExportButtons';

export default function MatchingStep() {
  const {
    currentStep,
    matchingOutput,
    thresholds,
    isMatching,
    matchError,
    runMatch,
    setThresholds,
  } = useWorkflow();

  const [activeFilter, setActiveFilter] = useState<MatchType | 'all'>('all');
  const [installerFilter, setInstallerFilter] = useState<string>('all');

  const installerOptions = useMemo(() => {
    if (!matchingOutput) return [];
    const names = new Set<string>();
    for (const result of matchingOutput.results) {
      const top = result.topMatches[0];
      if (top && top.esRecord.installer) {
        names.add(top.esRecord.installer);
      }
    }
    return Array.from(names).sort();
  }, [matchingOutput]);

  // Show run button when at matching step but no output yet
  if (currentStep === WorkflowStep.Matching && !matchingOutput) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <button
          type="button"
          onClick={runMatch}
          disabled={isMatching}
          style={{
            backgroundColor: isMatching ? 'var(--es-gray300)' : 'var(--es-blue)',
            color: 'var(--es-white)',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: isMatching ? 'not-allowed' : 'pointer',
          }}
        >
          {isMatching ? 'Running match...' : 'Run Match'}
        </button>
        {matchError && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '13px',
          }}>
            {matchError}
          </div>
        )}
      </div>
    );
  }

  // Show results when matching output exists
  if (!matchingOutput) return null;

  return (
    <div>
      <ThresholdControls
        thresholds={thresholds}
        onThresholdsChange={setThresholds}
      />
      {installerOptions.length > 0 && (
        <div style={{ padding: '8px 0' }}>
          <select
            value={installerFilter}
            onChange={e => setInstallerFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--es-gray200)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--es-gray800)',
            }}
          >
            <option value="all">All Installers</option>
            {installerOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}
      <SummaryStatsBar
        results={matchingOutput.results}
        thresholds={thresholds}
        durationMs={matchingOutput.metadata.durationMs}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        installerFilter={installerFilter}
      />
      <ResultsTable
        results={matchingOutput.results}
        thresholds={thresholds}
        filterType={activeFilter}
        installerFilter={installerFilter}
      />
      <ExportButtons
        results={matchingOutput.results}
        thresholds={thresholds}
        installerFilter={installerFilter}
        lrExtraHeaders={matchingOutput.metadata.lrExtraHeaders}
      />
    </div>
  );
}
