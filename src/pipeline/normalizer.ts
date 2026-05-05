import { STATE_ABBREVIATIONS } from '../data/state-abbreviations';
import type { NormalizedRecord } from '../types/matching';
import type { ColumnMapping } from './column-detector';

/**
 * Normalize a state string to 2-letter uppercase abbreviation.
 * Handles full state names, lowercase abbreviations, and passthrough.
 */
export function normalizeState(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  const lower = trimmed.toLowerCase();
  const found = STATE_ABBREVIATIONS[lower];
  if (found) return found;

  // If already 2-letter, return uppercase
  if (trimmed.length === 2) return trimmed.toUpperCase();

  // Best effort: return trimmed uppercase
  return trimmed.toUpperCase();
}

/**
 * Normalize a zip code to 5-digit zero-padded string.
 * Leading zeros are preserved (important for CT/NJ/etc).
 */
export function normalizeZip(raw: string): string {
  // Strip non-digit characters
  const digits = raw.replace(/\D/g, '');

  // Take first 5 digits
  const first5 = digits.slice(0, 5);

  // Left-pad with zeros to 5 digits
  return first5.padStart(5, '0');
}

/**
 * Normalize a name string, handling "Last, First" and "First Last" formats.
 */
export function normalizeName(raw: string): { firstName: string; lastName: string; fullName: string } {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');

  if (trimmed === '') {
    return { firstName: '', lastName: '', fullName: '' };
  }

  // Detect "Last, First" format
  if (trimmed.includes(',')) {
    const commaIdx = trimmed.indexOf(',');
    const lastName = trimmed.slice(0, commaIdx).trim();
    const firstName = trimmed.slice(commaIdx + 1).trim();
    const fullName = firstName ? `${firstName} ${lastName}` : lastName;
    return { firstName, lastName, fullName };
  }

  // "First Last" format -- split on last space
  const lastSpaceIdx = trimmed.lastIndexOf(' ');
  if (lastSpaceIdx === -1) {
    // Single word = lastName only
    return { firstName: '', lastName: trimmed, fullName: trimmed };
  }

  const firstName = trimmed.slice(0, lastSpaceIdx).trim();
  const lastName = trimmed.slice(lastSpaceIdx + 1).trim();
  const fullName = `${firstName} ${lastName}`;

  return { firstName, lastName, fullName };
}

/**
 * Normalize a raw row into a NormalizedRecord using column mapping.
 */
export function normalizeRecord(
  rawFields: Record<string, string>,
  columnMapping: ColumnMapping,
  sourceRow: number,
): NormalizedRecord {
  // Extract name
  let rawName = '';
  let firstName = '';
  let lastName = '';
  let fullName = '';

  if (columnMapping.firstName && columnMapping.lastName) {
    const rawFirst = rawFields[columnMapping.firstName] ?? '';
    const rawLast = rawFields[columnMapping.lastName] ?? '';
    rawName = `${rawFirst} ${rawLast}`.trim();
    // When given separate first/last, use them directly
    firstName = rawFirst.trim().toLowerCase();
    lastName = rawLast.trim().toLowerCase();
    fullName = `${firstName} ${lastName}`.trim();
  } else if (columnMapping.fullName) {
    rawName = rawFields[columnMapping.fullName] ?? '';
    const normalized = normalizeName(rawName);
    firstName = normalized.firstName;
    lastName = normalized.lastName;
    fullName = normalized.fullName;
  }

  // Extract address fields
  const rawStreet = rawFields[columnMapping.street ?? ''] ?? '';
  const rawCity = rawFields[columnMapping.city ?? ''] ?? '';
  const rawState = rawFields[columnMapping.state ?? ''] ?? '';
  const rawZip = rawFields[columnMapping.zip ?? ''] ?? '';

  const rawAddress = [rawStreet, rawCity, rawState, rawZip].filter(Boolean).join(', ');

  // Extract installer (preserves original casing for display)
  const rawInstaller = rawFields[columnMapping.installer ?? ''] ?? '';

  // Extract optional fields
  const email = columnMapping.email ? (rawFields[columnMapping.email] ?? '').trim().toLowerCase() : undefined;
  const company = columnMapping.company ? (rawFields[columnMapping.company] ?? '').trim() || undefined : undefined;
  const customerId = columnMapping.customerId ? (rawFields[columnMapping.customerId] ?? '').trim() || undefined : undefined;
  const submittedDate = columnMapping.submittedDate
    ? (rawFields[columnMapping.submittedDate] ?? '').trim() || undefined
    : undefined;

  return {
    sourceRow,
    firstName,
    lastName,
    fullName,
    street: rawStreet.trim().toLowerCase(),
    city: rawCity.trim().toLowerCase(),
    state: normalizeState(rawState),
    zip: normalizeZip(rawZip),
    rawName,
    rawAddress,
    installer: rawInstaller.trim(),
    ...(email !== undefined && { email }),
    ...(company !== undefined && { company }),
    ...(customerId !== undefined && { customerId }),
    ...(submittedDate !== undefined && { submittedDate }),
    rawData: rawFields,
  };
}
