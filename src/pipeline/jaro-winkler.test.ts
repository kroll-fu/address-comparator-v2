import { describe, it, expect } from 'vitest';
import { jaroWinkler } from './jaro-winkler';

describe('jaroWinkler', () => {
  it('returns ~0.961 for "martha" vs "marhta" (classic example)', () => {
    const score = jaroWinkler('martha', 'marhta');
    expect(score).toBeCloseTo(0.961, 2);
  });

  it('returns 1.0 for identical strings', () => {
    expect(jaroWinkler('john', 'john')).toBe(1.0);
  });

  it('returns 0 for empty vs non-empty', () => {
    expect(jaroWinkler('', 'test')).toBe(0);
    expect(jaroWinkler('test', '')).toBe(0);
  });

  it('returns 1 for both empty (identical)', () => {
    expect(jaroWinkler('', '')).toBe(1);
  });

  it('returns high score for "smith" vs "smyth"', () => {
    const score = jaroWinkler('smith', 'smyth');
    expect(score).toBeGreaterThan(0.8);
  });

  it('handles typo resilience: "connecticut" vs "conneticut"', () => {
    const score = jaroWinkler('connecticut', 'conneticut');
    expect(score).toBeGreaterThan(0.9);
  });

  it('returns reasonable score for "123 main st" vs "123 main street"', () => {
    const score = jaroWinkler('123 main st', '123 main street');
    expect(score).toBeGreaterThan(0.85);
  });

  it('returns low score for completely different strings', () => {
    const score = jaroWinkler('abc', 'xyz');
    expect(score).toBeLessThan(0.5);
  });

  it('is case sensitive (caller should normalize)', () => {
    // jaroWinkler treats 'A' and 'a' as different characters
    const score = jaroWinkler('John', 'john');
    expect(score).toBeLessThan(1.0);
  });

  it('returns value between 0 and 1', () => {
    const score = jaroWinkler('hello', 'world');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
