import React, { useState, useMemo } from 'react';
import type { LRCustomerResult, MatchThresholds } from '@/types/matching';
import { MatchType } from '@/types/matching';
import { classifyMatch } from '@/pipeline/classifier';

interface ResultsTableProps {
  results: LRCustomerResult[];
  thresholds: MatchThresholds;
  filterType: MatchType | 'all';
  installerFilter: string;
}

type SortField = 'matchType' | 'addressScore' | 'nameScore' | 'emailScore' | 'lrName' | 'lrAddress' | 'esName' | 'esAddress';

const MATCH_TYPE_ORDER: Record<MatchType, number> = {
  [MatchType.FullMatch]: 0,
  [MatchType.HouseholdMatch]: 1,
  [MatchType.NoMatch]: 2,
};

const MATCH_BADGE_COLORS: Record<MatchType, { bg: string; text: string }> = {
  [MatchType.FullMatch]: { bg: 'rgba(0, 166, 81, 0.12)', text: 'var(--es-green)' },
  [MatchType.HouseholdMatch]: { bg: 'rgba(245, 166, 35, 0.12)', text: 'var(--es-amber)' },
  [MatchType.NoMatch]: { bg: 'var(--es-gray100)', text: 'var(--es-gray400)' },
};

const MATCH_LABELS: Record<MatchType, string> = {
  [MatchType.FullMatch]: 'Full Match',
  [MatchType.HouseholdMatch]: 'Household',
  [MatchType.NoMatch]: 'No Match',
};

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function scoreColor(score: number): string {
  if (score >= 0.85) return 'var(--es-green)';
  if (score >= 0.70) return 'var(--es-amber)';
  return 'var(--es-gray400)';
}

function getSortValue(result: LRCustomerResult, field: SortField, thresholds: MatchThresholds): string | number {
  const top = result.topMatches[0];
  switch (field) {
    case 'matchType': return top ? MATCH_TYPE_ORDER[classifyMatch(top.scores, thresholds)] : 3;
    case 'addressScore': return top ? top.scores.addressScore : 0;
    case 'nameScore': return top ? top.scores.nameScore : 0;
    case 'emailScore': return top ? top.scores.emailScore : 0;
    case 'lrName': return result.lrRecord.rawName.toLowerCase();
    case 'lrAddress': return result.lrRecord.rawAddress.toLowerCase();
    case 'esName': return top ? top.esRecord.rawName.toLowerCase() : '';
    case 'esAddress': return top ? top.esRecord.rawAddress.toLowerCase() : '';
  }
}

