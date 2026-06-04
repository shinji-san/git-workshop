import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
// Include the xterm stylesheet via the bundler (works in dev AND build). Otherwise
// the hidden .xterm-helper-textarea stays unstyled as a visible box over the prompt.
import '@xterm/xterm/css/xterm.css';
import type { RendererApi, TickBroadcast, Theme } from '../shared/ipc-contract';
import type { ExerciseSummary } from '../../core/ports/IExerciseRepository';
import type { ExerciseStatusView } from '../../core/domain/ParticipantProgress';
import { compareChapters } from '../../core/domain/compareChapters';
import { richTextToHtml } from './richtext';

declare global {
  interface Window {
    api: RendererApi;
  }
}
const api = window.api;

// --- Terminal -------------------------------------------------------------
const term = new Terminal({ fontSize: 13, cursorBlink: true, scrollback: 5000, theme: { background: '#1e1e1e' } });
const fit = new FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('terminal')!);
fit.fit();
term.onData((d) => api.sendInput(d));
api.onTerminalData((d) => term.write(d));
api.onTerminalClear(() => term.reset()); // clear the terminal on exercise switch/reset

// Right-click context menu (Copy/Paste/Select all). xterm owns its selection, so we hand the
// selected text to main; main copies it and tells us whether to paste or select all.
term.element?.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  void api.showTerminalContextMenu(term.getSelection()).then((res) => {
    if (res.paste) term.paste(res.paste);
    else if (res.selectAll) term.selectAll();
  });
});

// Console export: serialize xterm's reconstructed buffer (scrollback + screen) to plain
// text. Using the buffer – not the raw PTY stream – means line edits are already collapsed
// and full-screen apps (nano on the alternate screen) leave no garbage behind.
function serializeTerminal(): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop(); // drop trailing blanks
  return lines.join('\n');
}
api.onConsoleExportRequest(() => void api.exportConsoleText(serializeTerminal()));

// Main reset the participant's progress -> show the (freshly reloaded) overview with cleared badges.
api.onShowOverview(() => showOverview());

// Terminal keyboard shortcuts: Ctrl+Shift+C copies the selection, Ctrl+Shift+V pastes.
// Returning false stops xterm from forwarding the key to the PTY.
term.attachCustomKeyEventHandler((e) => {
  if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
  if (e.code === 'KeyC') {
    const sel = term.getSelection();
    if (sel) api.clipboardWrite(sel);
    return false;
  }
  if (e.code === 'KeyV') {
    void api.clipboardRead().then((text) => {
      if (text) term.paste(text);
    });
    return false;
  }
  return true;
});
const sendResize = () => {
  fit.fit();
  api.resize(term.cols, term.rows);
};
window.addEventListener('resize', sendResize);
sendResize();

// --- Theme ----------------------------------------------------------------
// main resolves the OS/menu preference to an effective light|dark. We set it on
// <html> (drives the CSS variables) and mirror it into xterm, which needs concrete
// colours read back from the now-applied CSS variables (single source of truth).
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg').trim() || '#1e1e1e';
  const fg = cs.getPropertyValue('--fg').trim() || '#eee';
  term.options.theme = { background: bg, foreground: fg, cursor: fg };
}
api.onThemeChanged(applyTheme);
void api.getTheme().then(applyTheme);

// --- Task panel -----------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;

/** Two screens in the panel: exercise overview (picker) and running exercise. */
function showOverview(): void {
  ($('exercise') as HTMLElement).hidden = true;
  ($('overview') as HTMLElement).hidden = false;
  clearMessages(); // don't drag hint/pitfall messages from the previous exercise into the overview
  void renderPicker(); // reload the list fresh (e.g. new packages)
}

function showExercise(): void {
  ($('overview') as HTMLElement).hidden = true;
  ($('exercise') as HTMLElement).hidden = false;
  clearMessages(); // fresh start without stale messages
  // NB: do NOT reset intro/debrief here. The initial tick (which sets their visibility) is
  // sent by main BEFORE openExercise() resolves, so it runs before this function – resetting
  // here would hide the intro the tick just revealed. The tick is the single source of truth,
  // and the overview hides the whole #exercise panel anyway.
}

