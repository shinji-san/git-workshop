/** Time source as a port – makes time-based logic (stuck detection) testable. */
export interface IClock {
  now(): number;
}
