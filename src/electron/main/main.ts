import { app, BrowserWindow, ipcMain, nativeTheme, screen, Menu, dialog, shell, clipboard } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { composeApp, defaultExercisesRoot, defaultDataDir, AppConfig } from './composition';
import { SessionController, SessionView } from './SessionController';
import { exerciseFileSuffix } from './exerciseFileSuffix';
import { SettingsStore, ThemeSource } from './settings';
import { Channels, RendererApi, TickBroadcast, Theme, CopyMenuEntry } from '../shared/ipc-contract';

/**
 * Electron entry point. Owns the two windows (console + graph), the application menu and
 * the graph export/About dialogs, and wires a SessionController that runs the actual
 * exercise (PTY, watcher, ticks, progress, timer). The console is the main window.
 *
 * Note: GUI code – only built/run in a desktop environment (see README).
 */

const isDev = !app.isPackaged;
const appRoot = isDev ? process.cwd() : path.dirname(app.getAppPath());

/**
 * Finds the runtime toolchain (git/bash/coreutils/vim). Order:
 *  1) explicit TOOLCHAIN_BIN / GIT_BIN (takes precedence, for custom setups),
 *  2) on Windows the bundled Git-for-Windows Portable under resources/toolchain
 *     (packed via extraResources, see package.json -> build.win),
 *  3) otherwise the system PATH (e.g. Linux with an existing git/bash).
 * Also returns the shell path: node-pty does not reliably resolve the command via
 * the passed env.PATH, hence the absolute bash path on Windows.
 */
function resolveToolchain(): { toolchainBin?: string; gitBin?: string; shellPath: string } {
  const defaultShell = process.platform === 'win32' ? 'bash.exe' : 'bash';
  if (process.env.TOOLCHAIN_BIN || process.env.GIT_BIN) {
    return { toolchainBin: process.env.TOOLCHAIN_BIN, gitBin: process.env.GIT_BIN, shellPath: defaultShell };
  }
  if (!isDev && process.platform === 'win32') {
    const root = path.join(process.resourcesPath, 'toolchain');
    const usrBin = path.join(root, 'usr', 'bin'); // bash, coreutils, vim
    if (fs.existsSync(path.join(usrBin, 'bash.exe'))) {
      const toolchainBin = [usrBin, path.join(root, 'mingw64', 'bin'), path.join(root, 'cmd')].join(path.delimiter);
      return { toolchainBin, gitBin: path.join(root, 'mingw64', 'bin', 'git.exe'), shellPath: path.join(usrBin, 'bash.exe') };
    }
  }
  return { shellPath: defaultShell };
}

const toolchain = resolveToolchain();

const dataDir = defaultDataDir();
const config: AppConfig = {
  exercisesRoot: process.env.EXERCISES_ROOT ?? defaultExercisesRoot(appRoot),
  toolchainBin: toolchain.toolchainBin,
  gitBin: toolchain.gitBin,
  progressFile: path.join(dataDir, 'progress.json'),
  snapshotRoot: path.join(dataDir, 'snapshots'),
  appVersion: app.getVersion(),
};

const di = composeApp(config);
const settings = new SettingsStore(path.join(dataDir, 'settings.json'));

/**
 * Explicit window icon so the windows (taskbar/title bar) show the app icon instead of
 * the toolkit default (e.g. the generic X icon under Linux/KDE). The PNG lives in build/
 * during dev and is copied to resources/ when packaged (see build.extraResources).
 */
function resolveWindowIcon(): string | undefined {
  const candidate = isDev ? path.join(appRoot, 'build', 'icon.png') : path.join(process.resourcesPath, 'icon.png');
  return fs.existsSync(candidate) ? candidate : undefined;
}
const windowIcon = resolveWindowIcon();

let consoleWin: BrowserWindow | null = null;
let graphWin: BrowserWindow | null = null;
let lastBroadcast: TickBroadcast | null = null; // last state, to immediately fill a newly opened graph window

const GAP = 24; // pixel gap between the side-by-side windows
const PRELOAD = () => path.join(__dirname, '../preload/preload.cjs');

/** Bridge the controller to the windows. */
const view: SessionView = {
  terminalData: (data) => consoleWin?.webContents.send(Channels.terminalData, data),
  clearTerminal: () => consoleWin?.webContents.send(Channels.terminalClear),
  broadcastTick: (tick) => {
    lastBroadcast = tick;
    consoleWin?.webContents.send(Channels.tick, tick);
    graphWin?.webContents.send(Channels.tick, tick);
  },
  setTimer: (remainingSec) => consoleWin?.webContents.send(Channels.timerSet, remainingSec),
  clearGraph: () => {
    lastBroadcast = null; // a newly opened graph window must not show stale data
    graphWin?.webContents.send(Channels.graphClear);
  },
  returnToOverview: () => consoleWin?.webContents.send(Channels.overviewShow),
};

