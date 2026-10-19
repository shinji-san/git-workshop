import { Locale, UiLocale, resolveUiLocale } from '../../../core/i18n/Locale';

/**
 * Message catalogs of the two renderer windows (console + graph). One object per UI locale; the
 * `UiMessages` interface makes a missing key in either language a compile error. No library,
 * no runtime loading: the catalogs are plain data shipped with the bundle (offline, CSP-safe).
 */
export interface UiMessages {
  readonly consoleWindowTitle: string;
  readonly graphWindowTitle: string;
  // --- overview (exercise picker)
  readonly overviewTitle: string;
  readonly searchPlaceholder: string;
  readonly noExerciseFound: string;
  readonly unlockLabel: string;
  readonly unlockPlaceholder: string;
  readonly unlockButton: string;
  readonly unlocked: (n: number) => string;
  readonly unlockInvalid: string;
  readonly openLocked: string;
  readonly openCompleted: string;
  readonly openResume: string;
  readonly openStart: string;
  readonly restartCompleted: string;
  readonly restartPlain: string;
  readonly openGraphButton: string;
  // --- running exercise
  readonly backToOverview: string;
  readonly introSummary: string;
  readonly goalsHeading: string;
  readonly hintButton: string;
  readonly resetButton: string;
  readonly completedTitle: string;
  readonly completedTask: string;
  readonly stepOf: (index: number, total: number) => string;
  readonly pitfallPrefix: string;
  readonly hintPrefix: string;
  readonly noMoreHints: string;
  readonly errorPrefix: string;
  readonly errLoadExercises: string;
  readonly errOpenExercise: string;
  readonly errRestartExercise: string;
  readonly errRequestHint: string;
  readonly errReset: string;
  readonly errPause: string;
  readonly errOpenGraph: string;
  readonly timerExpired: string;
  // --- graph window
  readonly legendOrphans: (n: number) => string;
  readonly legendAllReachable: string;
  readonly popupSha: string;
  readonly popupAuthor: string;
  readonly popupAuthorDate: string;
  readonly popupCommitter: string;
  readonly popupCommitterDate: string;
  readonly popupCopyAll: string;
  readonly popupCopied: string;
  readonly popupClose: string;
  readonly popupDialogLabel: string;
  readonly copySha: string;
  readonly copyMessage: string;
  readonly copyAuthor: string;
  readonly copyCommitter: string;
}

