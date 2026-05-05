/**
 * Jaro-Winkler string similarity algorithm.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * Implemented from scratch -- no external dependency needed.
 */
export function jaroWinkler(s1: string, s2: string): number {
  // Handle edge cases
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  if (s1 === s2) return 1;

  const jaro = jaroSimilarity(s1, s2);

  // Winkler prefix bonus: up to 4 common prefix characters
  let commonPrefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      commonPrefix++;
    } else {
      break;
    }
  }

  const winkler = jaro + commonPrefix * 0.1 * (1 - jaro);

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, winkler));
}

// Module-scoped workspaces shared by all calls into jaroSimilarity in this
// module instance. Safe today because matching runs in a single web worker
// (WorkflowContext terminates any prior worker before launching a new one)
// and JS is single-threaded — no concurrent reentry possible. If anyone ever
// parallelises matching across multiple workers in the same process, each
// worker gets its own module instance and these stay isolated. But do NOT
// invoke jaroWinkler concurrently within one execution context (e.g. from
// async tasks sharing this module) — the workspaces will collide silently.
const JW_MAX_LEN = 256;
const s1WorkspaceFixed = new Uint8Array(JW_MAX_LEN);
const s2WorkspaceFixed = new Uint8Array(JW_MAX_LEN);

/**
 * Jaro similarity (the base for Jaro-Winkler).
 * Uses module-scoped Uint8Array workspaces to avoid per-call allocations.
 * For inputs longer than JW_MAX_LEN, allocates fresh — graceful degradation.
 */
function jaroSimilarity(s1: string, s2: string): number {
  const s1Len = s1.length;
  const s2Len = s2.length;

  // Match window
  const matchWindow = Math.max(0, Math.floor(Math.max(s1Len, s2Len) / 2) - 1);

  // Acquire workspaces — reuse fixed buffers when within size limit, else allocate
  const s1Matches = s1Len <= JW_MAX_LEN ? s1WorkspaceFixed : new Uint8Array(s1Len);
  const s2Matches = s2Len <= JW_MAX_LEN ? s2WorkspaceFixed : new Uint8Array(s2Len);
  s1Matches.fill(0, 0, s1Len);
  s2Matches.fill(0, 0, s2Len);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1Len; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2Len);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = 1;
      s2Matches[j] = 1;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1Len; i++) {
    if (!s1Matches[i]) continue;
    while (k < s2Len && !s2Matches[k]) k++;
    if (k >= s2Len) break;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1Len + matches / s2Len + (matches - transpositions / 2) / matches) / 3
  );
}
