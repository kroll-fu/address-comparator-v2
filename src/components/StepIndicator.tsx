import React from 'react';
import { WorkflowStep } from '@/types/workflow';

const STEPS = [
  { key: WorkflowStep.Upload, label: 'Upload' },
  { key: WorkflowStep.ColumnMapping, label: 'Column Mapping' },
  { key: WorkflowStep.Matching, label: 'Matching' },
  { key: WorkflowStep.Results, label: 'Results' },
];

const stepOrder = [WorkflowStep.Upload, WorkflowStep.ColumnMapping, WorkflowStep.Matching, WorkflowStep.Results];

function getStepIndex(step: WorkflowStep): number {
  return stepOrder.indexOf(step);
}

interface StepIndicatorProps {
  currentStep: WorkflowStep;
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0',
      padding: '16px 24px',
      backgroundColor: 'var(--es-white)',
      borderBottom: '1px solid var(--es-gray200)',
    }}>
      {STEPS.map((step, i) => {
        const stepIndex = getStepIndex(step.key);
        const isCompleted = stepIndex < currentIndex;
        const isCurrent = stepIndex === currentIndex;
        const isFuture = stepIndex > currentIndex;

        let circleColor = 'var(--es-gray300)';
        let textColor = 'var(--es-gray400)';
        if (isCompleted) {
          circleColor = 'var(--es-green)';
          textColor = 'var(--es-gray600)';
        } else if (isCurrent) {
          circleColor = 'var(--es-blue)';
          textColor = 'var(--es-gray800)';
        }

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div style={{
                flex: '1',
                height: '2px',
                maxWidth: '80px',
                backgroundColor: isCompleted ? 'var(--es-green)' : 'var(--es-gray300)',
              }} />
            )}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              minWidth: '80px',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: circleColor,
                color: 'var(--es-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
              }}>
                {isCompleted ? '\u2713' : i + 1}
              </div>
              <span style={{
                fontSize: '12px',
                fontWeight: isCurrent ? 600 : 400,
                color: textColor,
              }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
