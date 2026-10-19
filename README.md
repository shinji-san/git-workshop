# Git-Workshop

Interactive desktop trainer for hands-on Git workshops: a **real Git console in a sandbox**, a
**task panel** that validates the entered commands step by step, and a second window with a
**live commit graph** (including orphaned/disconnected commits). Runs **offline** (air-gapped) and
**cross-platform** (Linux / Windows / macOS).

> Built when the workshop grew from ~8 to 76 simultaneous participants and one-on-one help during
> the hands-on part was no longer possible: this app takes over the trainer's role for the exercise
> part.

> **Maintaining the code?** See [`CLAUDE.md`](./CLAUDE.md) for the architecture, the design
> rationale (the *why*), the annotated source tree, and the project conventions.

---

## 📑 Contents

1. [What it does](#-what-it-does)
2. [Requirements](#-requirements)
3. [Quickstart](#-quickstart)
4. [Build, test, run](#-build-test-run)
5. [Dependencies](#-dependencies)
6. [Writing exercises (file format)](#-writing-exercises-file-format)
7. [Deployment (packaging)](#-deployment-packaging)
8. [Architecture & project layout](#-architecture--project-layout)

---

## ✨ What it does

- **Real console** in an isolated sandbox (a true PTY, real tools such as `vim`, `nano`, `cat`,
  `ls`, `grep` operating on the `.git` folder). With a **context menu** (right-click:
  Copy/Paste/Select all) and the shortcuts **Ctrl+Shift+C / Ctrl+Shift+V**.
- **Exercises** as a sequence of steps with declarative goals.
- **Validation**: after every change the repo state is read and checked against the current step's
  goals; a checklist shows satisfied/open sub-goals.
- **Trainer substitute**: an escalating ladder of on-demand hints, affirmatively detected "pitfalls"
  (e.g. detached HEAD, merge in the wrong direction), and automatic help when the learner is stuck.
- **Concept framing**: each exercise can show an `intro` (the *why/what* before doing) above the
  goals and a `debrief` (consolidation) on completion.
- **Commit graph** in a second window: nodes = commits, edge child→parent, including orphaned
  commits and disconnected components, animated (d3). **Zoom/pan with Ctrl+wheel**, **exportable as
  PNG** via the menu. **Hovering a node shows its SHA** (first 7 chars highlighted, rest in full),
  **clicking opens a popup** with author, committer, both dates (original time zone) and the full
  commit message, and **right-clicking offers copy actions** (SHA, message, author, committer, all).
- **Export console output** (File menu): plain-text transcript of the current attempt as `.txt`
  (ANSI sequences stripped).
- **Per-participant progress** (persisted in `~/.git-workshop/`): an overview with status
  (✓ completed, ⏸ paused, ℹ new, ☐ not started). Exercises can be **paused and resumed exactly**
  (sandbox snapshot); completed ones restart via 🔄.
- **Code-gated exercises** (optional): an exercise can be **locked** until the learner enters a code
  the trainer announces — controls the pace. Only a salted hash is stored, so codes can't be looked
  up in the (public) repo. See [Writing exercises](#writing-exercises-file-format).
- **Exercise search** in the overview: live filter over chapter + title, umlaut-tolerant (e.g.
  "uberfuhren" matches "überführen"). Appears once there is more than one exercise.
- **Per-exercise time budget** (optional): a countdown in the status bar, red blinking in the final
  minute, metronome ticks and a beep at expiry.
- **Multilingual**: the UI (panels, checklist, menus, dialogs) and the exercises come in **German and
  English** (`de-DE`, `en-US`; BCP 47 tags). Switch under **View → Language** (System / Deutsch /
  English). Exercise packages keep one language-neutral structure and one texts file per language,
  so adding a language means adding a file — see [Writing exercises](#-writing-exercises-file-format).

---

## 📋 Requirements

- **Node.js ≥ 22.12** and npm (required by Electron 42; pinned in `engines`).
- A **C/C++ toolchain** for `node-pty` (built natively on install):
  - Linux: `build-essential`, `python3`.
  - macOS: Xcode Command Line Tools.
  - Windows: Visual Studio Build Tools (Desktop C++).
- **Git** must be available at runtime. For **air-gapped deployment** a **bundled toolchain** is
  shipped (on Windows *MinGit* is not enough — it lacks `bash`, coreutils and `vim`; bundle **Git
  for Windows Portable** instead), wired in via the env vars `TOOLCHAIN_BIN` / `GIT_BIN` (see
  `src/electron/main/composition.ts`).

---

## 🚀 Quickstart

```bash
git clone <repo> && cd git-workshop
npm install          # pulls deps; postinstall builds the exercise bundles + icon, fetches the Electron binary
npm test             # unit tests of the pure core (no Electron needed)
npm run dev          # launch the app (needs a desktop environment)
```

> **Troubleshooting**
>
> - `npm run dev`/`start` reports `Electron uninstall`: the Electron binary is missing. Electron ≥ 42
>   ships no postinstall of its own, so ours fetches it (`scripts/fetch-electron.ts`) — unless
>   `ELECTRON_SKIP_BINARY_DOWNLOAD` was set or the download failed (offline). Fetch it now with
>   `npm run electron:fetch`.
> - `npm run dev` exits with code 1, the windows stay **empty**, and the console shows
>   `inotify_init() failed: Too many open files` (localized on some systems) followed by
>   `Failed to load URL: http://localhost:5173/… ERR_CONNECTION_REFUSED` (Linux): your session has
>   exhausted the kernel limit for inotify *instances* (`fs.inotify.max_user_instances`, 128 by
>   default — a busy desktop with browsers, IDEs and Electron apps gets there). The Vite dev server
>   dies on its first file watch right after Electron was spawned, so Electron is left behind
>   orphaned with nothing to load. Raise the limit (persistently), close the orphaned windows, start
>   again:
>
>   ```bash
>   sudo sysctl fs.inotify.max_user_instances=1024
>   echo 'fs.inotify.max_user_instances = 1024' | sudo tee /etc/sysctl.d/90-inotify.conf
>   pkill -f 'git-workshop/node_modules/electron/dist/electron'   # the orphaned windows
>   ```
>
>   Only the dev server needs inotify. The packaged app is unaffected: its sandbox watcher polls by
>   design (see `CLAUDE.md`), and Chromium's own `inotify_init` errors are harmless log noise.

---

## 🔧 Build, test, run

| Command                        | Effect                                                                                                                                                    |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `npm test`                     | **Unit tests** (Vitest) of the pure core — runs without Electron/Git.                                                                                     |
| `npm run test:watch`           | Tests in watch mode.                                                                                                                                      |
| `npm run typecheck`            | Type-check the **whole** project (incl. Electron; needs all deps).                                                                                        |
| `npm run typecheck:core`       | Type-check **without** the Electron shell (`tsconfig.check.json`).                                                                                        |
| `npm run schema:gen`           | Generate the JSON schemas (`exercise.schema.json` + `i18n/texts.schema.json`) into every exercise package.                                                                                         |
| `npm run bundles:gen`          | Build the exercise bundles reproducibly, one per language where `bundle.yaml` uses `${vars}` (also runs as `postinstall`).                                                                                     |
| `npm run icon:gen`             | Rasterize `build/icon.svg` → `build/icon.png` (for the `dist:*` builds).                                                                                  |
| `npm run unlock:gen -- "CODE"` | Print the `unlock:` block (salted hash) for a gated exercise.                                                                                             |
| `npm run electron:fetch`       | Fetch the Electron binary into `node_modules/electron/dist` (idempotent; last `postinstall` step, Electron ≥ 42 has none of its own). Skip with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. |
| `npm run dev`                  | Start the app via electron-vite (hot reload).                                                                                                             |
| `npm run build`                | Build main/preload/renderer into `out/`.                                                                                                                  |
| `npm run start` / `preview`    | Start the built artifacts.                                                                                                                                |
| `npm run clean`                | Remove build outputs (`out/`, `dist/`) and tool caches (`node_modules/.vite`, `.vitest`). Generated input assets (`*.bundle`, `build/icon.png`) are kept. |
| `npm run clean:deep`           | Like `clean`, also removes `node_modules/` → follow with `npm ci`.                                                                                        |
| `npm run verify`               | Fresh run: `clean` → `typecheck` → `test` → `build`.                                                                                                      |

> **Note:** `npm test`, `npm run typecheck:core` and `npm run schema:gen` run in any environment
> (CI, container). `npm run dev/build/start` and `npm run typecheck` need a **desktop environment**
> and the installed native modules (Electron, node-pty). The pure core is decoupled from that and
> fully tested.

---

## 📦 Dependencies

**Runtime (app):**

| Package                            | Purpose                                                               |
|------------------------------------|-----------------------------------------------------------------------|
| `electron`                         | Desktop shell, own Chromium → identical rendering across all machines |
| `node-pty`                         | real pseudo-terminal (native, compiled on install)                    |
| `@xterm/xterm`, `@xterm/addon-fit` | terminal emulator in the renderer                                     |
| `chokidar`                         | filesystem watcher on the sandbox (polling mode, see CLAUDE.md)       |
| `d3`                               | animated commit graph                                                 |
| `zod`                              | validation of the exercise file format + type inference               |
| `js-yaml`                          | parse the YAML exercises                                              |

**Build/dev:** `electron-vite`, `vite`, `typescript`, `vitest`, `tsx`, `zod-to-json-schema`,
`@resvg/resvg-js` (icon rasterization), `electron-builder`, `@types/*`.

---

## 📝 Writing exercises (file format)

An exercise package is a folder under `exercises/<slug>/` (the folder name is a readable slug,
**not** the id). Packages are **multilingual by construction**: one language-neutral *structure*
file plus one *texts* file per language.

```
exercises/feature-branch-merge/
  exercise.yaml                       # STRUCTURE: id, chapter, goals, pitfall conditions, provisioning – no prose
  exercise.schema.json                # generated: npm run schema:gen – versioned
  i18n/de-DE.yaml                     # TEXTS (German): title, intro, debrief, steps, pitfalls, vars
  i18n/en-US.yaml                     # TEXTS (English)
  i18n/texts.schema.json              # generated: npm run schema:gen – versioned
  bundle.yaml                         # declarative starting history – versioned
  feature-branch-merge.de-DE.bundle   # generated from bundle.yaml, one per language – NOT versioned (.gitignore)
  feature-branch-merge.en-US.bundle
```

`exercises/feature-branch-merge/` is a complete, runnable template. The first line of every YAML
binds its JSON schema so VS Code (with the `redhat.vscode-yaml` extension) validates as you type.

### Languages (locales)

Locales are **BCP 47 tags**: an ISO 639-1 language code plus an ISO 3166-1 alpha-2 region code
(`de-DE`, `en-US`); a bare language (`en`) is allowed too. The texts file is named after the tag
(`i18n/en-US.yaml`) and repeats it in its `locale` field. The app picks the texts matching the
**UI language** (View → Language: System / Deutsch / English, persisted as `"locale"` in
`~/.git-workshop/settings.json`; "System" follows the OS locale) with this fallback chain:
exact tag → same language, any region (`en-GB` → `en-US`) → `de-DE` → first available. A package
therefore never disappears because a translation is missing — it shows up in its fallback
language instead. The shipped exercises carry `de-DE` and `en-US`; `test/exercise/packages.test.ts`
fails as soon as one of them is missing or out of sync with the structure.

### Structure vs. texts

The **structure** (`exercise.yaml`, `schemaVersion: 2`) holds everything the validation needs and
nothing a translator touches: `id`, `chapter`, `durationMinutes`, `unlock`, `provisioning`, the
`steps` (each `id` + `goals`, optionally `pitfalls` with `id`/`when`/`severity`) and
`commonPitfalls`. The **texts** (`i18n/<locale>.yaml`, `schemaVersion: 1`) are keyed by those ids:

```yaml
# yaml-language-server: $schema=./texts.schema.json
schemaVersion: 1
locale: en-US
title: Merge a feature branch into main
intro: >                 # optional – concept framing, shown foldable above the goals
  A branch is just a **movable pointer** …
debrief: >               # optional – consolidation, shown on completion
  You joined two lines of development …
vars:                    # optional – localized VALUES, see below
  commitNotes: Add notes on main
steps:
  review-feature:        # step id from exercise.yaml
    title: Look at the feature branch
    task: |
      Switch to "feature" to look at the work.
    hints:               # escalating ladder, revealed one at a time
      - Which command switches to an existing branch?
      - "Solution:  git switch feature"
pitfalls:
  detached-head:         # pitfall id from exercise.yaml (step pitfalls and commonPitfalls alike)
    message: You are in detached-HEAD state – commits made here belong to no branch.
    recovery: "Get back with:  git switch main"   # optional
```

Every step and every pitfall of the structure needs texts in every language, and texts for an
unknown id are an error (typo protection): loading fails with a message naming file and id.
Because the goals live in the structure only, every language validates exactly the same thing.

### Localized values: `vars` and `${placeholders}`

Branch names, file names, commit messages — whatever the participant types or sees in the sandbox
belongs to the language too, yet goals and setup live in the neutral structure. So the texts file
defines `vars`, and structure, `bundle.yaml` and the texts themselves reference them as `${name}`:

```yaml
# i18n/en-US.yaml
vars: { rescueBranch: rescue, commitImportant: Important work }
steps:
  rescue:
    task: Check it out as a NEW branch named "${rescueBranch}".   # texts may use vars too

# exercise.yaml
provisioning:
  setup:
    - git commit -q -m "${commitImportant}"
steps:
  - id: rescue
    goals:
      - type: branchExists
        name: ${rescueBranch}
```

Rules: only the braced form `${name}` is recognized (a shell `$HOME` in a setup line stays as it
is); an undefined placeholder fails the load; `${locale}` (`de-DE`) and `${lang}` (`de`) are built
in and cannot be redefined. The substitution uses the vars of the **content locale**: normally the
UI language — but a *paused* attempt is resumed, and a *running* one relocalized after a language
switch, with the vars its sandbox was provisioned with (progress remembers that locale), so the
goals keep matching the files and commits that already exist. The participant then sees texts in
the new language that still name the existing files and commits.

### Identity & order

Every exercise has a required `id` (**UUID**, the stable identity for progress — survives
renaming/retitling and translation) and `chapter` (a dotted chapter number such as `"1.0"`,
`"1.1"`, `"2.0"`, also the overview's sort key), both in the structure. The **folder name** stays a
readable slug; the repository resolves the UUID to the folder on load. Generate a UUID with
`node -e "console.log(crypto.randomUUID())"`.

### Concept text (`intro` / `debrief` / `task`)

All three live in the texts file and run through the same **minimal, safe** rich-text formatter
(no Markdown library → offline/CSP-safe; HTML is escaped). Supported: paragraphs (blank line),
**bullet lists** (`- ` / `* `), `**bold**` and `` `code` ``. Within a paragraph single line breaks
are **reflowed** (Markdown soft-wrap), so literal blocks (`task: |`) wrap to the panel width instead
of at the YAML line ends. `intro` is shown (foldable) above the goals, `debrief` on completion; both
are optional. The checklist under the goals is generated from the assertions in the UI language.

### Available assertions

Discriminator `type`:
`branchExists`, `headOnBranch`, `headDetached`, `repoInitialized`, `headUnborn` (optional `branch`),
`commitExists` (+ optional `reachableFrom`), `tipHasParents`, `branchAhead`, `commitCount`,
`tagExists`, `danglingCommitExists`, `noDanglingCommits`, `fileStaged`, `fileInWorktree`,
`gitConfig` (`key`, optional `value`), `gitCommandUsed` (`name` — a single string **or a list** =
match on *one* of the commands, e.g. `[show, log]`; optional `argsContain`), `objectExists` (`kind`),
`indexEntry` (`path`). All string values may contain `${vars}`.

`repoInitialized` = a repo exists (stays satisfied after commits); `headUnborn` = freshly
initialized, **no commit yet** (HEAD on an unborn branch) — becomes unsatisfied after the first
commit. For a "`git init`" goal `headUnborn` is precise, `repoInitialized` more robust.

`commitExists` with `reachableFrom` is **fail-closed**: if the named ref does not exist (e.g.
`origin/main` before the first push), nothing counts as reachable → no match. This lets you check
"the commit arrived in the remote/bare repo" via the remote-tracking ref `origin/<branch>` without
inspecting the remote itself (it mirrors the remote's state after a successful push).

### Checking git config (`gitConfig`)

Checks the sandbox's effective config (global+local merged).
Without `value` the key only has to be set; with `value` it must match exactly; the `key` is
case-insensitive (`init.defaultBranch` == `init.defaultbranch`). Example:

```yaml
goals:
  - type: gitConfig
    key: user.email
    value: max@firma.de        # exact value required
  - type: gitConfig
    key: init.defaultBranch     # without value: must just be set
```

### Checking plumbing (B + A)

The default model is state-based and checks the *result*. For
plumbing that is not enough: read-only commands (`cat-file -p`, `ls-files`, `rev-parse`) leave no
state, and the state cannot distinguish `update-index` from `git add`. Two opt-in mechanisms close
the gap:

- **B — command observation (`gitCommandUsed`):** the sandbox shell exports
  `GIT_TRACE2_EVENT="$HOME/trace2.jsonl"` in its `.bashrc`; the `GitInspector` parses that JSONL
  (`trace2.ts`) and knows *which* git subcommand ran with which arguments — including read-only
  ones. From the `exit` events it reads the exit code; `gitCommandUsed` counts only **successful**
  calls (code 0), so e.g. `cat-file -p <invalid-hash>` does **not** satisfy the goal. Note: the
  export lives **only** in the interactive shell (not in `buildSandboxEnv`), so the inspector calls
  of each tick are **not** logged; the prompt probes (`__ws_git_branch`) run with
  `GIT_TRACE2_EVENT=false`. The file lives under `$HOME` (= the sandbox dir, **outside** the repo
  worktree) → invisible to worktree checks.
- **A — effect checks (`objectExists`, `indexEntry`):** the snapshot is extended by the **object
  database** (`objects`, from `cat-file --batch-all-objects`) and the **index** (`index`, from
  `ls-files --stage`), so mutating plumbing commands are checkable via their result.

```yaml
goals:
  - type: gitCommandUsed      # B: the right command (with -w) ran
    name: hash-object
    argsContain: ["-w"]
  - type: objectExists        # A: the effect – a blob is in the database
    kind: blob
```

`gitCommandUsed` is monotonic (a command, once run, stays "satisfied"); when **resuming** from a
snapshot the command log starts empty (the trace file lives outside the repo and is not part of the
snapshot) — negligible for short plumbing exercises. Demo: `exercises/git-plumbing-blob/`
(chapter 3.0): write a blob with `git hash-object -w`, read it back with `git cat-file -p`.

> Note: the sandbox presets `user.name`, `user.email` and `init.defaultBranch` (so `git commit`
> works without setup, see `renderGitConfig` in `sandbox/env.ts`). A config exercise therefore
> sensibly checks for a **concrete target value** (≠ the default) that the participant must actively
> set via `git config`.

### Bundles are generated, not committed

A bundle is a binary file; the committed starting history
lives declaratively in the exercise's `bundle.yaml`. That's why the `.bundle` files are in
`.gitignore`; `generate-bundles.ts` **scans** `exercises/*/bundle.yaml` and builds them reproducibly
(deterministic OIDs via fixed author dates):

```bash
npm run bundles:gen   # builds the bundles of every exercise (also runs as postinstall)
```

A `bundle.yaml` reads like a sequence of git commands and may use the `${vars}` of the texts
files (file names, contents, commit messages). The generator then builds the bundle **once per
language** and writes it to the substituted `provisioning.bundle` path of the structure — which
therefore contains `${locale}` whenever the rendered history differs between languages
(identical histories share one file; a collision is reported):

```yaml
# exercise.yaml
provisioning:
  bundle: ./feature-branch-merge.${locale}.bundle   # -> feature-branch-merge.de-DE.bundle, …

# bundle.yaml
defaultBranch: main
head: main              # branch HEAD ends up on
ops:
  - commit: Init Repo
    files: { README.md: "${readme}" }
  - branch: feature     # create a branch at the current HEAD (no switch)
  - commit: ${commitNotes}
    files: { NOTES.md: "${notesContent}" }
  - switch: feature
  - commit: Add feature
    files: { feature.js: "console.log('feature');\n" }
  - switch: main
```

A **new exercise** just gets its own `bundle.yaml` in the exercise folder — the generator finds it
automatically. Transient starting state (uncommitted changes, detached HEAD, half-finished rebase)
does **not** belong in the bundle but in the `setup:` field of the structure.

### Exercise with no repo at all

For example a `git init` exercise: set `provisioning: {}` (no `bundle`) in the
`exercise.yaml` and create **no** `bundle.yaml`. The sandbox then starts as an empty directory; see
`exercises/git-init-repo/`.

### Adding a language

1. Copy an existing texts file to `i18n/<tag>.yaml`, set its `locale`, translate title, intro,
   debrief, steps, pitfalls — and the `vars` (file names, commit messages, branch names).
2. `npm run bundles:gen` (new per-language bundles, if the package has a `bundle.yaml`).
3. `npm test` — the package test loads every package in every UI locale.

The exercise texts can be in any locale; the **UI** itself speaks the languages that have message
catalogs (`src/electron/shared/i18n/ui.ts`, `src/electron/main/i18n.ts`, checklist texts in
`src/core/i18n/assertionMessages.ts`). Adding a UI language means adding the tag to `UI_LOCALES`
and filling the three catalogs — the compiler reports every missing key.

### Unlocking exercises with a code (gating)

Optionally an exercise can be **locked** until the
learner enters a code the trainer announces in the workshop — this controls the pace. The structure
stores **only a salted SHA-256 hash** of the code, never the plaintext (the repo is public → a
plaintext code could be looked up there). The gate is language-neutral: one code per exercise,
whatever the language. Generate the block:

```bash
npm run unlock:gen -- "MY-CODE"   # prints the unlock: block with a fresh salt
```

Paste the result into the `exercise.yaml` (you keep the plaintext code and announce it):

```yaml
unlock:
  salt: "0d8b0f605a2207d6"
  hash: "53e798fac3da7a9483127a5e24aac1e245a6ed15c8ac337110592ba338c4d7e4"
```

Locked exercises appear in the overview with 🔒 (not startable); an "unlock" field takes the code.
Codes are compared **trimmed and case-insensitively**. Several exercises sharing the same code can
be unlocked with **one** entry (e.g. per chapter). The unlock state lives in progress
(`progress.json`); "reset progress" locks them again. Validation happens in main against the hash —
the code/hash never reaches the renderer.

### Trainer override

In `~/.git-workshop/settings.json`, `{"unlockAll": true}` opens every exercise
on your own machine (no code needed) — handy for demoing/preparing.

> Note: gating controls the **pace**, not the answers — the solutions are in the `hints` anyway.
> Trivial codes would be brute-forceable against the hash → choose **non-trivial** ones.

---

## 🚢 Deployment (packaging)

Distributable artifacts are produced with **electron-builder** (configured in the `build` field of
`package.json`). `npm run build` alone only produces the bundled code in `out/` — not an installable
program.

```bash
npm install                 # once; pulls electron-builder + builds node-pty natively
npm run dist:linux          # ON Linux: AppImage + tar.gz in dist/
npm run dist:win            # ON Windows: NSIS installer + portable .exe in dist/
```

### Cross-platform?

Yes (Linux + Windows + macOS), with two caveats:

1. **Native modules ⇒ build per target OS.** `node-pty` cannot be cross-compiled reliably. Build the
   Windows package on Windows, the Linux package on Linux (or via a CI matrix). electron-builder
   rebuilds native modules against the Electron ABI; `node-pty` is excluded from the asar via
   `asarUnpack` (native `.node` can't load from an asar).
2. **Runtime toolchain** (`git`, `bash`, coreutils, `vim`):
   - **Linux:** uses the system PATH (existing git/bash). For air-gapped machines without these
     tools, bundle them yourself.
   - **Windows:** no bash/git out of the box → **Git for Windows _Portable_** is fetched
     **automatically**: `dist:win` first runs `npm run vendor:win` (`scripts/fetch-git-portable.ts`),
     downloads PortableGit (needs internet + **7-Zip** on the build machine) and extracts it to
     `vendor/git-portable/`. The build packs that as `extraResources` into `resources/toolchain/`;
     the app finds it automatically at runtime (`resolveToolchain()` in `main.ts`). Existing content
     is skipped (`FORCE=1` forces a re-fetch); version/source/checksum via
     `GIT_FOR_WINDOWS_VERSION`/`_TAG`/`_URL`/`_SHA256`. Offline you can also fill the folder manually
     (see `vendor/git-portable/README.md`). Runtime override anytime via `TOOLCHAIN_BIN`/`GIT_BIN`.

The exercise packages (`exercises/`) are packed as `extraResources` into `resources/exercises/`,
matching the production path resolution (`appRoot = dirname(app.getAppPath())`).

### App icon

The source is `build/icon.svg` (versioned). `npm run icon:gen` rasterizes it to
`build/icon.png` (1024×, via `@resvg/resvg-js`, offline-capable); the `dist:*` scripts **and**
`postinstall` call it automatically beforehand (so the PNG exists even after a fresh clone for the
dev run). electron-builder derives the platform formats (`.ico`/`.icns`) from it. The PNG is
generated and **not** versioned (`.gitignore`) — like the bundles. To change the final logo, just
replace `build/icon.svg` and regenerate.

In addition **both windows** set the icon explicitly (`BrowserWindow({ icon })`), otherwise the
window/taskbar entry on Linux/KDE shows the generic toolkit default. The path is `build/icon.png` in
the dev run and `resources/icon.png` in the package (copied via `build.extraResources`); if the file
is missing, the icon is silently left unset (no crash). On **Windows** the packaged app's
taskbar/Explorer icon primarily comes from the **`.ico` embedded in the .exe** (electron-builder
derives it from `build.icon`); main also sets `app.setAppUserModelId('de.workshop.git-workshop')` at
runtime (must match `build.appId`) so taskbar grouping, pinning and notifications are attributed to
the app identity.

---

## 🧱 Architecture & project layout

The codebase follows **Clean Architecture** with the **dependency rule pointing inward**: `core`
(pure: domain, validation, graph layout, ports) ← `application` (use cases) ← `infrastructure`
(Git/Node adapters) ← `electron` (the shell and composition root, the only place that wires concrete
classes). The pure core is fully testable without Electron/Git (see `test/`).

```
src/
  core/            # PURE. No IO/Node/Electron. domain, validation, graph layout, ports.
  application/     # use cases + the runtime carrier (SessionContext)
  infrastructure/  # adapters: git (runner/inspector/parsers), sandbox, exercise repo, progress store
  electron/        # desktop shell: main (windows/menu/IPC), preload, renderer-console, renderer-graph
exercises/         # exercise packages (exercise.yaml + bundle.yaml + generated schema/.bundle)
scripts/           # generate-schema, generate-bundles, generate-icon, gen-unlock, clean, fetch-git-portable
test/              # Vitest mirror of the core
```

The full annotated source tree, the design decisions (the *why* behind each choice), the project
conventions, and an extension guide live in **[`CLAUDE.md`](./CLAUDE.md)**.