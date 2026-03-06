import React, { useEffect } from 'react';
import { applyTheme } from '@/theme/energysage';
import { WorkflowProvider } from '@/context/WorkflowContext';
import AppShell from '@/components/AppShell';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <ErrorBoundary>
      <WorkflowProvider>
        <AppShell />
      </WorkflowProvider>
    </ErrorBoundary>
  );
}