/** Status badge per exercise (✓ done, ⏸ paused, ℹ new, ☐ not started). */
function statusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'paused':
      return '⏸️';
    case 'new':
      return 'ℹ️';
    default:
      return '☐';
  }
}

// Cache the fetched list/progress so the search box can filter without re-hitting IPC
// on every keystroke. renderPicker() refreshes the cache; drawRows() renders (a filtered) view.
let allExercises: ExerciseSummary[] = [];
let progressMap: { [id: string]: ExerciseStatusView } = {};

/** Fold German umlauts so a query typed without umlauts still matches (and vice versa). */
function normalize(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

async function renderPicker(): Promise<void> {
  try {
    const [list, prog] = await Promise.all([api.listExercises(), api.getProgress()]);
    allExercises = [...list].sort((a, b) => compareChapters(a.chapter, b.chapter));
    progressMap = prog;
    // The search box only earns its space once there is more than one exercise.
    ($('search') as HTMLInputElement).hidden = allExercises.length <= 1;
    // The unlock field appears only while at least one exercise is still locked.
    ($('unlock-row') as HTMLElement).hidden = !Object.values(progressMap).some((v) => v.locked);
    drawRows();
  } catch (e) {
    showError(`Aufgaben konnten nicht geladen werden: ${errText(e)}`);
  }
}

/** Render the (filtered) rows from the cached list – called on load and on each keystroke. */
function drawRows(): void {
  const picker = $('picker');
  const search = $('search') as HTMLInputElement;
  const query = search.hidden ? '' : normalize(search.value.trim());
  const shown = query
    ? allExercises.filter((ex) => normalize(`${ex.chapter} ${ex.title}`).includes(query))
    : allExercises;

  picker.innerHTML = '';
  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'Keine Aufgabe gefunden.';
    picker.appendChild(empty);
    return;
  }
  for (const ex of shown) {
    const view = progressMap[ex.id] ?? { status: 'not-started', completedCount: 0, resumable: false, locked: false };

    const row = document.createElement('div');
    row.className = 'exercise-row';

    // Two kinds of "locked": gateLocked = gated and not yet unlocked (needs a code; both buttons off).
    // doneLocked = completed with no live attempt -> only the restart (🔄) reopens it.
    const gateLocked = view.locked;
    const doneLocked = view.status === 'completed';

    const open = document.createElement('button');
    open.className = 'exercise-open';
    open.disabled = gateLocked || doneLocked;
    open.title = gateLocked
      ? 'Gesperrt – Freischaltcode erforderlich'
      : doneLocked
        ? 'Abgeschlossen – zum erneuten Üben auf 🔄 (Neustart)'
        : view.resumable
          ? 'Aufgabe fortsetzen'
          : 'Aufgabe starten';
    const icon = document.createElement('span');
    icon.className = `status status-${gateLocked ? 'locked' : view.status}`;
    icon.textContent = gateLocked ? '🔒' : statusIcon(view.status);
    const label = document.createElement('span');
    label.textContent = ` ${ex.chapter}  ${ex.title}`;
    open.append(icon, label);
    if (view.completedCount > 1) {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = ` ×${view.completedCount}`;
      open.append(count);
    }
    if (!gateLocked && !doneLocked) open.onclick = () => void openExercise(ex.id);

    const restart = document.createElement('button');
    restart.className = 'exercise-restart';
    restart.disabled = gateLocked;
    restart.title = gateLocked
      ? 'Gesperrt – Freischaltcode erforderlich'
      : doneLocked
        ? 'Erneut üben (entsperrt und startet neu)'
        : 'Aufgabe neu starten';
    restart.textContent = '🔄';
    if (!gateLocked) restart.onclick = () => void restartExercise(ex.id);

    row.append(open, restart);
    picker.appendChild(row);
  }
}

