import * as fs from 'node:fs';
import * as path from 'node:path';
import { UiLocale, resolveUiLocale } from '../../core/i18n/Locale';

/** Theme preference: follow the OS, or force light/dark. */
export type ThemeSource = 'system' | 'light' | 'dark';

/** Language preference: follow the OS locale, or force one of the UI locales (BCP 47 tag). */
export type LocaleSource = 'system' | UiLocale;

/**
 * Tiny persisted UI settings (theme + language preference, trainer switches) under
 * ~/.git-workshop/settings.json. A shell-level concern, so it lives in the
 * electron layer without a domain port. Reads/writes are best-effort: a missing
 * or corrupt file falls back to 'system' and never crashes startup.
 */
export class SettingsStore {
  constructor(private readonly file: string) {}

  readThemeSource(): ThemeSource {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { themeSource?: unknown };
      const t = raw.themeSource;
      return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
    } catch {
      return 'system';
    }
  }

  writeThemeSource(themeSource: ThemeSource): void {
    this.patch({ themeSource });
  }

  /**
   * Language preference (`"locale"` in settings.json): "system" follows the OS; any other value is
   * resolved to the closest UI locale (so "en" or "en-GB" both mean en-US). Default: system.
   */
  readLocaleSource(): LocaleSource {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { locale?: unknown };
      if (typeof raw.locale !== 'string' || raw.locale === 'system') return 'system';
      return resolveUiLocale(raw.locale);
    } catch {
      return 'system';
    }
  }

  writeLocaleSource(locale: LocaleSource): void {
    this.patch({ locale });
  }

  /**
   * Whether developer tooling (the DevTools menu item, the graph window's menu bar)
   * is exposed. Off unless settings.json explicitly sets "devTools": true.
   */
  readDevTools(): boolean {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { devTools?: unknown };
      return raw.devTools === true;
    } catch {
      return false;
    }
  }

  /**
   * Trainer override: when settings.json sets "unlockAll": true, every exercise is open regardless
   * of its unlock gate (handy on the presenter's machine / for preparing). Off by default.
   */
  readUnlockAll(): boolean {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { unlockAll?: unknown };
      return raw.unlockAll === true;
    } catch {
      return false;
    }
  }

  /** Merge a partial update into the file, preserving any unrelated keys (e.g. devTools). */
  private patch(update: Record<string, unknown>): void {
    try {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      } catch {
        current = {};
      }
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ ...current, ...update }, null, 2));
    } catch (err) {
      console.error('[settings] write failed:', err);
    }
  }
}