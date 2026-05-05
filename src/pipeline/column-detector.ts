export interface ColumnMapping {
  firstName?: string;   // Header name mapped to first name
  lastName?: string;    // Header name mapped to last name
  fullName?: string;    // Header name mapped to full name (alternative to first+last)
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  installer?: string;
  email?: string;
  customerId?: string;
  submittedDate?: string;
}

interface PatternEntry {
  field: keyof ColumnMapping;
  pattern: RegExp;
  priority: number; // Lower number = higher priority
}

const PATTERNS: PatternEntry[] = [
  // Name patterns — exact matches first, then "contains" for verbose headers
  { field: 'firstName', pattern: /^first[_\s-]?name$/i, priority: 1 },
  { field: 'firstName', pattern: /^fname$/i, priority: 2 },
  { field: 'firstName', pattern: /^first$/i, priority: 3 },
  { field: 'firstName', pattern: /first[_\s-]?name/i, priority: 5 },
  { field: 'lastName', pattern: /^last[_\s-]?name$/i, priority: 1 },
  { field: 'lastName', pattern: /^lname$/i, priority: 2 },
  { field: 'lastName', pattern: /^last$/i, priority: 3 },
  { field: 'lastName', pattern: /last[_\s-]?name/i, priority: 5 },
  { field: 'fullName', pattern: /^full[_\s-]?name$/i, priority: 1 },
  { field: 'fullName', pattern: /^customer[_\s-]?name$/i, priority: 2 },
  { field: 'fullName', pattern: /^customer$/i, priority: 3 },
  { field: 'fullName', pattern: /^name$/i, priority: 4 },
  // Address patterns — "Address One" / "Address 1" for street
  { field: 'street', pattern: /^street[_\s-]?address$/i, priority: 1 },
  { field: 'street', pattern: /^address[_\s-]?1$/i, priority: 2 },
  { field: 'street', pattern: /^street$/i, priority: 3 },
  { field: 'street', pattern: /^address$/i, priority: 4 },
  { field: 'street', pattern: /^addr$/i, priority: 5 },
  { field: 'street', pattern: /address[_\s-]?(one|1)$/i, priority: 6 },
  { field: 'street', pattern: /address[_\s-]?line[_\s-]?1$/i, priority: 7 },
  // City patterns
  { field: 'city', pattern: /^city$/i, priority: 1 },
  { field: 'city', pattern: /^town$/i, priority: 2 },
  { field: 'city', pattern: /city$/i, priority: 4 },
  // State patterns -- must NOT match "street"
  { field: 'state', pattern: /^state$/i, priority: 1 },
  { field: 'state', pattern: /^st$/i, priority: 2 },
  { field: 'state', pattern: /(?<!street\s)state$/i, priority: 4 },
  // Zip patterns
  { field: 'zip', pattern: /^zip[_\s-]?code$/i, priority: 1 },
  { field: 'zip', pattern: /^zip$/i, priority: 2 },
  { field: 'zip', pattern: /^postal[_\s-]?code$/i, priority: 3 },
  { field: 'zip', pattern: /^postal$/i, priority: 4 },
  { field: 'zip', pattern: /zip$/i, priority: 5 },
  // Installer patterns — also match "Licensed Organization Name"
  { field: 'installer', pattern: /^installer$/i, priority: 1 },
  { field: 'installer', pattern: /^installer[_\s-]?name$/i, priority: 2 },
  { field: 'installer', pattern: /licensed[_\s-]?org/i, priority: 3 },
  // Email patterns
  { field: 'email', pattern: /^email$/i, priority: 1 },
  { field: 'email', pattern: /^email[_\s-]?address$/i, priority: 2 },
  { field: 'email', pattern: /email$/i, priority: 4 },
  // Customer ID patterns — also match "Finco Account ID"
  { field: 'customerId', pattern: /^(customer[_\s-]?)?id$/i, priority: 1 },
  { field: 'customerId', pattern: /^finco[_\s-]?id$/i, priority: 2 },
  { field: 'customerId', pattern: /^account[_\s-]?id$/i, priority: 3 },
  { field: 'customerId', pattern: /finco[_\s-]?account[_\s-]?id$/i, priority: 4 },
  { field: 'customerId', pattern: /account[_\s-]?id$/i, priority: 5 },
  // Submitted date — ES "Submitted Date" carries lead creation timestamps
  { field: 'submittedDate', pattern: /^submitted[_\s-]?date$/i, priority: 1 },
  { field: 'submittedDate', pattern: /^submission[_\s-]?date$/i, priority: 2 },
  { field: 'submittedDate', pattern: /^lead[_\s-]?(creation|created)[_\s-]?date$/i, priority: 3 },
  { field: 'submittedDate', pattern: /^date[_\s-]?(submitted|created)$/i, priority: 4 },
  { field: 'submittedDate', pattern: /date$/i, priority: 8 }, // broad fallback
];

/**
 * Auto-detect column mappings from header names.
 * If both firstName+lastName AND fullName match, prefer firstName+lastName.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedHeaders = new Set<string>();

  // Group patterns by field and find best match for each
  const fieldMatches: Record<string, { header: string; priority: number }> = {};

  for (const header of headers) {
    const trimmed = header.trim();
    for (const { field, pattern, priority } of PATTERNS) {
      if (pattern.test(trimmed)) {
        const existing = fieldMatches[field];
        if (!existing || priority < existing.priority) {
          fieldMatches[field] = { header: trimmed, priority };
        }
      }
    }
  }

  // Resolve: if both firstName+lastName and fullName found, prefer firstName+lastName
  const hasFirstAndLast = fieldMatches['firstName'] && fieldMatches['lastName'];

  // Assign fields, avoiding duplicate header usage
  const fieldsToAssign: (keyof ColumnMapping)[] = [
    'firstName', 'lastName', 'street', 'city', 'state', 'zip', 'installer',
    'email', 'customerId', 'submittedDate',
  ];

  // Only assign fullName if firstName+lastName were not both found
  if (!hasFirstAndLast) {
    fieldsToAssign.push('fullName');
  }

  for (const field of fieldsToAssign) {
    const match = fieldMatches[field];
    if (match && !usedHeaders.has(match.header)) {
      mapping[field] = match.header;
      usedHeaders.add(match.header);
    }
  }

  return mapping;
}

/**
 * Return list of unmapped required fields.
 * Required: (firstName+lastName OR fullName), street, city, state, zip
 */
export function getRequiredColumnsMissing(mapping: ColumnMapping): string[] {
  const missing: string[] = [];

  const hasName = (mapping.firstName && mapping.lastName) || mapping.fullName;
  if (!hasName) {
    if (!mapping.firstName && !mapping.lastName && !mapping.fullName) {
      missing.push('name (first+last or full name)');
    } else if (mapping.firstName && !mapping.lastName) {
      missing.push('lastName');
    } else if (!mapping.firstName && mapping.lastName) {
      missing.push('firstName');
    }
  }

  if (!mapping.street) missing.push('street');
  if (!mapping.city) missing.push('city');
  if (!mapping.state) missing.push('state');
  if (!mapping.zip) missing.push('zip');

  return missing;
}
