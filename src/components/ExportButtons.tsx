import React, { useMemo } from 'react';
import type { LRCustomerResult, MatchThresholds } from '@/types/matching';
import { exportMatchesToCSV, exportAllToCSV } from '@/pipeline/csv-exporter';

interface ExportButtonsProps {
  results: LRCustomerResult[];
  thresholds: MatchThresholds;
  installerFilter: string;
  lrExtraHeaders?: string[];
}

function triggerDownload(csvString: string, filename: string) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getDateStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ExportButtons({ results, thresholds, installerFilter, lrExtraHeaders = [] }: ExportButtonsProps) {
  const filteredResults = useMemo(() => {
    if (installerFilter === 'all') return results;
    return results.filter(r => {
      const top = r.topMatches[0];
      if (!top) return true; // Keep no-match rows (consistent with ResultsTable)
      return top.esRecord.installer === installerFilter;
    });
  }, [results, installerFilter]);

  function handleExportMatches() {
    const csv = exportMatchesToCSV(filteredResults, thresholds, lrExtraHeaders);
    triggerDownload(csv, `address-matches-${getDateStamp()}.csv`);
  }

  function handleExportAll() {
    const csv = exportAllToCSV(filteredResults, thresholds, lrExtraHeaders);
    triggerDownload(csv, `address-matches-all-${getDateStamp()}.csv`);
  }

  const primaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--es-blue)',
    color: 'var(--es-white)',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const secondaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--es-white)',
    color: 'var(--es-blue)',
    border: '1px solid var(--es-blue)',
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '16px',
    }}>
      <button type="button" onClick={handleExportAll} style={secondaryStyle}>
        Export All
      </button>
      <button type="button" onClick={handleExportMatches} style={primaryStyle}>
        Export Matches
      </button>
    </div>
  );
}
