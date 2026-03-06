import React from 'react';
import { WorkflowStep } from '@/types/workflow';
import { useWorkflow } from '@/context/WorkflowContext';
import StepIndicator from './StepIndicator';
import UploadStep from './UploadStep';
import ColumnMappingStep from './ColumnMappingStep';
import MatchingStep from './MatchingStep';

const stepOrder = [WorkflowStep.Upload, WorkflowStep.ColumnMapping, WorkflowStep.Matching, WorkflowStep.Results];

function getStepIndex(step: WorkflowStep): number {
  return stepOrder.indexOf(step);
}

export default function AppShell() {
  const { currentStep, matchingOutput, resetAll } = useWorkflow();

  function handleNewMatch() {
    if (window.confirm('Start a new match? All current results will be lost.')) {
      resetAll();
    }
  }
  const currentIndex = getStepIndex(currentStep);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--es-gray50)' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'var(--es-navy)',
        color: 'var(--es-white)',
        padding: '16px 24px',
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
          Address Comparator
        </h1>
      </header>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Upload Section — always visible */}
        <section style={{
          backgroundColor: 'var(--es-white)',
          border: '1px solid var(--es-gray200)',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '16px',
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--es-gray800)' }}>
            1. Upload Files
          </h2>
          <UploadStep />
        </section>

        {/* Column Mapping Section — visible when both files uploaded */}
        {currentIndex >= getStepIndex(WorkflowStep.ColumnMapping) && (
          <section style={{
            backgroundColor: 'var(--es-white)',
            border: '1px solid var(--es-gray200)',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '16px',
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--es-gray800)' }}>
              2. Column Mapping
            </h2>
            <ColumnMappingStep />
          </section>
        )}

        {/* Matching/Results Section — visible at matching step or later */}
        {currentIndex >= getStepIndex(WorkflowStep.Matching) && (
          <section style={{
            backgroundColor: 'var(--es-white)',
            border: '1px solid var(--es-gray200)',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--es-gray800)' }}>
                3. Results
              </h2>
              {matchingOutput && (
                <button
                  type="button"
                  onClick={handleNewMatch}
                  style={{
                    backgroundColor: 'var(--es-white)',
                    color: 'var(--es-gray600)',
                    border: '1px solid var(--es-gray300)',
                    padding: '6px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  New Match
                </button>
              )}
            </div>
            <MatchingStep />
          </section>
        )}
      </main>
    </div>
  );
}