const controller = new SessionController(di, view, toolchain.shellPath, () => settings.readUnlockAll());

/** Computes the side-by-side window geometry within the primary monitor's work area. */
function windowLayout(): { x: number; y: number; winHeight: number; consoleWidth: number; graphWidth: number } {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const winHeight = Math.min(760, height);
  let consoleWidth = 900;
  let graphWidth = 720;
  if (consoleWidth + graphWidth + GAP > width) {
    const avail = width - GAP; // shrink proportionally to the available width (minus the gap)
    consoleWidth = Math.floor(avail * (consoleWidth / (consoleWidth + graphWidth)));
    graphWidth = avail - consoleWidth;
  }
  return { x, y, winHeight, consoleWidth, graphWidth };
}

function loadRenderer(win: BrowserWindow, name: 'renderer-console' | 'renderer-graph'): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${name}/index.html`);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${name}/index.html`));
  }
}

function createWindows(): void {
  const L = windowLayout();
  consoleWin = new BrowserWindow({
    x: L.x,
    y: L.y,
    width: L.consoleWidth,
    height: L.winHeight,
    title: 'Git-Workshop – Konsole',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: { preload: PRELOAD(), contextIsolation: true, nodeIntegration: false },
  });
  loadRenderer(consoleWin, 'renderer-console');

  // The console is the main window: closing it also closes the graph (-> window-all-closed -> quit).
  consoleWin.on('closed', () => {
    consoleWin = null;
    graphWin?.close();
  });

  openGraphWindow(); // open the graph right away on start
}

/** Opens the graph window (to the right of the console) or focuses an already-open one. */
function openGraphWindow(): void {
  if (graphWin) {
    graphWin.focus();
    return;
  }
  const L = windowLayout();
  const cb = consoleWin?.getBounds(); // attach to the console's current position
  graphWin = new BrowserWindow({
    x: (cb ? cb.x + cb.width : L.x + L.consoleWidth) + GAP,
    y: cb ? cb.y : L.y,
    width: L.graphWidth,
    height: cb ? cb.height : L.winHeight,
    title: 'Git-Workshop – Commit-Graph',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: { preload: PRELOAD(), contextIsolation: true, nodeIntegration: false },
  });
  loadRenderer(graphWin, 'renderer-graph');

  // The application menu (incl. PNG export) lives on the console window; the graph
  // window stays chrome-free. With autoHideMenuBar off, this also disables the Alt toggle.
  // Exception: in dev mode keep the menu bar so DevTools is reachable here too.
  if (!settings.readDevTools()) graphWin.setMenuBarVisibility(false);

  // On (re)opening, immediately show the current state without waiting for the next tick.
  graphWin.webContents.on('did-finish-load', () => {
    if (lastBroadcast) graphWin?.webContents.send(Channels.tick, lastBroadcast);
  });

  // Graph closed on its own: the console stays open and reveals the open button.
  graphWin.on('closed', () => {
    graphWin = null;
    consoleWin?.webContents.send(Channels.graphClosed);
  });
}

/** Ask the graph window to render its current graph to a PNG (handled in the renderer). */
function requestGraphExport(): void {
  if (!graphWin) {
    void dialog.showMessageBox({
      type: 'info',
      message: 'Das Graph-Fenster ist geschlossen.',
      detail: 'Bitte zuerst das Graph-Fenster öffnen und dann erneut exportieren.',
    });
    return;
  }
  graphWin.webContents.send(Channels.graphExportRequest);
}

/** Filesystem-safe timestamp for export filenames, e.g. "2026-06-05-23-45-12". */
function fileStamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/**
 * Ask the console window to serialize its terminal buffer (handled in the renderer, which
 * has the reconstructed scrollback – line edits collapsed, no full-screen-app garbage).
 */
function requestConsoleExport(): void {
  if (!consoleWin) return;
  consoleWin.webContents.send(Channels.consoleExportRequest);
}

