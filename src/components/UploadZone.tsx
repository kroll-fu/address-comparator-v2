import React, { useRef, useState } from 'react';
import { FileState } from '@/types/workflow';
import { ColumnMapping } from '@/pipeline/column-detector';
import { parseFile } from '@/pipeline/file-parser';
import { detectColumns } from '@/pipeline/column-detector';

interface UploadZoneProps {
  label: string;
  onFileLoaded: (fileState: FileState, mapping: ColumnMapping) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.substring(idx).toLowerCase() : '';
}

export default function UploadZone({ label, onFileLoaded, onError, disabled }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      onError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`);
      return;
    }

    const ext = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      onError('Unsupported file format. Please upload a CSV or XLSX file.');
      return;
    }

    setLoading(true);
    try {
      const result = await parseFile(file);

      if (result.headers.length === 0 && result.rows.length === 0) {
        onError('This file appears to be empty.');
        return;
      }

      if (result.headers.length > 0 && result.rows.length === 0) {
        onError('This file has headers but no data rows.');
        return;
      }

      const mapping = detectColumns(result.headers);
      const fileState: FileState = {
        name: file.name,
        rowCount: result.rows.length,
        headers: result.headers,
        previewRows: result.rows.slice(0, 3),
        allRows: result.rows,
      };

      onFileLoaded(fileState, mapping);
    } catch {
      onError('Failed to parse file. Please check the file format.');
    } finally {
      setLoading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }

  const borderColor = dragActive ? 'var(--es-blue)' : 'var(--es-gray200)';
  const bgColor = dragActive ? 'rgba(0, 115, 230, 0.04)' : 'var(--es-white)';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${borderColor}`,
        borderRadius: '8px',
        padding: '32px 24px',
        textAlign: 'center',
        minHeight: '150px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        backgroundColor: bgColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--es-gray800)' }}>
        {label}
      </div>

      {loading ? (
        <div style={{ color: 'var(--es-gray400)', fontSize: '13px' }}>
          Processing file...
        </div>
      ) : (
        <>
          <div style={{ color: 'var(--es-gray400)', fontSize: '13px' }}>
            Drag &amp; drop CSV or XLSX file here
          </div>
          <div style={{ color: 'var(--es-gray300)', fontSize: '12px' }}>or</div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              backgroundColor: 'var(--es-white)',
              border: '1px solid var(--es-blue)',
              color: 'var(--es-blue)',
              padding: '8px 20px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Browse Files
          </button>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
