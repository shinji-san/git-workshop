/**
 * Ensures the Electron binary is present after `npm install` / `npm ci`.
 * Run: npm run electron:fetch   (also runs as the last postinstall step)
 *
 * Electron >= 42 ships no postinstall of its own any more: the binary is only fetched lazily on the
 * first `require('electron')`, which electron-vite's dev/preview never do (they read `path.txt`
 * directly and fail with "Electron uninstall"). So we run Electron's own installer explicitly.
 *
 * - Idempotent: skips when the right version is already in place (install.js checks that too).
 * - ELECTRON_SKIP_BINARY_DOWNLOAD=1 skips the download (CI jobs / offline installs that only need
 *   tests, type-check or build – none of those need the binary).
 * - Never fails the install: a failed download (e.g. offline) only prints how to retry, so the pure
 *   core stays usable. Only `npm run dev` / `start` need the binary.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const pkgDir = path.resolve('node_modules/electron');
const installer = path.join(pkgDir, 'install.js');

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  console.log('[electron] ELECTRON_SKIP_BINARY_DOWNLOAD is set – skipping the binary download.');
  process.exit(0);
}
if (!existsSync(installer)) {
  // e.g. `npm ci --omit=dev`: electron is a devDependency, nothing to fetch.
  console.log('[electron] package not installed – skipping the binary download.');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { version: string };
const versionFile = path.join(pkgDir, 'dist', 'version');
const present =
  existsSync(versionFile) &&
  existsSync(path.join(pkgDir, 'path.txt')) &&
  readFileSync(versionFile, 'utf8').trim().replace(/^v/, '') === version;
if (present) {
  console.log(`[electron] binary ${version} already present.`);
  process.exit(0);
}

console.log(`[electron] fetching binary ${version} via Electron's install.js …`);
const res = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
if (res.status === 0) {
  console.log('[electron] binary ready.');
} else {
  console.warn(
    '[electron] download failed (offline?). Tests, type-check and build work without the binary; ' +
      '`npm run dev` / `start` need it.\n           Retry later with: npm run electron:fetch',
  );
}
