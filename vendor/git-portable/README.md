# Git for Windows Portable (toolchain for the Windows build)

During the **Windows build** (`npm run dist:win`) this folder is packed into the app as
`extraResources` and ends up under `resources/toolchain/`. The app locates it automatically at
runtime (see `resolveToolchain()` in `src/electron/main/main.ts`).

## Populated automatically

`npm run dist:win` first runs `npm run vendor:win` (`scripts/fetch-git-portable.ts`): it downloads
**Git for Windows Portable** and extracts it here. Prerequisites: internet access on the build
machine and **7-Zip** (Linux: `apt-get install p7zip-full`, macOS: `brew install p7zip`, Windows:
7z on the PATH). If the content is already present, it is skipped (`FORCE=1` forces a re-fetch).
Version/source/checksum can be overridden via environment variables (`GIT_FOR_WINDOWS_VERSION`,
`GIT_FOR_WINDOWS_TAG`, `GIT_FOR_WINDOWS_URL`, `GIT_FOR_WINDOWS_SHA256`).

## What belongs here (alternative: manually, e.g. offline)

The **extracted** content of **Git for Windows _Portable_** (PortableGit), NOT MinGit — MinGit is
missing `bash`, coreutils and `vim`. Download: <https://git-scm.com/download/win> →
"Portable ('thumbdrive edition')".

After extraction the structure must look like this (excerpt):

```
vendor/git-portable/
  usr/bin/bash.exe        # + coreutils (ls, cat, grep), vim
  mingw64/bin/git.exe
  cmd/git.exe
```

From this the app sets `PATH` (usr/bin; mingw64/bin; cmd) and `GIT_BIN` (mingw64/bin/git.exe), and
starts the shell via `usr/bin/bash.exe`.

> The binaries themselves are excluded via `.gitignore` (too large for the repo) — only this README
> is versioned. Place them on the build machine (or in CI before `dist:win`).