/** Open: continues from a snapshot if present, otherwise starts fresh (decided in main). */
async function openExercise(id: string): Promise<void> {
  try {
    await api.openExercise(id);
    showExercise(); // switch only after success; on error the overview stays visible
  } catch (e) {
    showError(`Aufgabe konnte nicht geöffnet werden: ${errText(e)}`);
  }
}

async function restartExercise(id: string): Promise<void> {
  try {
    await api.restartExercise(id);
    showExercise();
  } catch (e) {
    showError(`Aufgabe konnte nicht neu gestartet werden: ${errText(e)}`);
  }
}

api.onTick((b: TickBroadcast) => {
  const intro = $('intro') as HTMLDetailsElement;
  const debrief = $('debrief');
  if (b.isComplete) {
    $('title').textContent = 'Aufgabe abgeschlossen';
    $('title').className = 'done';
    $('progress').textContent = '';
    $('task').textContent = 'Gut gemacht! 🎉';
    $('goals').innerHTML = '';
    intro.hidden = true; // concept framing is done; the debrief takes over
    if (b.debrief) {
      debrief.innerHTML = richTextToHtml(b.debrief);
      debrief.hidden = false;
    } else {
      debrief.hidden = true;
    }
    return;
  }
  // Running step: keep the foldable intro visible, hide any debrief.
  debrief.hidden = true;
  if (b.intro) {
    $('intro-body').innerHTML = richTextToHtml(b.intro);
    intro.hidden = false;
  } else {
    intro.hidden = true;
  }
  if (b.step) {
    $('title').className = '';
    $('title').textContent = b.step.title;
    $('progress').textContent = `Schritt ${b.step.index + 1} von ${b.step.total}`;
    $('task').innerHTML = richTextToHtml(b.step.task);
  }
  const goals = $('goals');
  goals.innerHTML = '';
  for (const res of b.verdict.results) {
    const li = document.createElement('li');
    li.className = res.passed ? 'ok' : 'pending';
    li.textContent = res.detail;
    goals.appendChild(li);
  }
  const messages = $('messages');
  for (const p of b.newPitfalls) {
    const div = document.createElement('div');
    div.className = `pitfall ${p.severity === 'danger' ? 'danger' : ''}`;
    div.innerHTML = `<strong>Achtung:</strong> ${p.message}` + (p.recovery ? `<br><em>${p.recovery}</em>` : '');
    messages.prepend(div);
  }
  if (b.revealedHint) showHint(b.revealedHint);
});

// --- Status-bar timer -----------------------------------------------------
// The countdown runs here; main owns the authoritative deadline and sends the remaining
// seconds on start/resume (and null to clear). Pausing keeps the leftover time (stored by
// main), so resuming continues where it stopped.
let audioCtx: AudioContext | undefined;

