/**
 * Debounce with last-one-wins: rapid successive changes trigger only one run,
 * and an already-running, superseded run is not processed twice.
 */
export function debounced(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
}
