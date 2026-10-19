import { Assertion } from './Assertion';
import { Pitfall } from './Pitfall';
import { Locale } from '../i18n/Locale';

/** Provisioning: the bundle carries the committed history, setup the ephemeral state. */
export interface Provisioning {
  /** Path to the .bundle file (relative to the exercise package). Absent = start empty (no repo). */
  readonly bundle?: string;
  /** false (default): remove origin after cloning. */
  readonly keepOrigin?: boolean;
  /** Optional commands that run in the sandbox shell AFTER cloning
   *  (worktree/index/in-progress states a bundle cannot carry). */
  readonly setup?: readonly string[];
}

export interface Step {
  readonly id: string;
  readonly title: string;
  /** Task text for the right-hand panel. */
  readonly task: string;
  /** All assertions must hold (AND) for the step to be satisfied. */
  readonly goals: readonly Assertion[];
  /** Escalating hint ladder, revealed one at a time on demand. */
  readonly hints?: readonly string[];
  /** Step-specific pitfalls. */
  readonly pitfalls?: readonly Pitfall[];
}

/**
 * A fully RESOLVED exercise: one language, all `${vars}` placeholders of the package already
 * substituted. The on-disk package (structure + i18n/<locale>.yaml texts) is the repository's
 * concern; the domain never sees placeholders or several languages at once.
 */
export interface Exercise {
  /** Stable identity (UUID); used as the key for progress tracking. */
  readonly id: string;
  /** BCP 47 tag of the texts this object carries (title/task/hints/…), e.g. "de-DE". */
  readonly locale: Locale;
  /**
   * BCP 47 tag of the sandbox CONTENT – file names, commit messages, branch names: everything that
   * came from the texts file's `vars`. Usually equals `locale`; differs after a live language
   * switch, where the texts follow the UI while the already-provisioned sandbox keeps its values.
   */
  readonly contentLocale: Locale;
  /** Dotted chapter number for ordering/display (e.g. "1.1"). */
  readonly chapter: string;
  readonly title: string;
  /** Optional time budget in minutes for the status-bar timer. */
  readonly durationMinutes?: number;
  /** Concept framing shown (foldable) above the goals while the exercise runs. Optional. */
  readonly intro?: string;
  /** Wrap-up shown on completion ("what happened / why / real-world use"). Optional. */
  readonly debrief?: string;
  readonly provisioning: Provisioning;
  /** Pitfalls that apply in every step. */
  readonly commonPitfalls?: readonly Pitfall[];
  /** The sequence – array order is the step order. */
  readonly steps: readonly Step[];
}
