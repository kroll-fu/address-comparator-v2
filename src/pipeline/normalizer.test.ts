import { describe, it, expect } from 'vitest';
import { normalizeState, normalizeZip, normalizeName, normalizeRecord } from './normalizer';

describe('normalizeState', () => {
  it('converts full state name to abbreviation', () => {
    expect(normalizeState('Connecticut')).toBe('CT');
  });

  it('is case insensitive', () => {
    expect(normalizeState('connecticut')).toBe('CT');
  });

  it('passes through 2-letter abbreviation', () => {
    expect(normalizeState('CT')).toBe('CT');
  });

  it('handles lowercase abbreviation', () => {
    expect(normalizeState('ct')).toBe('CT');
  });

  it('converts multi-word state names', () => {
    expect(normalizeState('New York')).toBe('NY');
    expect(normalizeState('New Jersey')).toBe('NJ');
    expect(normalizeState('West Virginia')).toBe('WV');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeState('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeState('  Connecticut  ')).toBe('CT');
  });
});

describe('normalizeZip', () => {
  it('preserves Connecticut zip with leading zero', () => {
    expect(normalizeZip('06510')).toBe('06510');
  });

  it('pads short zip with leading zero', () => {
    expect(normalizeZip('6510')).toBe('06510');
  });

  it('leaves 5-digit zip unchanged', () => {
    expect(normalizeZip('90210')).toBe('90210');
  });

  it('strips extended zip code', () => {
    expect(normalizeZip('90210-1234')).toBe('90210');
  });

  it('handles empty string', () => {
    expect(normalizeZip('')).toBe('00000');
  });

  it('strips non-digit characters', () => {
    expect(normalizeZip('0 6 5 1 0')).toBe('06510');
  });
});

describe('normalizeName', () => {
  it('handles "First Last" format', () => {
    const result = normalizeName('John Smith');
    expect(result).toEqual({
      firstName: 'john',
      lastName: 'smith',
      fullName: 'john smith',
    });
  });

  it('handles "Last, First" format', () => {
    const result = normalizeName('Smith, John');
    expect(result).toEqual({
      firstName: 'john',
      lastName: 'smith',
      fullName: 'john smith',
    });
  });

  it('handles single-word name as lastName', () => {
    const result = normalizeName('Smith');
    expect(result).toEqual({
      firstName: '',
      lastName: 'smith',
      fullName: 'smith',
    });
  });

  it('trims and normalizes whitespace', () => {
    const result = normalizeName('  John   Smith  ');
    expect(result).toEqual({
      firstName: 'john',
      lastName: 'smith',
      fullName: 'john smith',
    });
  });

  it('handles multi-word first name', () => {
    const result = normalizeName('Mary Jane Watson');
    expect(result).toEqual({
      firstName: 'mary jane',
      lastName: 'watson',
      fullName: 'mary jane watson',
    });
  });

  it('handles empty string', () => {
    const result = normalizeName('');
    expect(result).toEqual({
      firstName: '',
      lastName: '',
      fullName: '',
    });
  });
});

describe('normalizeRecord', () => {
  it('normalizes a full record with all fields', () => {
    const rawFields = {
      'First Name': 'John',
      'Last Name': 'Smith',
      'Street Address': '140 Compo Road South',
      'City': 'Westport',
      'State': 'Connecticut',
      'Zip Code': '6880',
    };

    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Street Address',
      city: 'City',
      state: 'State',
      zip: 'Zip Code',
    };

    const result = normalizeRecord(rawFields, mapping, 0);

    expect(result.firstName).toBe('john');
    expect(result.lastName).toBe('smith');
    expect(result.fullName).toBe('john smith');
    expect(result.street).toBe('140 compo road south');
    expect(result.city).toBe('westport');
    expect(result.state).toBe('CT');
    expect(result.zip).toBe('06880');
    expect(result.sourceRow).toBe(0);
    expect(result.rawName).toBe('John Smith');
  });

  it('populates installer field preserving original casing', () => {
    const rawFields = {
      'First Name': 'John',
      'Last Name': 'Smith',
      'Street Address': '123 Main St',
      'City': 'Westport',
      'State': 'CT',
      'Zip Code': '06880',
      'Installer': 'SunRun Solar',
    };

    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Street Address',
      city: 'City',
      state: 'State',
      zip: 'Zip Code',
      installer: 'Installer',
    };

    const result = normalizeRecord(rawFields, mapping, 0);

    expect(result.installer).toBe('SunRun Solar');
  });

  it('passes Submitted Date through as a raw trimmed string', () => {
    const rawFields = {
      'First Name': 'John',
      'Last Name': 'Smith',
      'Street Address': '123 Main St',
      'City': 'Westport',
      'State': 'CT',
      'Zip Code': '06880',
      'Submitted Date': '  2025-01-15  ',
    };
    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Street Address',
      city: 'City',
      state: 'State',
      zip: 'Zip Code',
      submittedDate: 'Submitted Date',
    };
    const result = normalizeRecord(rawFields, mapping, 0);
    expect(result.submittedDate).toBe('2025-01-15');
  });

  it('omits submittedDate when not mapped', () => {
    const rawFields = {
      'First Name': 'John',
      'Last Name': 'Smith',
      'Street Address': '123 Main St',
      'City': 'Westport',
      'State': 'CT',
      'Zip Code': '06880',
    };
    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Street Address',
      city: 'City',
      state: 'State',
      zip: 'Zip Code',
    };
    const result = normalizeRecord(rawFields, mapping, 0);
    expect(result.submittedDate).toBeUndefined();
  });

  it('treats empty Submitted Date as undefined', () => {
    const rawFields = {
      'First Name': 'John',
      'Last Name': 'Smith',
      'Street Address': '123 Main St',
      'City': 'Westport',
      'State': 'CT',
      'Zip Code': '06880',
      'Submitted Date': '   ',
    };
    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Street Address',
      city: 'City',
      state: 'State',
      zip: 'Zip Code',
      submittedDate: 'Submitted Date',
    };
    const result = normalizeRecord(rawFields, mapping, 0);
    expect(result.submittedDate).toBeUndefined();
  });

  it('normalizes a record with fullName column', () => {
    const rawFields = {
      'Customer': 'Abu Daniel',
      'Address': '174 Fort Lee Road',
      'City': 'Leonia',
      'State': 'New Jersey',
    };

    const mapping = {
      fullName: 'Customer',
      street: 'Address',
      city: 'City',
      state: 'State',
    };

    const result = normalizeRecord(rawFields, mapping, 5);

    expect(result.firstName).toBe('abu');
    expect(result.lastName).toBe('daniel');
    expect(result.fullName).toBe('abu daniel');
    expect(result.street).toBe('174 fort lee road');
    expect(result.city).toBe('leonia');
    expect(result.state).toBe('NJ');
    expect(result.zip).toBe('00000'); // No zip in LR data
    expect(result.sourceRow).toBe(5);
  });
});
