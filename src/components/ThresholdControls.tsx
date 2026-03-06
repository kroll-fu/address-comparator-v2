import React from 'react';
import type { MatchThresholds } from '@/types/matching';

interface ThresholdControlsProps {
  thresholds: MatchThresholds;
  onThresholdsChange: (thresholds: MatchThresholds) => void;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function ThresholdControls({ thresholds, onThresholdsChange }: ThresholdControlsProps) {
  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'var(--es-gray50)',
      border: '1px solid var(--es-gray200)',
      borderRadius: '8px',
      marginBottom: '12px',
    }}>
      <div style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--es-gray800)',
        marginBottom: '12px',
      }}>
        Adjust Sensitivity
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '20px',
      }}>
        {/* Address Threshold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--es-gray600)',
            whiteSpace: 'nowrap',
            minWidth: '140px',
          }}>
            Address Match % ({formatPercent(thresholds.addressThreshold)})
          </label>
          <input
            type="range"
            min={0.50}
            max={1.00}
            step={0.01}
            value={thresholds.addressThreshold}
            onChange={e =>
              onThresholdsChange({
                ...thresholds,
                addressThreshold: parseFloat(e.target.value),
              })
            }
            style={{
              flex: 1,
              accentColor: 'var(--es-blue)',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Name Threshold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--es-gray600)',
            whiteSpace: 'nowrap',
            minWidth: '140px',
          }}>
            Name Match % ({formatPercent(thresholds.nameThreshold)})
          </label>
          <input
            type="range"
            min={0.50}
            max={1.00}
            step={0.01}
            value={thresholds.nameThreshold}
            onChange={e =>
              onThresholdsChange({
                ...thresholds,
                nameThreshold: parseFloat(e.target.value),
              })
            }
            style={{
              flex: 1,
              accentColor: 'var(--es-blue)',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Email Threshold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--es-gray600)',
            whiteSpace: 'nowrap',
            minWidth: '140px',
          }}>
            Email Match % ({formatPercent(thresholds.emailThreshold)})
          </label>
          <input
            type="range"
            min={0.50}
            max={1.00}
            step={0.01}
            value={thresholds.emailThreshold}
            onChange={e =>
              onThresholdsChange({
                ...thresholds,
                emailThreshold: parseFloat(e.target.value),
              })
            }
            style={{
              flex: 1,
              accentColor: 'var(--es-blue)',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>

      <div style={{
        fontSize: '11px',
        color: 'var(--es-gray400)',
        marginTop: '8px',
      }}>
        Lower values = more matches (less strict). Higher values = fewer matches (more strict).
      </div>
    </div>
  );
}
