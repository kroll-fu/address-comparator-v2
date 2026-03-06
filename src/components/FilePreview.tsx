import React from 'react';
import { FileState } from '@/types/workflow';

interface FilePreviewProps {
  fileState: FileState;
  onRemove: () => void;
}

export default function FilePreview({ fileState, onRemove }: FilePreviewProps) {
  return (
    <div style={{
      border: '1px solid var(--es-gray200)',
      borderRadius: '8px',
      padding: '16px',
      backgroundColor: 'var(--es-white)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--es-gray800)' }}>
            {fileState.name}
          </span>
          <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--es-gray400)' }}>
            {fileState.rowCount} rows
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--es-red)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            padding: '4px 8px',
          }}
        >
          Remove
        </button>
      </div>

      {/* Preview table */}
      {fileState.previewRows.length === 0 ? (
        <div style={{ color: 'var(--es-gray400)', fontSize: '13px', fontStyle: 'italic' }}>
          No data rows
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
          }}>
            <thead>
              <tr>
                {fileState.headers.map((header, i) => (
                  <th
                    key={i}
                    style={{
                      backgroundColor: 'var(--es-gray100)',
                      border: '1px solid var(--es-gray200)',
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--es-gray800)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fileState.previewRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: '1px solid var(--es-gray200)',
                        padding: '5px 10px',
                        color: 'var(--es-gray600)',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
