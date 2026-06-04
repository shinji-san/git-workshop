/**
 * Compares dotted chapter numbers segment-by-segment numerically.
 * Ensures natural ordering: "1.2" < "1.10", "1.1" < "2.0". Missing segments count as 0,
 * so "1" < "1.1". Pure and total – suitable for Array.prototype.sort.
 */
export function compareChapters(a: string, b: string): number {
  const pa = a.split('.').map((s) => Number(s));
  const pb = b.split('.').map((s) => Number(s));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
