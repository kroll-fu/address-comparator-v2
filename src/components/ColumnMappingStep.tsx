import React from 'react';
import { useWorkflow } from '@/context/WorkflowContext';
import ColumnMappingPanel from './ColumnMappingPanel';
import { getRequiredColumnsMissing } from '@/pipeline/column-detector';

export default function ColumnMappingStep() {
  const {
    esFile,
    lrFile,
    esColumnMapping,
    lrColumnMapping,
    updateEsMapping,
    updateLrMapping,
    confirmMappings,
  } = useWorkflow();

  // Only render when both files are present
  if (!esFile || !lrFile || !esColumnMapping || !lrColumnMapping) {
    return null;
  }

  const esMissing = getRequiredColumnsMissing(esColumnMapping);
  const lrMissing = getRequiredColumnsMissing(lrColumnMapping);
  const allMapped = esMissing.length === 0 && lrMissing.length === 0;

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        marginBottom: '20px',
      }}>
        <div style={{ minWidth: 0 }}>
          <ColumnMappingPanel
            label="EnergySage Leads"
            mapping={esColumnMapping}
            headers={esFile.headers}
            onMappingChange={updateEsMapping}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <ColumnMappingPanel
            label="LightReach Confirms"
            mapping={lrColumnMapping}
            headers={lrFile.headers}
            onMappingChange={updateLrMapping}
          />
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={confirmMappings}
          disabled={!allMapped}
          title={allMapped ? undefined : 'Complete column mappings to continue'}
          style={{
            backgroundColor: allMapped ? 'var(--es-blue)' : 'var(--es-gray300)',
            color: 'var(--es-white)',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: allMapped ? 'pointer' : 'not-allowed',
          }}
        >
          Confirm Mappings
        </button>
      </div>
    </div>
  );
}