export default function ResultsTable({ results, thresholds, filterType, installerFilter }: ResultsTableProps) {
  const [sortField, setSortField] = useState<SortField>('addressScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const processed = useMemo(() => {
    let filtered = results;

    // Filter by match type
    if (filterType !== 'all') {
      filtered = filtered.filter(r => {
        if (r.topMatches.length === 0) return filterType === MatchType.NoMatch;
        return classifyMatch(r.topMatches[0].scores, thresholds) === filterType;
      });
    }

    // Filter by installer
    if (installerFilter !== 'all') {
      filtered = filtered.filter(r => {
        const top = r.topMatches[0];
        if (!top) return true; // No-match rows always visible
        return top.esRecord.installer === installerFilter;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        const top = r.topMatches[0];
        return (
          r.lrRecord.rawName.toLowerCase().includes(q) ||
          r.lrRecord.rawAddress.toLowerCase().includes(q) ||
          (r.lrRecord.email ?? '').includes(q) ||
          (top && top.esRecord.rawName.toLowerCase().includes(q)) ||
          (top && top.esRecord.rawAddress.toLowerCase().includes(q))
        );
      });
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortField, thresholds);
      const bv = getSortValue(b, sortField, thresholds);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    // Group by customerId: if any result has a customerId, group rows with same customerId
    // together (the first occurrence stays in place, subsequent ones come right after)
    const seenCustomerIds = new Set<string>();
    const grouped: LRCustomerResult[] = [];

    for (const result of sorted) {
      const cid = result.lrRecord.customerId;
      if (!cid || !seenCustomerIds.has(cid)) {
        grouped.push(result);
        if (cid) seenCustomerIds.add(cid);
      }
    }

    // Insert grouped siblings right after their first occurrence
    const finalOrder: LRCustomerResult[] = [];
    const addedIndices = new Set<number>();

    for (let i = 0; i < grouped.length; i++) {
      const result = grouped[i];
      finalOrder.push(result);
      addedIndices.add(i);

      const cid = result.lrRecord.customerId;
      if (cid) {
        // Find all other sorted results with same customerId
        for (const sibling of sorted) {
          if (sibling !== result && sibling.lrRecord.customerId === cid && !finalOrder.includes(sibling)) {
            finalOrder.push(sibling);
          }
        }
      }
    }

    return finalOrder;
  }, [results, thresholds, filterType, installerFilter, searchQuery, sortField, sortDir]);

  // Build a map from customerId -> first result with that id (to know group boundaries)
  const customerGroupFirsts = useMemo(() => {
    const map = new Map<string, LRCustomerResult>();
    for (const r of processed) {
      const cid = r.lrRecord.customerId;
      if (cid && !map.has(cid)) map.set(cid, r);
    }
    return map;
  }, [processed]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'addressScore' || field === 'nameScore' || field === 'emailScore' ? 'desc' : 'asc');
    }
  }

  function renderSortArrow(field: SortField) {
    if (sortField !== field) return null;
    return <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--es-gray600)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    backgroundColor: 'var(--es-gray50)',
    borderBottom: '2px solid var(--es-gray200)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '12px',
    color: 'var(--es-gray800)',
    borderBottom: '1px solid var(--es-gray100)',
    whiteSpace: 'nowrap',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  function renderBadge(matchType: MatchType) {
    const colors = MATCH_BADGE_COLORS[matchType];
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '10px',
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: '11px',
        fontWeight: 600,
      }}>
        {MATCH_LABELS[matchType]}
      </span>
    );
  }

  function renderRow(result: LRCustomerResult, index: number, isAlternative?: boolean, altRank?: number) {
    const top = isAlternative ? result.topMatches[altRank! - 1] : result.topMatches[0];
    if (!top) return null;

    const matchType = classifyMatch(top.scores, thresholds);
    const cid = result.lrRecord.customerId;
    const isGroupFirst = cid ? customerGroupFirsts.get(cid) === result : false;
    const isGroupMember = !!cid && !isGroupFirst;

    // Add a top border to separate customer groups
    const groupBorderStyle = isGroupFirst && index > 0 ? { borderTop: '2px solid var(--es-gray300)' } : {};
    const bgColor = isAlternative
      ? 'var(--es-gray50)'
      : isGroupMember
        ? 'rgba(0, 120, 210, 0.04)'
        : (index % 2 === 0 ? 'var(--es-white)' : 'var(--es-gray50)');

    return (
      <tr key={isAlternative ? `${index}-alt-${altRank}` : index} style={{ backgroundColor: bgColor }}>
        <td style={{ ...tdStyle, paddingLeft: isAlternative ? '36px' : (isGroupMember ? '28px' : '12px'), ...groupBorderStyle }}>
          {isAlternative && (
            <span style={{ color: 'var(--es-gray400)', fontSize: '10px', marginRight: '4px' }}>#{altRank}</span>
          )}
          {isGroupMember && !isAlternative && (
            <span style={{ color: 'var(--es-gray400)', fontSize: '10px', marginRight: '4px' }}>↳</span>
          )}
          {renderBadge(matchType)}
        </td>
        <td style={{ ...tdStyle, color: scoreColor(top.scores.addressScore), fontWeight: 500, ...groupBorderStyle }}>
          {formatPercent(top.scores.addressScore)}
        </td>
        <td style={{ ...tdStyle, color: scoreColor(top.scores.nameScore), fontWeight: 500, ...groupBorderStyle }}>
          {formatPercent(top.scores.nameScore)}
        </td>
        <td style={{ ...tdStyle, color: top.scores.emailScore >= 1 ? 'var(--es-green)' : 'var(--es-gray400)', fontWeight: 500, ...groupBorderStyle }}>
          {formatPercent(top.scores.emailScore)}
        </td>
        <td style={{ ...tdStyle, color: scoreColor(top.scores.companyScore), fontWeight: 500, ...groupBorderStyle }}>
          {formatPercent(top.scores.companyScore)}
        </td>
        {!isAlternative ? (
          <>
            <td style={{ ...tdStyle, ...groupBorderStyle }}>{result.lrRecord.rawName}</td>
            <td style={{ ...tdStyle, ...groupBorderStyle }}>{result.lrRecord.rawAddress}</td>
          </>
        ) : (
          <>
            <td style={{ ...tdStyle, color: 'var(--es-gray300)', ...groupBorderStyle }}>--</td>
            <td style={{ ...tdStyle, color: 'var(--es-gray300)', ...groupBorderStyle }}>--</td>
          </>
        )}
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.rawName}</td>
        <td style={{ ...tdStyle, ...groupBorderStyle }}>{top.esRecord.rawAddress}</td>
        <td style={{ ...tdStyle, ...groupBorderStyle }}>
          {!isAlternative && result.topMatches.length > 1 && (
            <button
              type="button"
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--es-blue)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: 0,
              }}
            >
              {expandedIndex === index ? 'Collapse' : `${result.topMatches.length - 1} more`}
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or address..."
          style={{
            width: '100%',
            maxWidth: '360px',
            padding: '8px 12px',
            border: '1px solid var(--es-gray200)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--es-gray800)',
            outline: 'none',
          }}
        />
      </div>

      {/* Table */}
      {processed.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--es-gray400)', fontSize: '14px' }}>
          No results match your filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('matchType')}>Match Type{renderSortArrow('matchType')}</th>
                <th style={thStyle} onClick={() => handleSort('addressScore')}>Addr %{renderSortArrow('addressScore')}</th>
                <th style={thStyle} onClick={() => handleSort('nameScore')}>Name %{renderSortArrow('nameScore')}</th>
                <th style={thStyle} onClick={() => handleSort('emailScore')}>Email %{renderSortArrow('emailScore')}</th>
                <th style={{ ...thStyle, cursor: 'default' }}>Company %</th>
                <th style={thStyle} onClick={() => handleSort('lrName')}>LR Name{renderSortArrow('lrName')}</th>
                <th style={thStyle} onClick={() => handleSort('lrAddress')}>LR Address{renderSortArrow('lrAddress')}</th>
                <th style={thStyle} onClick={() => handleSort('esName')}>ES Name{renderSortArrow('esName')}</th>
                <th style={thStyle} onClick={() => handleSort('esAddress')}>ES Address{renderSortArrow('esAddress')}</th>
                <th style={{ ...thStyle, cursor: 'default' }}></th>
              </tr>
            </thead>
            <tbody>
              {processed.map((result, i) => (
                <React.Fragment key={i}>
                  {renderRow(result, i)}
                  {expandedIndex === i && result.topMatches.length > 1 && (
                    <>
                      {result.topMatches.slice(1).map((_, altIdx) =>
                        renderRow(result, i, true, altIdx + 2)
                      )}
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
