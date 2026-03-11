import { describe, it, expect } from 'vitest';
import { detectColumns, getRequiredColumnsMissing } from './column-detector';

describe('detectColumns', () => {
  it('detects typical EnergySage headers', () => {
    const headers = ['First Name', 'Last Name', 'Street Address', 'City', 'State', 'Zip Code', 'Email', 'Installer'];
    const mapping = detectColumns(headers);

    expect(mapping.firstName).toBe('First Name');
    expect(mapping.lastName).toBe('Last Name');
    expect(mapping.street).toBe('Street Address');
    expect(mapping.city).toBe('City');
    expect(mapping.state).toBe('State');
    expect(mapping.zip).toBe('Zip Code');
    expect(mapping.fullName).toBeUndefined(); // firstName+lastName preferred
  });

  it('detects typical LightReach headers with full name', () => {
    const headers = ['Customer', 'Address', 'City', 'State', 'Zip', 'Contract Date'];
    const mapping = detectColumns(headers);

    expect(mapping.fullName).toBe('Customer');
    expect(mapping.street).toBe('Address');
    expect(mapping.city).toBe('City');
    expect(mapping.state).toBe('State');
    expect(mapping.zip).toBe('Zip');
  });

  it('detects underscore-style headers', () => {
    const headers = ['first_name', 'last_name', 'address', 'city', 'state', 'zip'];
    const mapping = detectColumns(headers);

    expect(mapping.firstName).toBe('first_name');
    expect(mapping.lastName).toBe('last_name');
    expect(mapping.street).toBe('address');
    expect(mapping.city).toBe('city');
    expect(mapping.state).toBe('state');
    expect(mapping.zip).toBe('zip');
  });

  it('prefers firstName+lastName over fullName when both present', () => {
    const headers = ['First Name', 'Last Name', 'Name', 'Address', 'City', 'State', 'Zip'];
    const mapping = detectColumns(headers);

    expect(mapping.firstName).toBe('First Name');
    expect(mapping.lastName).toBe('Last Name');
    expect(mapping.fullName).toBeUndefined();
  });

  it('detects installer header', () => {
    const headers = ['First Name', 'Last Name', 'Street', 'City', 'State', 'Zip', 'Installer'];
    const mapping = detectColumns(headers);

    expect(mapping.installer).toBe('Installer');
  });

  it('detects company name as company field', () => {
    const headers = ['Name', 'Address', 'City', 'State', 'Zip', 'Company Name'];
    const mapping = detectColumns(headers);

    expect(mapping.company).toBe('Company Name');
    expect(mapping.installer).toBeUndefined();
  });

  it('detects verbose LightReach headers', () => {
    const headers = [
      'Finco Account ID',
      'Primary Applicant Address One',
      'Primary Applicant City',
      'Primary Applicant State',
      'Primary Applicant Zip',
      'Primary Applicant First Name',
      'Primary Applicant Last Name',
      'Primary Applicant Email',
      'Licensed Organization Name',
      'Organization Name',
      'Sales Member Email Address',
      'Account Created At Date',
      'Notice to Proceed Approved At Date',
      'Install Approved At Date',
      'System Activation Approved At Date',
      'Primary Applicant Address Two',
    ];
    const mapping = detectColumns(headers);

    expect(mapping.firstName).toBe('Primary Applicant First Name');
    expect(mapping.lastName).toBe('Primary Applicant Last Name');
    expect(mapping.street).toBe('Primary Applicant Address One');
    expect(mapping.city).toBe('Primary Applicant City');
    expect(mapping.state).toBe('Primary Applicant State');
    expect(mapping.zip).toBe('Primary Applicant Zip');
    expect(mapping.email).toBe('Primary Applicant Email');
    expect(mapping.customerId).toBe('Finco Account ID');
    expect(mapping.installer).toBe('Licensed Organization Name');
    expect(mapping.company).toBe('Organization Name');
    expect(mapping.fullName).toBeUndefined(); // firstName+lastName preferred
  });

  it('handles headers with no matches', () => {
    const headers = ['Column1', 'Column2', 'Column3'];
    const mapping = detectColumns(headers);

    expect(mapping.firstName).toBeUndefined();
    expect(mapping.lastName).toBeUndefined();
    expect(mapping.fullName).toBeUndefined();
    expect(mapping.street).toBeUndefined();
  });
});

describe('getRequiredColumnsMissing', () => {
  it('returns empty array when all fields mapped with first+last', () => {
    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
      street: 'Address',
      city: 'City',
      state: 'State',
      zip: 'Zip',
    };
    expect(getRequiredColumnsMissing(mapping)).toEqual([]);
  });

  it('returns empty array when all fields mapped with fullName', () => {
    const mapping = {
      fullName: 'Customer',
      street: 'Address',
      city: 'City',
      state: 'State',
      zip: 'Zip',
    };
    expect(getRequiredColumnsMissing(mapping)).toEqual([]);
  });

  it('reports missing fields', () => {
    const mapping = {
      firstName: 'First Name',
      lastName: 'Last Name',
    };
    const missing = getRequiredColumnsMissing(mapping);

    expect(missing).toContain('street');
    expect(missing).toContain('city');
    expect(missing).toContain('state');
    expect(missing).toContain('zip');
  });

  it('reports missing name when no name fields mapped', () => {
    const mapping = {
      street: 'Address',
      city: 'City',
      state: 'State',
      zip: 'Zip',
    };
    const missing = getRequiredColumnsMissing(mapping);
    expect(missing).toContain('name (first+last or full name)');
  });

  it('reports missing lastName when only firstName mapped', () => {
    const mapping = {
      firstName: 'First',
      street: 'Address',
      city: 'City',
      state: 'State',
      zip: 'Zip',
    };
    const missing = getRequiredColumnsMissing(mapping);
    expect(missing).toContain('lastName');
  });
});