/** Web Audio needs a user gesture to start – unlock the context on first interaction. */
function unlockAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* audio unavailable – the timer still works visually */
  }
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/** Short metronome-like click, synthesized (no audio asset, CSP-safe). */
function playTick(): void {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1000;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** Distinct expiry beep (longer sine tone), clearly different from the per-second ticks. */
function playBeep(): void {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
  gain.gain.setValueAtTime(0.35, t + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.52);
}

let timerInterval: number | undefined;
let timerRemaining = 0;
let timerActive = false;

function renderTimer(): void {
  const el = $('timer');
  if (!timerActive) {
    el.textContent = '';
    el.className = '';
    return;
  }
  if (timerRemaining <= 0) {
    el.textContent = '⏱ Zeit abgelaufen';
    el.className = 'expired';
    return;
  }
  const m = Math.floor(timerRemaining / 60);
  const s = timerRemaining % 60;
  el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  el.className = timerRemaining <= 60 ? 'warn' : ''; // blink red in the final minute
}

api.onTimerSet((remainingSec) => {
  if (timerInterval !== undefined) {
    clearInterval(timerInterval);
    timerInterval = undefined;
  }
  if (remainingSec == null) {
    timerActive = false;
    renderTimer();
    return;
  }
  timerActive = true;
  timerRemaining = Math.max(0, Math.round(remainingSec));
  renderTimer();
  if (timerRemaining <= 0) return;
  if (timerRemaining <= 10) playTick(); // resumed inside the final 10s -> tick right away
  timerInterval = window.setInterval(() => {
    timerRemaining -= 1;
    if (timerRemaining <= 0) {
      timerRemaining = 0;
      renderTimer();
      playBeep(); // time is up
      clearInterval(timerInterval);
      timerInterval = undefined;
      return;
    }
    if (timerRemaining <= 10) playTick(); // a metronome tick on each of the final 10 seconds
    renderTimer();
  }, 1000);
});

function showHint(text: string): void {
  const div = document.createElement('div');
  div.className = 'hint';
  div.textContent = `Tipp: ${text}`;
  $('messages').prepend(div);
}

function showError(text: string): void {
  const div = document.createElement('div');
  div.className = 'error';
  div.innerHTML = `<strong>Fehler:</strong> ${text}`;
  $('messages').prepend(div);
}

function clearMessages(): void {
  $('messages').innerHTML = '';
}

/** Make IPC-bridge errors readable (Error, Electron reject string, etc.). */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

$('hint').addEventListener('click', async () => {
  try {
    const hint = await api.requestHint();
    if (hint) showHint(hint);
    else showHint('Keine weiteren Tipps verfuegbar.');
  } catch (e) {
    showError(`Tipp konnte nicht abgerufen werden: ${errText(e)}`);
  }
});
$('reset').addEventListener('click', async () => {
  try {
    await api.resetExercise();
  } catch (e) {
    showError(`Zuruecksetzen fehlgeschlagen: ${errText(e)}`);
  }
});
$('back').addEventListener('click', async () => {
  // Pause first (snapshots the sandbox in main) so the attempt can be resumed later.
  try {
    await api.pauseExercise();
  } catch (e) {
    showError(`Aufgabe konnte nicht pausiert werden: ${errText(e)}`);
  }
  showOverview();
});

// Graph window: appears here only when the graph window was closed.
const openGraphBtn = $('open-graph') as HTMLButtonElement;
api.onGraphClosed(() => {
  openGraphBtn.hidden = false;
});
openGraphBtn.addEventListener('click', async () => {
  try {
    await api.openGraph();
    openGraphBtn.hidden = true;
  } catch (e) {
    showError(`Graph-Fenster konnte nicht geoeffnet werden: ${errText(e)}`);
  }
});

// Live-filter the overview as the learner types (filters the cached list, no IPC).
$('search').addEventListener('input', drawRows);

// --- Unlock gate ----------------------------------------------------------
// The trainer announces a code; entering it unlocks the matching exercise(s). The code is checked
// in main against a stored hash (never shipped to the renderer), so it can't be read off the client.
function setUnlockStatus(text: string, kind: 'ok' | 'err' | ''): void {
  const el = $('unlock-status');
  el.textContent = text;
  el.className = kind;
}

async function submitUnlock(): Promise<void> {
  const input = $('unlock-code') as HTMLInputElement;
  const code = input.value.trim();
  if (!code) return;
  try {
    const n = await api.unlockExercises(code);
    if (n > 0) {
      setUnlockStatus(`${n} Aufgabe${n === 1 ? '' : 'n'} freigeschaltet ✓`, 'ok');
      input.value = '';
      await renderPicker(); // refresh badges; hides the field once nothing is left locked
    } else {
      setUnlockStatus('Code ungültig oder bereits verwendet.', 'err');
    }
  } catch (e) {
    setUnlockStatus(errText(e), 'err');
  }
}

$('unlock-btn').addEventListener('click', () => void submitUnlock());
$('unlock-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void submitUnlock();
});
$('unlock-code').addEventListener('input', () => setUnlockStatus('', ''));

renderPicker();
