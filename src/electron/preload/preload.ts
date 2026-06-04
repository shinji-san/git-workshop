import { contextBridge, ipcRenderer } from 'electron';
import { Channels, RendererApi, TickBroadcast, Theme, TerminalContextResult, CopyMenuEntry } from '../shared/ipc-contract';

/** Narrow, typed bridge. The renderer gets ONLY these functions, no Node. */
const api: RendererApi = {
  listExercises: () => ipcRenderer.invoke(Channels.exerciseList),
  getProgress: () => ipcRenderer.invoke(Channels.exerciseProgress),
  openExercise: (id) => ipcRenderer.invoke(Channels.exerciseOpen, id),
  restartExercise: (id) => ipcRenderer.invoke(Channels.exerciseRestart, id),
  pauseExercise: () => ipcRenderer.invoke(Channels.exercisePause),
  resetExercise: () => ipcRenderer.invoke(Channels.exerciseReset),
  unlockExercises: (code) => ipcRenderer.invoke(Channels.exerciseUnlock, code),
  requestHint: () => ipcRenderer.invoke(Channels.hintRequest),
  sendInput: (data) => ipcRenderer.send(Channels.terminalInput, data),
  resize: (cols, rows) => ipcRenderer.send(Channels.terminalResize, cols, rows),
  onTerminalData: (cb) => ipcRenderer.on(Channels.terminalData, (_e, data: string) => cb(data)),
  onTerminalClear: (cb) => ipcRenderer.on(Channels.terminalClear, () => cb()),
  showTerminalContextMenu: (selection): Promise<TerminalContextResult> =>
    ipcRenderer.invoke(Channels.terminalContextMenu, selection),
  showCopyMenu: (entries: readonly CopyMenuEntry[]): Promise<void> =>
    ipcRenderer.invoke(Channels.graphCopyMenu, entries),
  clipboardWrite: (text) => ipcRenderer.send(Channels.clipboardWrite, text),
  clipboardRead: () => ipcRenderer.invoke(Channels.clipboardRead),
  onTick: (cb) => ipcRenderer.on(Channels.tick, (_e, b: TickBroadcast) => cb(b)),
  onTimerSet: (cb) => ipcRenderer.on(Channels.timerSet, (_e, remainingSec: number | null) => cb(remainingSec)),
  getTheme: () => ipcRenderer.invoke(Channels.themeGet),
  onThemeChanged: (cb) => ipcRenderer.on(Channels.themeChanged, (_e, theme: Theme) => cb(theme)),
  openGraph: () => ipcRenderer.invoke(Channels.graphOpen),
  onGraphClosed: (cb) => ipcRenderer.on(Channels.graphClosed, () => cb()),
  onGraphClear: (cb) => ipcRenderer.on(Channels.graphClear, () => cb()),
  onGraphExportRequest: (cb) => ipcRenderer.on(Channels.graphExportRequest, () => cb()),
  exportGraphPng: (png) => ipcRenderer.invoke(Channels.graphExportPng, png),
  onConsoleExportRequest: (cb) => ipcRenderer.on(Channels.consoleExportRequest, () => cb()),
  exportConsoleText: (text) => ipcRenderer.invoke(Channels.consoleExportText, text),
  onShowOverview: (cb) => ipcRenderer.on(Channels.overviewShow, () => cb()),
};

contextBridge.exposeInMainWorld('api', api);
