import React, { useState } from 'react';
import { ColumnMapping, getRequiredColumnsMissing } from '@/pipeline/column-detector';

interface ColumnMappingPanelProps {
  label: string;
  mapping: ColumnMapping;
  headers: string[];
  onMappingChange: (mapping: ColumnMapping) => void;
}

type MappingField = keyof ColumnMapping;

interface FieldDef {
  key: MappingField;
  label: string;
}

const OPTIONAL_FIELDS = new Set<MappingField>(['installer', 'email', 'company', 'customerId']);

const ALL_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'installer', label: 'Installer' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company Name' },
  { key: 'customerId', label: 'Customer ID' },
];

function getDisplayFields(mapping: ColumnMapping): FieldDef[] {
  // If firstName AND lastName are both mapped, hide fullName
  if (mapping.firstName && mapping.lastName) {
    return ALL_FIELDS.filter(f => f.key !== 'fullName');
  }
  // If fullName is mapped, hide firstName and lastName
  if (mapping.fullName) {
    return ALL_FIELDS.filter(f => f.key !== 'firstName' && f.key !== 'lastName');
  }
  // Otherwise show all so user can choose
  return ALL_FIELDS;
}

export default function ColumnMappingPanel({ label, mapping, headers, onMappingChange }: ColumnMappingPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const missing = getRequiredColumnsMissing(mapping);
  const displayFields = getDisplayFields(mapping);

  function handleFieldChange(field: MappingField, value: string) {
    const newMapping = { ...mapping };

    if (value === '') {
      delete newMapping[field];
    } else {
      newMapping[field] = value;
    }

    // Mutual exclusion: firstName+lastName vs fullName
    if (field === 'fullName' && value) {
      delete newMapping.firstName;
      delete newMapping.lastName;
    }
    if ((field === 'firstName' || field === 'lastName') && value) {
      delete newMapping.fullName;
    }

    onMappingChange(newMapping);
  }

  return (
    <div style={{
      border: '1px solid var(--es-gray200)',
      borderRadius: '8px',
      padding: '16px',
      backgroundColor: 'var(--es-white)',
    }}>
      {/* Section header */}
      <div style={{
        fontWeight: 600,
        fontSize: '14px',
        color: 'var(--es-gray800)',
        marginBottom: '12px',
      }}>
        {label}
      </div>

      {/* Warning banner for unmapped required fields */}
      {missing.length > 0 && (
        <div style={{
          padding: '10px 12px',
          backgroundColor: 'rgba(245, 166, 35, 0.1)',
          borderLeft: '3px solid var(--es-amber)',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '13px',
          color: 'var(--es-amber)',
        }}>
          {missing.length} required column{missing.length > 1 ? 's' : ''} need mapping: {missing.join(', ')}
        </div>
      )}

      {expanded ? (
        /* Expanded view with dropdowns */
        <div>
          {ALL_FIELDS.map(field => (
            <div
              key={field.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--es-gray100)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--es-gray800)' }}>
                {field.label}
              </span>
              <select
                value={mapping[field.key] ?? ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--es-gray200)',
                  fontSize: '12px',
                  color: 'var(--es-gray800)',
                  maxWidth: '200px',
                }}
              >
                <option value="">(not mapped)</option>
                {headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: 'var(--es-blue)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: 0,
            }}
          >
            Collapse
          </button>
        </div>
      ) : (
        /* Collapsed view with checkmarks/warnings */
        <div>
          {displayFields.map(field => {
            const value = mapping[field.key];
            const isMapped = !!value;
            const isOptional = OPTIONAL_FIELDS.has(field.key);
            return (
              <div
                key={field.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0',
                  fontSize: '13px',
                }}
              >
                <span style={{
                  color: isMapped ? 'var(--es-green)' : (isOptional ? 'var(--es-gray400)' : 'var(--es-amber)'),
                  width: '16px',
                  textAlign: 'center',
                }}>
                  {isMapped ? '\u2713' : (isOptional ? '\u25CB' : '\u26A0')}
                </span>
                <span style={{ color: 'var(--es-gray800)' }}>
                  {field.label}
                </span>
                {isMapped ? (
                  <span style={{ color: 'var(--es-gray400)', marginLeft: '4px' }}>
                    &rarr; {value}
                  </span>
                ) : (
                  <span style={{ color: isOptional ? 'var(--es-gray300)' : 'var(--es-amber)', marginLeft: '4px', fontStyle: 'italic' }}>
                    &mdash; not mapped
                  </span>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: 'var(--es-blue)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: 0,
            }}
          >
            Edit mappings
          </button>
        </div>
      )}
    </div>
  );
}
