import { describe, expect, it } from 'vitest';
import { compareChapters } from '../../src/core/domain/compareChapters';

describe('compareChapters', () => {
  it('orders by numeric segments, not lexicographically', () => {
    expect(compareChapters('1.2', '1.10')).toBeLessThan(0); // 2 < 10, not "10" < "2"
    expect(compareChapters('1.1', '2.0')).toBeLessThan(0);
    expect(compareChapters('2.0', '1.1')).toBeGreaterThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareChapters('1', '1.1')).toBeLessThan(0);
    expect(compareChapters('1.0', '1')).toBe(0);
  });

  it('is equal for identical chapters', () => {
    expect(compareChapters('3.1', '3.1')).toBe(0);
  });

  it('sorts a list into chapter order', () => {
    const sorted = ['2.0', '1.10', '1.0', '1.2', '1.1'].sort(compareChapters);
    expect(sorted).toEqual(['1.0', '1.1', '1.2', '1.10', '2.0']);
  });
});
