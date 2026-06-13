import * as path from 'node:path';
import * as pty from 'node-pty';
import chokidar, { FSWatcher } from 'chokidar';
import { debounced } from './Debounced';
import { AppServices } from './composition';
import { layout } from '../../core/graph/layout';
import { SessionContext } from '../../application/SessionContext';
import { ParticipantProgress, ExerciseStatusView } from '../../core/domain/ParticipantProgress';
import { TRACE2_FILE } from '../../infrastructure/sandbox/env';
import { StepView, TickBroadcast } from '../shared/ipc-contract';

/** What the controller needs from the windows; main wires this to the renderers. */
export interface SessionView {
  /** PTY output -> console terminal. */
  terminalData(data: string): void;
  /** Clear the terminal before the next prompt. */
  clearTerminal(): void;
  /** Broadcast a tick to the windows. */
  broadcastTick(tick: TickBroadcast): void;
  /** Update the status-bar timer (null hides it). */
  setTimer(remainingSec: number | null): void;
  /** Empty the commit graph. */
  clearGraph(): void;
  /** Send the console back to the (freshly rendered) exercise overview. */
  returnToOverview(): void;
}

// Skip the bulky git object store: every relevant git operation also touches
// HEAD/refs/index/logs/config (which we DO observe), so the trigger stays complete,
// while we avoid stat-polling hundreds of loose objects. The inspector still reads
// objects via `git`, independent of the watch.
const GIT_OBJECTS_RE = /[/\\]\.git[/\\]objects([/\\]|$)/;

/**
 * Owns the runtime of one exercise attempt – the live SessionContext, its PTY and file
 * watcher, the persisted progress and the timer deadline – and the operations on them
 * (open/resume/restart/pause/reset/tick). Pure application logic stays in the use cases;
 * this orchestrates the shell side and talks to the windows only through SessionView.
 */
export class SessionController {
  private session: SessionContext | null = null;
  private currentExerciseId: string | null = null;
  private progress: ParticipantProgress | null = null;
  private ptyProcess: pty.IPty | null = null;
  private watcher: FSWatcher | null = null;
  private timerEndsAt: number | null = null; // wall-clock deadline (null = no timer)

  constructor(
    private readonly di: AppServices,
    private readonly view: SessionView,
    private readonly shellPath: string,
    /** Trainer override (settings.json "unlockAll"): when true, no exercise is ever locked. */
    private readonly unlockAll: () => boolean = () => false,
  ) {}

  /** Load (and on first run seed) the persisted progress. Never throws. */
  async loadProgress(): Promise<void> {
    try {
      const loaded = await this.di.progressStore.load();
      this.progress = loaded.progress;
      // First run: seed the seen-set with all current exercises so nothing shows as "new".
      if (loaded.created) {
        this.progress.seedSeen((await this.di.listExercises()).map((e) => e.id));
        await this.persist();
      }
      console.log('[startup] progress ready (created=' + loaded.created + ')');
    } catch (err) {
      // Progress is a nice-to-have; never let it stop the app from opening.
      console.error('[startup] progress init failed (continuing without persistence):', err);
    }
  }

  listExercises() {
    return this.di.listExercises();
  }

  /** Per-exercise status map for the overview badges. Fills in `locked` by combining the exercise's
   *  gated flag (repo) with the unlocked set (progress) and the trainer override (settings). */
  async progressMap(): Promise<{ [id: string]: ExerciseStatusView }> {
    const summaries = await this.di.listExercises();
    if (!this.progress) return {};
    const map = this.progress.statusMap(summaries.map((e) => e.id));
    const open = this.unlockAll();
    for (const s of summaries) {
      const v = map[s.id];
      if (v) v.locked = !open && s.gated && !this.progress.isUnlocked(s.id);
    }
    return map;
  }

  /** A gated exercise the learner hasn't unlocked (and no trainer override) cannot be opened. */
  private async isLocked(id: string): Promise<boolean> {
    if (this.unlockAll()) return false;
    const summary = (await this.di.listExercises()).find((e) => e.id === id);
    return !!summary?.gated && !(this.progress?.isUnlocked(id) ?? false);
  }

  /** Unlock gated exercises matching `code`; returns how many were newly unlocked. */
  async unlock(code: string): Promise<number> {
    if (!this.progress) return 0;
    const ids = await this.di.unlockExercises.execute(this.progress, code);
    return ids.length;
  }

  /**
   * Reset the whole participant (menu action): end any running attempt, delete all resume
   * snapshots and the progress file, then re-seed via loadProgress so nothing shows as "new".
   * Finally send the renderer back to a freshly rendered overview.
   */
  async resetProgress(): Promise<void> {
    if (this.session) {
      this.stopTimer();
      await this.teardown();
    }
    await this.di.sandboxes.clearSnapshots();
    await this.di.progressStore.clear();
    await this.loadProgress(); // file gone -> created=true -> seeds seen + persists fresh
    this.view.returnToOverview();
  }

