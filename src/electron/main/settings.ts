import * as fs from 'node:fs';
import * as path from 'node:path';

/** Theme preference: follow the OS, or force light/dark. */
export type ThemeSource = 'system' | 'light' | 'dark';

/**
 * Tiny persisted UI settings (currently just the theme preference) under
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