export const UI_MESSAGES: { readonly [L in UiLocale]: UiMessages } = {
  'de-DE': {
    consoleWindowTitle: 'Git-Workshop – Konsole',
    graphWindowTitle: 'Git-Workshop – Commit-Graph',
    overviewTitle: 'Aufgabe wählen',
    searchPlaceholder: 'Aufgaben durchsuchen…',
    noExerciseFound: 'Keine Aufgabe gefunden.',
    unlockLabel: '🔒 Aufgabe freischalten',
    unlockPlaceholder: 'Freischaltcode…',
    unlockButton: 'Freischalten',
    unlocked: (n) => `${n} Aufgabe${n === 1 ? '' : 'n'} freigeschaltet ✓`,
    unlockInvalid: 'Code ungültig oder bereits verwendet.',
    openLocked: 'Gesperrt – Freischaltcode erforderlich',
    openCompleted: 'Abgeschlossen – zum erneuten Üben auf 🔄 (Neustart)',
    openResume: 'Aufgabe fortsetzen',
    openStart: 'Aufgabe starten',
    restartCompleted: 'Erneut üben (entsperrt und startet neu)',
    restartPlain: 'Aufgabe neu starten',
    openGraphButton: '▣ Graph-Fenster öffnen',
    backToOverview: '← Aufgabenübersicht',
    introSummary: "Worum geht's?",
    goalsHeading: 'Ziele',
    hintButton: 'Tipp',
    resetButton: 'Zurücksetzen',
    completedTitle: 'Aufgabe abgeschlossen',
    completedTask: 'Gut gemacht! 🎉',
    stepOf: (i, n) => `Schritt ${i} von ${n}`,
    pitfallPrefix: 'Achtung:',
    hintPrefix: 'Tipp:',
    noMoreHints: 'Keine weiteren Tipps verfügbar.',
    errorPrefix: 'Fehler:',
    errLoadExercises: 'Aufgaben konnten nicht geladen werden',
    errOpenExercise: 'Aufgabe konnte nicht geöffnet werden',
    errRestartExercise: 'Aufgabe konnte nicht neu gestartet werden',
    errRequestHint: 'Tipp konnte nicht abgerufen werden',
    errReset: 'Zurücksetzen fehlgeschlagen',
    errPause: 'Aufgabe konnte nicht pausiert werden',
    errOpenGraph: 'Graph-Fenster konnte nicht geöffnet werden',
    timerExpired: '⏱ Zeit abgelaufen',
    legendOrphans: (n) => `${n} verwaiste${n === 1 ? 'r' : ''} Commit${n === 1 ? '' : 's'} – nicht erreichbar`,
    legendAllReachable: 'alle Commits erreichbar (keine verwaisten)',
    popupSha: 'SHA',
    popupAuthor: 'Autor',
    popupAuthorDate: 'Autor-Datum',
    popupCommitter: 'Committer',
    popupCommitterDate: 'Committer-Datum',
    popupCopyAll: 'Alles kopieren',
    popupCopied: 'Kopiert ✓',
    popupClose: 'Schließen',
    popupDialogLabel: 'Commit-Details',
    copySha: 'SHA kopieren',
    copyMessage: 'Commit-Message kopieren',
    copyAuthor: 'Autor kopieren',
    copyCommitter: 'Committer kopieren',
  },
  'en-US': {
    consoleWindowTitle: 'Git Workshop – Console',
    graphWindowTitle: 'Git Workshop – Commit Graph',
    overviewTitle: 'Choose an exercise',
    searchPlaceholder: 'Search exercises…',
    noExerciseFound: 'No exercise found.',
    unlockLabel: '🔒 Unlock an exercise',
    unlockPlaceholder: 'Unlock code…',
    unlockButton: 'Unlock',
    unlocked: (n) => `${n} exercise${n === 1 ? '' : 's'} unlocked ✓`,
    unlockInvalid: 'Invalid code, or already used.',
    openLocked: 'Locked – unlock code required',
    openCompleted: 'Completed – press 🔄 (restart) to practice again',
    openResume: 'Resume exercise',
    openStart: 'Start exercise',
    restartCompleted: 'Practice again (unlocks and restarts)',
    restartPlain: 'Restart exercise',
    openGraphButton: '▣ Open graph window',
    backToOverview: '← Exercise overview',
    introSummary: "What's this about?",
    goalsHeading: 'Goals',
    hintButton: 'Hint',
    resetButton: 'Reset',
    completedTitle: 'Exercise completed',
    completedTask: 'Well done! 🎉',
    stepOf: (i, n) => `Step ${i} of ${n}`,
    pitfallPrefix: 'Watch out:',
    hintPrefix: 'Hint:',
    noMoreHints: 'No more hints available.',
    errorPrefix: 'Error:',
    errLoadExercises: 'Exercises could not be loaded',
    errOpenExercise: 'Exercise could not be opened',
    errRestartExercise: 'Exercise could not be restarted',
    errRequestHint: 'Hint could not be fetched',
    errReset: 'Reset failed',
    errPause: 'Exercise could not be paused',
    errOpenGraph: 'Graph window could not be opened',
    timerExpired: '⏱ Time is up',
    legendOrphans: (n) => `${n} orphaned commit${n === 1 ? '' : 's'} – not reachable`,
    legendAllReachable: 'all commits reachable (no orphans)',
    popupSha: 'SHA',
    popupAuthor: 'Author',
    popupAuthorDate: 'Author date',
    popupCommitter: 'Committer',
    popupCommitterDate: 'Committer date',
    popupCopyAll: 'Copy all',
    popupCopied: 'Copied ✓',
    popupClose: 'Close',
    popupDialogLabel: 'Commit details',
    copySha: 'Copy SHA',
    copyMessage: 'Copy commit message',
    copyAuthor: 'Copy author',
    copyCommitter: 'Copy committer',
  },
};

/** The catalog for `locale`, falling back to the closest UI locale. */
export function uiMessages(locale: Locale): UiMessages {
  return UI_MESSAGES[resolveUiLocale(locale)];
}