/** Confirm, then wipe the participant's progress (and resume snapshots) and refresh the overview. */
async function confirmResetProgress(): Promise<void> {
  const parent = BrowserWindow.getFocusedWindow() ?? consoleWin ?? graphWin;
  const opts = {
    type: 'warning' as const,
    title: 'Fortschritt zurücksetzen',
    message: 'Gesamten Fortschritt zurücksetzen?',
    detail:
      'Setzt den Teilnehmer-Fortschritt zurück (abgeschlossene/pausierte Aufgaben) und löscht ' +
      'gespeicherte Zwischenstände (Snapshots). Eine laufende Übung wird beendet. Diese Aktion ' +
      'kann nicht rückgängig gemacht werden.',
    buttons: ['Abbrechen', 'Zurücksetzen'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
  if (response !== 1) return;
  try {
    await controller.resetProgress();
  } catch (err) {
    dialog.showErrorBox('Zurücksetzen fehlgeschlagen', String(err));
  }
}

const HOMEPAGE = 'https://github.com/shinji-san/git-workshop';

// Inlined so the license is shown even offline (the app targets air-gapped use).
const MIT_LICENSE = `MIT License

Copyright (c) 2026 Sebastian Walther

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * Modal "About" dialog bound to the focused window (so it is modal and stays on top).
 * Buttons let the learner view the MIT license (offline) or open the project page.
 */
async function showAbout(): Promise<void> {
  const parent = BrowserWindow.getFocusedWindow() ?? consoleWin ?? graphWin;
  const opts = {
    type: 'info' as const,
    title: 'Über Git-Workshop',
    message: 'Git-Workshop',
    detail: `Version ${app.getVersion()}\nAutor: Sebastian Walther\nProjektseite: ${HOMEPAGE}\n\n© 2026 Sebastian Walther · Lizenz: MIT`,
    buttons: ['Schließen', 'Lizenz anzeigen', 'Projektseite öffnen'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
  if (response === 1) {
    const lic = { type: 'info' as const, title: 'Lizenz', message: 'MIT License', detail: MIT_LICENSE, buttons: ['Schließen'], noLink: true };
    if (parent) await dialog.showMessageBox(parent, lic);
    else await dialog.showMessageBox(lic);
  } else if (response === 2) {
    await shell.openExternal(HOMEPAGE);
  }
}

// --- Theme ----------------------------------------------------------------
// Preference (system/light/dark) is persisted; nativeTheme resolves it to an
// effective light/dark which is what the renderers actually apply. When the
// preference follows the OS, nativeTheme emits 'updated' on a system switch and
// we re-broadcast the new effective theme.

/** Effective theme as computed by Electron from the current themeSource. */
function effectiveTheme(): Theme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

/** Push the current effective theme to all open windows. */
function broadcastTheme(): void {
  const t = effectiveTheme();
  for (const w of [consoleWin, graphWin]) w?.webContents.send(Channels.themeChanged, t);
}

/** Apply and persist a theme preference, then rebuild the menu so its radios stay in sync. */
function setThemeSource(src: ThemeSource): void {
  nativeTheme.themeSource = src;
  settings.writeThemeSource(src);
  buildAppMenu();
  broadcastTheme();
}

function buildAppMenu(): void {
  const source = settings.readThemeSource();
  const themeItem = (label: string, src: ThemeSource) =>
    ({ label, type: 'radio' as const, checked: source === src, click: () => setThemeSource(src) });

  // DevTools is opt-in via settings.json ("devTools": true). Toggles the focused window,
  // so it works for whichever window (console or graph) currently has focus.
  const devItems = settings.readDevTools()
    ? [{ label: 'Entwicklertools', role: 'toggleDevTools' as const }, { type: 'separator' as const }]
    : [];

  const menu = Menu.buildFromTemplate([
    {
      label: 'Datei',
      submenu: [
        { label: 'Konsolen-Ausgabe exportieren…', click: () => requestConsoleExport() },
        { label: 'Graph als PNG exportieren…', click: () => requestGraphExport() },
        { type: 'separator' },
        { label: 'Fortschritt zurücksetzen…', click: () => void confirmResetProgress() },
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        {
          label: 'Erscheinungsbild',
          submenu: [
            themeItem('System', 'system'),
            themeItem('Hell', 'light'),
            themeItem('Dunkel', 'dark'),
          ],
        },
        { type: 'separator' },
        ...devItems,
        { label: 'Vollbild', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [{ label: 'Über Git-Workshop', click: () => void showAbout() }],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpc(): void {
  ipcMain.handle(Channels.exerciseList, () => controller.listExercises());
  ipcMain.handle(Channels.exerciseProgress, () => controller.progressMap());
  ipcMain.handle(Channels.exerciseOpen, (_e, id: string) => controller.open(id));
  ipcMain.handle(Channels.exerciseRestart, (_e, id: string) => controller.restart(id));
  ipcMain.handle(Channels.exercisePause, () => controller.pause());
  ipcMain.handle(Channels.exerciseReset, () => controller.reset());
  ipcMain.handle(Channels.exerciseUnlock, (_e, code: string) => controller.unlock(code));
  ipcMain.handle(Channels.hintRequest, () => controller.requestHint());
  ipcMain.handle(Channels.graphOpen, () => openGraphWindow());

  // Receive a rendered PNG from the graph window and prompt for a save location.
  ipcMain.handle(Channels.graphExportPng, async (_e, png: Uint8Array) => {
    const title = controller.activeExerciseTitle();
    const suffix = title ? exerciseFileSuffix(title) : '';
    const stamp = fileStamp();
    const opts = {
      title: 'Graph als PNG exportieren',
      defaultPath: suffix ? `commit-graph_${suffix}_${stamp}.png` : `commit-graph_${stamp}.png`,
      filters: [{ name: 'PNG-Bild', extensions: ['png'] }],
    };
    const parent = graphWin ?? consoleWin;
    const result = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return;
    try {
      await fs.promises.writeFile(result.filePath, Buffer.from(png));
    } catch (err) {
      dialog.showErrorBox('Export fehlgeschlagen', String(err));
    }
  });

  ipcMain.handle(Channels.themeGet, () => effectiveTheme());

  // Native terminal context menu. xterm keeps its own selection (not the DOM's), so the
  // renderer passes the selected text in: Copy writes it to the clipboard here, Paste/Select-all
  // are returned for the renderer to apply via xterm. The popup callback resolves on dismissal.
  ipcMain.handle(Channels.terminalContextMenu, (e, selection: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    return new Promise((resolve) => {
      const menu = Menu.buildFromTemplate([
        { label: 'Kopieren', enabled: selection.length > 0, click: () => { clipboard.writeText(selection); resolve({}); } },
        { label: 'Einfügen', click: () => resolve({ paste: clipboard.readText() }) },
        { type: 'separator' },
        { label: 'Alles auswählen', click: () => resolve({ selectAll: true }) },
      ]);
      menu.popup({ window: win, callback: () => resolve({}) });
    });
  });

  // Native copy context menu for a right-clicked commit node (graph window). The renderer owns the
  // labels and clipboard values (single source of truth); main only builds the native menu and writes
  // the chosen value. Click behaviour is uniform, so only data crosses the IPC boundary.
  ipcMain.handle(Channels.graphCopyMenu, (e, entries: CopyMenuEntry[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    return new Promise<void>((resolve) => {
      const menu = Menu.buildFromTemplate(
        entries.map((it) =>
          it.type === 'separator'
            ? { type: 'separator' as const }
            : { label: it.label, click: () => { clipboard.writeText(it.value); resolve(); } },
        ),
      );
      menu.popup({ window: win, callback: () => resolve() });
    });
  });

  // Clipboard bridges for the terminal keyboard shortcuts (Ctrl+Shift+C / Ctrl+Shift+V).
  ipcMain.on(Channels.clipboardWrite, (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle(Channels.clipboardRead, () => clipboard.readText());

  // Receive the serialized terminal transcript from the console window and prompt to save it.
  ipcMain.handle(Channels.consoleExportText, async (_e, text: string) => {
    if (!text.trim()) {
      void dialog.showMessageBox({
        type: 'info',
        message: 'Keine Konsolen-Ausgabe vorhanden.',
        detail: 'Bitte zuerst eine Aufgabe öffnen und im Terminal arbeiten.',
      });
      return;
    }
    const title = controller.activeExerciseTitle();
    const suffix = title ? exerciseFileSuffix(title) : '';
    const stamp = fileStamp();
    const opts = {
      title: 'Konsolen-Ausgabe exportieren',
      defaultPath: suffix ? `konsole_${suffix}_${stamp}.txt` : `konsole_${stamp}.txt`,
      filters: [{ name: 'Textdatei', extensions: ['txt', 'log'] }],
    };
    const result = consoleWin ? await dialog.showSaveDialog(consoleWin, opts) : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return;
    try {
      await fs.promises.writeFile(result.filePath, text.endsWith('\n') ? text : text + '\n', 'utf8');
    } catch (err) {
      dialog.showErrorBox('Export fehlgeschlagen', String(err));
    }
  });

  ipcMain.on(Channels.terminalInput, (_e, data: string) => controller.writeInput(data));
  ipcMain.on(Channels.terminalResize, (_e, cols: number, rows: number) => controller.resize(cols, rows));
}

// Windows taskbar identity: must match build.appId so grouping, pinning and the taskbar
// icon are attributed to the app (not the generic Electron host). No-op on other platforms.
if (process.platform === 'win32') app.setAppUserModelId('de.workshop.git-workshop');

app.whenReady().then(async () => {
  console.log('[startup] progress file:', config.progressFile);
  await di.sandboxes.sweep(); // sweep out leftovers from previous runs
  await controller.loadProgress();
  nativeTheme.themeSource = settings.readThemeSource();
  // Follow live OS theme changes while the preference is 'system'.
  nativeTheme.on('updated', broadcastTheme);
  buildAppMenu();
  registerIpc();
  createWindows();
});

// Snapshot an in-progress exercise before quitting so its state is not lost.
let quitting = false;
app.on('before-quit', (e) => {
  if (controller.hasSession() && !quitting) {
    quitting = true;
    e.preventDefault();
    controller
      .pause()
      .catch((err) => console.error('[quit] pause failed:', err))
      .finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helps TypeScript see RendererApi as referenced (contract anchor).
export type { RendererApi };
