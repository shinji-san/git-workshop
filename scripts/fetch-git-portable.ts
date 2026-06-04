/**
 * Provisions the Windows toolchain for `dist:win`: downloads Git for Windows *Portable*
 * (PortableGit – the full MSYS2 userland with bash, coreutils and vim, NOT MinGit) and
 * extracts it into `vendor/git-portable/`, where electron-builder picks it up as
 * extraResources (-> `resources/toolchain/` at runtime, see resolveToolchain() in main.ts).
 *
 * Idempotent: skips if already extracted (unless FORCE=1). Extraction needs 7-Zip
 * (Linux/macOS: install p7zip; Windows: 7z on PATH) because the asset is a 7-Zip SFX.
 *
 * Overridable via env: GIT_FOR_WINDOWS_VERSION, GIT_FOR_WINDOWS_TAG, GIT_FOR_WINDOWS_URL,
 * GIT_FOR_WINDOWS_SHA256 (integrity pin – the script prints the hash when unset).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = process.env.GIT_FOR_WINDOWS_VERSION ?? '2.47.1';
const TAG = process.env.GIT_FOR_WINDOWS_TAG ?? `v${VERSION}.windows.1`;
const ASSET = `PortableGit-${VERSION}-64-bit.7z.exe`;
const URL =
  process.env.GIT_FOR_WINDOWS_URL ??
  `https://github.com/git-for-windows/git/releases/download/${TAG}/${ASSET}`;
const SHA256 = process.env.GIT_FOR_WINDOWS_SHA256?.trim();

const TARGET = path.resolve('vendor/git-portable');
const MARKER = path.join(TARGET, 'usr', 'bin', 'bash.exe'); // proof of a complete extraction

async function main(): Promise<void> {
  if (fs.existsSync(MARKER) && process.env.FORCE !== '1') {
    console.log(`[git-portable] already present (${MARKER}); skipping. Set FORCE=1 to re-fetch.`);
    return;
  }

  const sevenZip = findSevenZip();
  if (!sevenZip) {
    fail(
      '7-Zip not found. Install it (Linux: `apt-get install p7zip-full`, macOS: `brew install p7zip`, ' +
        'Windows: install 7-Zip and add 7z to PATH) or place PortableGit manually in vendor/git-portable/.',
    );
  }

  fs.mkdirSync(TARGET, { recursive: true });
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'git-portable-')), ASSET);

  console.log(`[git-portable] downloading ${URL}`);
  await download(URL, tmp);

  const digest = sha256OfFile(tmp);
  if (SHA256) {
    if (digest.toLowerCase() !== SHA256.toLowerCase()) {
      fail(`sha256 mismatch! expected ${SHA256}, got ${digest}`);
    }
    console.log('[git-portable] sha256 verified.');
  } else {
    console.log(`[git-portable] sha256 = ${digest} (set GIT_FOR_WINDOWS_SHA256 to verify future runs)`);
  }

  console.log(`[git-portable] extracting into ${TARGET}`);
  const res = spawnSync(sevenZip, ['x', '-y', `-o${TARGET}`, tmp], { stdio: 'inherit' });
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  if (res.status !== 0) fail('extraction failed.');
  if (!fs.existsSync(MARKER)) fail(`extraction did not yield ${MARKER} – is this really PortableGit (not MinGit)?`);

  console.log('[git-portable] ready.');
}

/** Stream the (large, redirecting) download straight to disk. */
async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) fail(`download failed: HTTP ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(dest));
}

function findSevenZip(): string | undefined {
  for (const bin of ['7z', '7za', '7zz']) {
    if (!spawnSync(bin, [], { stdio: 'ignore' }).error) return bin;
  }
  return undefined;
}

function sha256OfFile(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fail(message: string): never {
  console.error(`[git-portable] ${message}`);
  process.exit(1);
}

main().catch((err) => fail(String(err)));