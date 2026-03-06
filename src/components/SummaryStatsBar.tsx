import React from 'react';
import type { LRCustomerResult, MatchThresholds } from '@/types/matching';
import { MatchType } from '@/types/matching';
import { classifyMatch } from '@/pipeline/classifier';

interface SummaryStatsBarProps {
  results: LRCustomerResult[];
  thresholds: MatchThresholds;
  durationMs: number;
  activeFilter: MatchType | 'all';
  onFilterChange: (filter: MatchType | 'all') => void;
  installerFilter: string;
}

export default function SummaryStatsBar({
  results,
  thresholds,
  durationMs,
  activeFilter,
  onFilterChange,
  installerFilter,
}: SummaryStatsBarProps) {
  let fullMatch = 0;
  let householdMatch = 0;
  let noMatch = 0;
  let total = 0;

  for (const result of results) {
    if (installerFilter !== 'all') {
      const top = result.topMatches[0];
      if (top && top.esRecord.installer !== installerFilter) continue;
      // No-match rows (no top) always counted
    }
    total++;
    if (result.topMatches.length === 0) {
      noMatch++;
      continue;
    }
    const mt = classifyMatch(result.topMatches[0].scores, thresholds);
    if (mt === MatchType.FullMatch) fullMatch++;
    else if (mt === MatchType.HouseholdMatch) householdMatch++;
    else noMatch++;
  }
  const durationSec = (durationMs / 1000).toFixed(1);

  const chips: { label: string; count: number; filter: MatchType | 'all'; color: string; bg: string }[] = [
    { label: 'Total', count: total, filter: 'all', color: 'var(--es-gray800)', bg: 'var(--es-gray100)' },
    { label: 'Full Match', count: fullMatch, filter: MatchType.FullMatch, color: 'var(--es-green)', bg: 'rgba(0, 166, 81, 0.1)' },
    { label: 'Household', count: householdMatch, filter: MatchType.HouseholdMatch, color: 'var(--es-amber)', bg: 'rgba(245, 166, 35, 0.1)' },
    { label: 'No Match', count: noMatch, filter: MatchType.NoMatch, color: 'var(--es-gray400)', bg: 'var(--es-gray100)' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 0',
      flexWrap: 'wrap',
    }}>
      {chips.map(chip => {
        const isActive = activeFilter === chip.filter;
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onFilterChange(isActive ? 'all' : chip.filter)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              border: isActive ? `2px solid ${chip.color}` : '2px solid transparent',
              backgroundColor: isActive ? chip.bg : 'var(--es-gray50)',
              color: chip.color,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {chip.label}: {chip.count}
          </button>
        );
      })}
      <span style={{
        marginLeft: 'auto',
        fontSize: '12px',
        color: 'var(--es-gray400)',
      }}>
        Matched in {durationSec}s
      </span>
    </div>
  );
}
