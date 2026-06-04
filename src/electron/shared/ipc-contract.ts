/**
 * Single source of truth for main <-> renderer. Main and renderer import the
 * same types, so they cannot drift apart. Only pure domain types appear here
 * (no Electron, no Node) – which makes the file usable in both worlds.
 */
import { Verdict } from '../../core/domain/Verdict';
import { Pitfall } from '../../core/domain/Pitfall';
import { GraphLayout } from '../../core/graph/GraphLayout';
import { ExerciseSummary } from '../../core/ports/IExerciseRepository';
import { ExerciseStatusView } from '../../core/domain/ParticipantProgress';

export interface StepView {
  readonly title: string;
  readonly task: string;
  readonly index: number;
  readonly total: number;
}

/** Effective UI theme (already resolved from the 'system'|'light'|'dark' preference). */
export type Theme = 'light' | 'dark';

/** Outcome of the terminal context menu. Copy runs in main; these tell the renderer what to do. */
export interface TerminalContextResult {
  /** Text to paste into the terminal (clipboard contents), if "Paste" was chosen. */
  readonly paste?: string;
  /** "Select all" was chosen. */
  readonly selectAll?: boolean;
}

/**
 * One entry of a generic copy context menu (graph window). Click behaviour in main is uniform
 * (writeText(value)), so only data crosses the boundary; the renderer owns labels and values.
 */
export type CopyMenuEntry =
  | { readonly type: 'copy'; readonly label: string; readonly value: string }
  | { readonly type: 'separator' };

/** What is broadcast to the windows on every tick. */
export interface TickBroadcast {
  readonly verdict: Verdict;
  readonly step?: StepView;
  readonly advanced: boolean;
  readonly isComplete: boolean;
  readonly newPitfalls: readonly Pitfall[];
  readonly revealedHint?: string;
  readonly graph: GraphLayout;
  /** Exercise-level concept framing (constant per exercise); shown foldable above the goals. */
  readonly intro?: string;
  /** Exercise-level wrap-up; shown on completion. */
  readonly debrief?: string;
}

export const Channels = {
  exerciseList: 'exercise:list',
  exerciseProgress: 'exercise:progress',
  exerciseOpen: 'exercise:open',
  exerciseRestart: 'exercise:restart',
  exercisePause: 'exercise:pause',
  exerciseReset: 'exercise:reset',
  exerciseUnlock: 'exercise:unlock',
  hintRequest: 'exercise:hint',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalData: 'terminal:data',
  terminalClear: 'terminal:clear',
  terminalContextMenu: 'terminal:context-menu',
  graphCopyMenu: 'graph:copy-menu',
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',
  tick: 'tick:broadcast',
  timerSet: 'timer:set',
  themeGet: 'theme:get',
  themeChanged: 'theme:changed',
  graphOpen: 'graph:open',
  graphClosed: 'graph:closed',
  graphClear: 'graph:clear',
  graphExportRequest: 'graph:export-request',
  graphExportPng: 'graph:export-png',
  consoleExportRequest: 'console:export-request',
  consoleExportText: 'console:export-text',
  overviewShow: 'overview:show',
} as const;

/** Exposed by the preload as window.api. */
export interface RendererApi {
  listExercises(): Promise<ExerciseSummary[]>;
  /** Per-exercise status map (keyed by UUID) for the overview badges. */
  getProgress(): Promise<{ [id: string]: ExerciseStatusView }>;
  /** Open an exercise: resume from a snapshot if one exists, otherwise start fresh. */
  openExercise(id: string): Promise<void>;
  /** Discard any snapshot and start the exercise from scratch. */
  restartExercise(id: string): Promise<void>;
  /** Pause the current exercise (snapshot it) and return to the overview. */
  pauseExercise(): Promise<void>;
  resetExercise(): Promise<void>;
  /** Try a code; resolves to how many gated exercises were newly unlocked (0 = wrong/already done). */
  unlockExercises(code: string): Promise<number>;
  requestHint(): Promise<string | undefined>;
  sendInput(data: string): void;
  resize(cols: number, rows: number): void;
  onTerminalData(cb: (data: string) => void): void;
  onTerminalClear(cb: () => void): void;
  /**
   * Show the native terminal context menu (Copy/Paste/Select all). Copy is handled in main
   * (writes the passed selection to the clipboard); the result tells the renderer whether to
   * paste clipboard text or select all.
   */
  showTerminalContextMenu(selection: string): Promise<TerminalContextResult>;
  /**
   * (Graph window) Show a native copy context menu for the right-clicked commit. The entries carry
   * the labels and clipboard values; main writes the chosen entry's value to the clipboard.
   */
  showCopyMenu(entries: readonly CopyMenuEntry[]): Promise<void>;
  /** Write text to the system clipboard (Ctrl+Shift+C copy of the terminal selection). */
  clipboardWrite(text: string): void;
  /** Read text from the system clipboard (Ctrl+Shift+V paste into the terminal). */
  clipboardRead(): Promise<string>;
  onTick(cb: (b: TickBroadcast) => void): void;
  /** Set/clear the status-bar timer. `remainingSec` null hides it (no time budget / no active exercise). */
  onTimerSet(cb: (remainingSec: number | null) => void): void;
  /** Current effective theme (resolved by main from the OS or the user's override). */
  getTheme(): Promise<Theme>;
  /** Fired whenever the effective theme changes (OS switch or menu override). */
  onThemeChanged(cb: (theme: Theme) => void): void;
  /** Open the (new) graph window. */
  openGraph(): Promise<void>;
  /** Fired when the graph window was closed (the console then shows the open button). */
  onGraphClosed(cb: () => void): void;
  /** Clear the commit graph (e.g. when the learner leaves an exercise). */
  onGraphClear(cb: () => void): void;
  /** (Graph window) The menu asked for a PNG of the current graph. */
  onGraphExportRequest(cb: () => void): void;
  /** (Graph window) Hand a rendered PNG to main, which prompts for a save location. */
  exportGraphPng(png: Uint8Array): Promise<void>;
  /** (Console window) The menu asked for the terminal transcript. */
  onConsoleExportRequest(cb: () => void): void;
  /** (Console window) Hand the serialized terminal text to main, which prompts for a save location. */
  exportConsoleText(text: string): Promise<void>;
  /** Main asks the console to show the exercise overview (e.g. after a progress reset). */
  onShowOverview(cb: () => void): void;
}
