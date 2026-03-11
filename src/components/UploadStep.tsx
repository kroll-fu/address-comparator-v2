import React, { useState } from 'react';
import { useWorkflow } from '@/context/WorkflowContext';
import UploadZone from './UploadZone';
import FilePreview from './FilePreview';
import { FileState } from '@/types/workflow';
import { ColumnMapping } from '@/pipeline/column-detector';

export default function UploadStep() {
  const {
    esFile,
    lrFile,
    setEsFile,
    setLrFile,
    removeEsFile,
    removeLrFile,
    swapFiles,
  } = useWorkflow();

  const [esError, setEsError] = useState<string | null>(null);
  const [lrError, setLrError] = useState<string | null>(null);

  function handleEsFile(fileState: FileState, mapping: ColumnMapping) {
    setEsError(null);
    setEsFile(fileState, mapping);
  }

  function handleLrFile(fileState: FileState, mapping: ColumnMapping) {
    setLrError(null);
    setLrFile(fileState, mapping);
  }

  function handleRemoveEs() {
    setEsError(null);
    removeEsFile();
  }

  function handleRemoveLr() {
    setLrError(null);
    removeLrFile();
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
      }}>
        {/* EnergySage Leads column */}
        <div style={{ minWidth: 0 }}>
          {esFile ? (
            <FilePreview fileState={esFile} onRemove={handleRemoveEs} />
          ) : (
            <UploadZone
              label="EnergySage Leads"
              onFileLoaded={handleEsFile}
              onError={setEsError}
            />
          )}
          {esError && (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: 'rgba(230, 57, 70, 0.1)',
              borderLeft: '3px solid var(--es-red)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--es-red)', fontSize: '13px' }}>
                {esError}
              </span>
              <button
                type="button"
                onClick={() => setEsError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--es-red)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {/* LightReach Confirms column */}
        <div style={{ minWidth: 0 }}>
          {lrFile ? (
            <FilePreview fileState={lrFile} onRemove={handleRemoveLr} />
          ) : (
            <UploadZone
              label="LightReach Confirms"
              onFileLoaded={handleLrFile}
              onError={setLrError}
            />
          )}
          {lrError && (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: 'rgba(230, 57, 70, 0.1)',
              borderLeft: '3px solid var(--es-red)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--es-red)', fontSize: '13px' }}>
                {lrError}
              </span>
              <button
                type="button"
                onClick={() => setLrError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--es-red)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Swap button — only when both files present */}
      {esFile && lrFile && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            onClick={swapFiles}
            style={{
              backgroundColor: 'var(--es-white)',
              border: '1px solid var(--es-blue)',
              color: 'var(--es-blue)',
              padding: '8px 20px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            &#8644; Swap Files
          </button>
        </div>
      )}
    </div>
  );
}
