import { ParticipantProgress } from '../domain/ParticipantProgress';

/** Persists learner progress (load/save the whole aggregate). */
export interface IProgressStore {
  /** Load the progress; `created` is true when no file existed yet (first run). */
  load(): Promise<{ progress: ParticipantProgress; created: boolean }>;
  save(progress: ParticipantProgress): Promise<void>;
  /** Delete the persisted progress (next load() behaves like a first run). */
  clear(): Promise<void>;
}
