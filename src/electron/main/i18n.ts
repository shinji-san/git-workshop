import { Locale, UiLocale, resolveUiLocale } from '../../core/i18n/Locale';

/**
 * Message catalog of the main process: application menu, native dialogs, context menus and the
 * errors main throws at the renderer. Typed like the renderer catalog (missing key = compile error).
 */
export interface MainMessages {
  readonly menuFile: string;
  readonly menuExportConsole: string;
  readonly menuExportGraph: string;
  readonly menuResetProgress: string;
  readonly menuQuit: string;
  readonly menuView: string;
  readonly menuAppearance: string;
  readonly themeSystem: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly menuLanguage: string;
  readonly languageSystem: string;
  readonly menuDevTools: string;
  readonly menuFullscreen: string;
  readonly menuHelp: string;
  readonly menuAbout: string;
  readonly graphClosedMessage: string;
  readonly graphClosedDetail: string;
  readonly resetTitle: string;
  readonly resetMessage: string;
  readonly resetDetail: string;
  readonly resetCancel: string;
  readonly resetConfirm: string;
  readonly resetFailed: string;
  readonly aboutTitle: string;
  readonly aboutDetail: (version: string, homepage: string) => string;
  readonly aboutClose: string;
  readonly aboutLicense: string;
  readonly aboutHomepage: string;
  readonly licenseTitle: string;
  readonly exportGraphTitle: string;
  readonly exportGraphFilter: string;
  readonly exportFailed: string;
  readonly ctxCopy: string;
  readonly ctxPaste: string;
  readonly ctxSelectAll: string;
  readonly consoleEmptyMessage: string;
  readonly consoleEmptyDetail: string;
  readonly exportConsoleTitle: string;
  readonly exportConsoleFilter: string;
  readonly lockedError: string;
}

/** Endonyms for the language menu (each language named in itself, the usual convention). */
export const LANGUAGE_NAMES: { readonly [L in UiLocale]: string } = {
  'de-DE': 'Deutsch',
  'en-US': 'English',
};

export const MAIN_MESSAGES: { readonly [L in UiLocale]: MainMessages } = {
  'de-DE': {
    menuFile: 'Datei',
    menuExportConsole: 'Konsolen-Ausgabe exportieren…',
    menuExportGraph: 'Graph als PNG exportieren…',
    menuResetProgress: 'Fortschritt zurücksetzen…',
    menuQuit: 'Beenden',
    menuView: 'Ansicht',
    menuAppearance: 'Erscheinungsbild',
    themeSystem: 'System',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    menuLanguage: 'Sprache',
    languageSystem: 'System',
    menuDevTools: 'Entwicklertools',
    menuFullscreen: 'Vollbild',
    menuHelp: 'Hilfe',
    menuAbout: 'Über Git-Workshop',
    graphClosedMessage: 'Das Graph-Fenster ist geschlossen.',
    graphClosedDetail: 'Bitte zuerst das Graph-Fenster öffnen und dann erneut exportieren.',
    resetTitle: 'Fortschritt zurücksetzen',
    resetMessage: 'Gesamten Fortschritt zurücksetzen?',
    resetDetail:
      'Setzt den Teilnehmer-Fortschritt zurück (abgeschlossene/pausierte Aufgaben) und löscht ' +
      'gespeicherte Zwischenstände (Snapshots). Eine laufende Übung wird beendet. Diese Aktion ' +
      'kann nicht rückgängig gemacht werden.',
    resetCancel: 'Abbrechen',
    resetConfirm: 'Zurücksetzen',
    resetFailed: 'Zurücksetzen fehlgeschlagen',
    aboutTitle: 'Über Git-Workshop',
    aboutDetail: (version, homepage) =>
      `Version ${version}\nAutor: Sebastian Walther\nProjektseite: ${homepage}\n\n© 2026 Sebastian Walther · Lizenz: MIT`,
    aboutClose: 'Schließen',
    aboutLicense: 'Lizenz anzeigen',
    aboutHomepage: 'Projektseite öffnen',
    licenseTitle: 'Lizenz',
    exportGraphTitle: 'Graph als PNG exportieren',
    exportGraphFilter: 'PNG-Bild',
    exportFailed: 'Export fehlgeschlagen',
    ctxCopy: 'Kopieren',
    ctxPaste: 'Einfügen',
    ctxSelectAll: 'Alles auswählen',
    consoleEmptyMessage: 'Keine Konsolen-Ausgabe vorhanden.',
    consoleEmptyDetail: 'Bitte zuerst eine Aufgabe öffnen und im Terminal arbeiten.',
    exportConsoleTitle: 'Konsolen-Ausgabe exportieren',
    exportConsoleFilter: 'Textdatei',
    lockedError: 'Diese Aufgabe ist noch gesperrt. Bitte zuerst den Freischaltcode eingeben.',
  },
  'en-US': {
    menuFile: 'File',
    menuExportConsole: 'Export console output…',
    menuExportGraph: 'Export graph as PNG…',
    menuResetProgress: 'Reset progress…',
    menuQuit: 'Quit',
    menuView: 'View',
    menuAppearance: 'Appearance',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    menuLanguage: 'Language',
    languageSystem: 'System',
    menuDevTools: 'Developer tools',
    menuFullscreen: 'Full screen',
    menuHelp: 'Help',
    menuAbout: 'About Git Workshop',
    graphClosedMessage: 'The graph window is closed.',
    graphClosedDetail: 'Open the graph window first, then export again.',
    resetTitle: 'Reset progress',
    resetMessage: 'Reset all progress?',
    resetDetail:
      'Resets the participant progress (completed/paused exercises) and deletes saved resume ' +
      'states (snapshots). A running exercise is ended. This action cannot be undone.',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
    resetFailed: 'Reset failed',
    aboutTitle: 'About Git Workshop',
    aboutDetail: (version, homepage) =>
      `Version ${version}\nAuthor: Sebastian Walther\nProject page: ${homepage}\n\n© 2026 Sebastian Walther · License: MIT`,
    aboutClose: 'Close',
    aboutLicense: 'Show license',
    aboutHomepage: 'Open project page',
    licenseTitle: 'License',
    exportGraphTitle: 'Export graph as PNG',
    exportGraphFilter: 'PNG image',
    exportFailed: 'Export failed',
    ctxCopy: 'Copy',
    ctxPaste: 'Paste',
    ctxSelectAll: 'Select all',
    consoleEmptyMessage: 'There is no console output yet.',
    consoleEmptyDetail: 'Open an exercise and work in the terminal first.',
    exportConsoleTitle: 'Export console output',
    exportConsoleFilter: 'Text file',
    lockedError: 'This exercise is still locked. Enter the unlock code first.',
  },
};

/** The catalog for `locale`, falling back to the closest UI locale. */
export function mainMessages(locale: Locale): MainMessages {
  return MAIN_MESSAGES[resolveUiLocale(locale)];
}