  hasSession(): boolean {
    return this.session != null;
  }

  /** Title of the active exercise (for the export filename); undefined if none. */
  activeExerciseTitle(): string | undefined {
    return this.session?.exercise.title;
  }

  writeInput(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows);
  }

  requestHint(): string | undefined {
    return this.session ? this.di.requestHint.execute(this.session) : undefined;
  }

  /** Open: resume from a snapshot if one exists, otherwise start fresh. */
  async open(id: string): Promise<void> {
    if (await this.isLocked(id)) throw new Error('Diese Aufgabe ist noch gesperrt. Bitte zuerst den Freischaltcode eingeben.');
    await this.pause(); // never lose an in-progress different exercise
    const rec = this.progress?.getRecord(id);
    console.log(`[open] ${id} -> ${rec?.snapshotPath ? 'RESUME from ' + rec.snapshotPath : 'fresh start'}`);
    const ctx = rec?.snapshotPath
      ? await this.di.resumeExercise.execute(id, rec.snapshotPath, rec.lastStepIndex ?? 0)
      : await this.di.startExercise.execute(id);
    await this.beginSession(ctx, id, rec?.snapshotPath ? rec.remainingMs : undefined);
  }

  /** Restart: drop the snapshot and start from scratch. */
  async restart(id: string): Promise<void> {
    if (await this.isLocked(id)) throw new Error('Diese Aufgabe ist noch gesperrt. Bitte zuerst den Freischaltcode eingeben.');
    await this.pause();
    await this.di.sandboxes.removeSnapshot(id);
    this.progress?.clearSnapshot(id, Date.now());
    await this.beginSession(await this.di.startExercise.execute(id), id);
  }

  /** Reset the current attempt (clone-then-swap) and restart its timer. */
  async reset(): Promise<void> {
    if (!this.session) return;
    this.session = await this.di.resetExercise.execute(this.session);
    // Resetting restarts from scratch, so the time budget restarts too (like 🔄).
    this.startTimer(this.session.exercise.durationMinutes);
    await this.attach(this.session);
    await this.tick();
  }

  /**
   * Pause the active exercise: snapshot it (via the use case) so it can be resumed, then
   * tear the live session down. Re-throws a snapshot failure so the caller can surface it.
   */
  async pause(): Promise<void> {
    if (!this.session || !this.currentExerciseId || !this.progress) return;
    const id = this.currentExerciseId;
    const remainingMs = this.currentRemainingMs();
    let failure: unknown;
    try {
      const saved = await this.di.pauseExercise.execute(this.progress, this.session, remainingMs);
      console.log(saved ? `[pause] saved snapshot for ${id} at step ${this.session.progress.index}` : `[pause] ${id} is complete – no snapshot taken`);
    } catch (err) {
      // Tear the session down regardless, but report why the snapshot failed.
      failure = err;
      console.error(`[pause] snapshot FAILED for ${id}:`, err);
    }
    this.stopTimer();
    await this.teardown();
    if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  }

  // --- internals ----------------------------------------------------------

  private async beginSession(ctx: SessionContext, id: string, resumeRemainingMs?: number): Promise<void> {
    this.session = ctx;
    this.currentExerciseId = id;
    this.progress?.markSeen(id);
    await this.persist();
    this.startTimer(ctx.exercise.durationMinutes, resumeRemainingMs);
    await this.attach(ctx);
    await this.tick(); // initial broadcast
  }

  private async tick(): Promise<void> {
    if (!this.session) return;
    try {
      const result = await this.di.processRepoChange.execute(this.session);
      // Completion transition: record it once (via the use case) and stop the timer.
      if (result.advanced && result.isComplete && this.currentExerciseId && this.progress) {
        await this.di.completeExercise.execute(this.progress, this.currentExerciseId);
        this.stopTimer();
      }
      this.view.broadcastTick({
        verdict: result.verdict,
        step: this.stepView(this.session),
        advanced: result.advanced,
        isComplete: result.isComplete,
        newPitfalls: result.newPitfalls,
        revealedHint: result.revealedHint,
        graph: layout(result.state),
        intro: this.session.exercise.intro,
        debrief: this.session.exercise.debrief,
      });
    } catch (err) {
      // A failed tick (e.g. a transient git error) must never crash the process.
      console.error('[tick] failed:', err);
    }
  }

  private stepView(ctx: SessionContext): StepView | undefined {
    if (ctx.progress.isComplete) return undefined;
    const step = ctx.progress.currentStep;
    return { title: step.title, task: step.task, index: ctx.progress.index, total: ctx.progress.stepCount };
  }

  private async attach(ctx: SessionContext): Promise<void> {
    this.ptyProcess?.kill();
    this.ptyProcess = null;
    await this.watcher?.close();
    this.watcher = null;

    // Clear the terminal on (re)attach – before the first PTY output – so the renderer
    // clears first and then writes the new prompt (covers exercise switching and reset).
    this.view.clearTerminal();

    // Shell args differ by platform. Linux: a login shell (-l) reads .bash_profile -> .bashrc.
    // Windows (Git-for-Windows / MSYS2): a login shell also runs /etc/profile, which on first launch
    // prints noisy one-off output (creating /dev/shm + /dev/mqueue fails on the read-only toolchain,
    // copying \Windows\...\etc files into /etc). We already set the full PATH ourselves
    // (resolveToolchain -> usr/bin;mingw64/bin;cmd, prepended in buildSandboxEnv), so a NON-login
    // interactive shell suffices: it reads ~/.bashrc via HOME (prompt, GIT_TRACE2, locale) and skips
    // /etc/profile entirely -> a clean console. git/coreutils stay on PATH (MSYS converts it).
    const shellArgs = process.platform === 'win32' ? ['-i'] : ['-l'];
    this.ptyProcess = pty.spawn(this.shellPath, shellArgs, {
      name: 'xterm-color',
      cwd: ctx.repoPath,
      env: ctx.sandbox.env as { [key: string]: string },
      cols: 100,
      rows: 30,
    });
    this.ptyProcess.onData((data) => this.view.terminalData(data));

    const tick = debounced(() => void this.tick(), 150);
    // Also watch the GIT_TRACE2 log (outside the repo, under HOME): read-only plumbing
    // commands (cat-file, ls-files, …) change nothing in the worktree, so without this they
    // would never trigger a tick and `gitCommandUsed` goals could not advance. Every git
    // invocation appends here, so this also reliably ticks after object-only writes.
    const watchPaths = [ctx.repoPath];
    if (ctx.sandbox.env.HOME) watchPaths.push(path.join(ctx.sandbox.env.HOME, TRACE2_FILE));
    // POLLING instead of inotify: on Linux chokidar opens one inotify instance per watched
    // directory, which exhausts the per-process limit (max_user_instances) and makes the
    // watch silently fail (-> no ticks). Polling needs no inotify instances and is cheap.
    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      ignored: (p: string) => GIT_OBJECTS_RE.test(p),
      usePolling: true,
      interval: 250,
      binaryInterval: 300,
      awaitWriteFinish: { stabilityThreshold: 80 },
    });
    this.watcher.on('all', tick);
    this.watcher.on('error', (err) => console.error('[watcher] error:', err));
  }

  /** Stop the PTY/watcher and dispose the live (temporary) sandbox; empties the graph. */
  private async teardown(): Promise<void> {
    this.ptyProcess?.kill();
    this.ptyProcess = null;
    await this.watcher?.close();
    this.watcher = null;
    if (this.session) {
      try {
        await this.di.sandboxes.destroy(this.session.sandbox);
      } catch {
        // best-effort cleanup
      }
    }
    this.session = null;
    this.currentExerciseId = null;
    // Leaving an exercise empties both windows. clearTerminal must happen here too (not only in
    // attach): pausing back to the overview starts no new attempt, so without this the dead
    // PTY's last prompt would linger in the (now non-interactive) terminal.
    this.view.clearTerminal();
    this.view.clearGraph();
  }

  private startTimer(durationMinutes: number | undefined, resumeRemainingMs?: number): void {
    const durationMs = durationMinutes != null ? durationMinutes * 60_000 : null;
    this.timerEndsAt = durationMs == null ? null : Date.now() + (resumeRemainingMs ?? durationMs);
    this.pushTimer();
  }

  private stopTimer(): void {
    this.timerEndsAt = null;
    this.pushTimer();
  }

  private pushTimer(): void {
    const remainingSec = this.timerEndsAt != null ? Math.max(0, Math.round((this.timerEndsAt - Date.now()) / 1000)) : null;
    this.view.setTimer(remainingSec);
  }

  private currentRemainingMs(): number | undefined {
    return this.timerEndsAt != null ? Math.max(0, this.timerEndsAt - Date.now()) : undefined;
  }

  private async persist(): Promise<void> {
    if (!this.progress) return;
    try {
      await this.di.progressStore.save(this.progress);
    } catch (err) {
      // Persisting progress must never break the running session.
      console.error('[progress] save failed:', err);
    }
  }
}
