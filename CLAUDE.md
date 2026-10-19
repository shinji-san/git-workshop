# CLAUDE.md — maintenance & architecture guide

This file is the orientation for an AI (or any developer) maintaining and extending this project.
It records **what** the project is, the **annotated source tree**, the **design decisions and their
rationale** (the *why*, so changes don't accidentally break the load-bearing principles), the
**project conventions**, an **extension guide**, and the **verification** workflow.

User-facing docs (features, install/run, exercise authoring, packaging) live in
[`README.md`](./README.md). Don't duplicate them here; cross-reference instead.

---

## Project context

The workshop used to be held with up to ~8 people and is now held with **76 at once**. During the
hands-on part, individual help is no longer possible. This software takes over the **trainer's role
for the exercise part**: a real sandboxed Git console, step-by-step exercises validated
automatically, on-demand hints, pitfall detection, a live commit graph, and per-participant
progress. It must run **offline** (air-gapped) and **cross-platform**.

---

## Project structure (annotated)

Layering follows **Clean Architecture**; the **dependency rule points inward**: outer layers know
inner ones, never the reverse.

```
src/
  core/                 # PURE. No IO, no Node, no Electron. Fully testable.
    domain/             #   RepoState, Assertion (discriminated union), Verdict, Pitfall, Exercise,
                        #   ExerciseProgress (aggregate), ParticipantProgress (progress + unlock state),
                        #   compareChapters (chapter sorting)
    validation/         #   evaluators (one per assertion), evaluateStep, matchPitfalls
    graph/              #   pure railroad layout algorithm (layout.ts), GraphLayout types
    i18n/               #   Locale (BCP 47 tags, resolveLocale), assertionMessages (checklist texts per UI locale)
    ports/              #   interfaces: IGitInspector, ITerminalSession, ISandboxManager,
                        #   IExerciseRepository, IProgressStore, IClock
  application/          # use cases + runtime carrier
    SessionContext.ts   #   transient state (sandbox, revealed hints, stuck clock)
    use-cases/          #   StartExercise, ResumeExercise, PauseExercise, CompleteExercise,
                        #   ProcessRepoChange, ResetExercise, RequestHint, UnlockExercises,
                        #   RelocalizeExercise (live language switch of a running attempt)
  infrastructure/       # adapters (know Node/Git, implement the ports)
    git/                #   GitRunner (spawn, argv), ShellRunner, parsers (pure),
                        #   trace2 (GIT_TRACE2 parser, pure), GitInspector
    sandbox/            #   env (pure), SandboxManager (incl. snapshots)
    exercise/           #   schema (Zod: structure + texts), FileExerciseRepository (locale resolution,
                        #   structure/texts merge), placeholders (${vars}, pure), unlockCode (salted hash)
    progress/           #   FileProgressStore (~/.git-workshop/progress.json)
    SystemClock.ts
  electron/             # desktop shell (Electron/xterm/d3/PTY live ONLY here)
    main/               #   main.ts (windows, menu, export/about, theme, IPC),
                        #   SessionController.ts (session runtime: PTY, watcher, ticks, progress,
                        #   timer, unlock guard, locale), settings.ts (theme + locale + devTools +
                        #   unlockAll), i18n.ts (main catalogs: menu/dialogs), composition.ts, Debounced.ts
    preload/            #   thin contextBridge
    shared/             #   ipc-contract.ts (single source for Main↔Renderer), i18n/ui.ts (renderer catalogs)
    renderer-console/   #   xterm + task panel + status bar (timer); richtext.ts (safe formatter)
    renderer-graph/     #   d3 commit graph (zoom/pan, PNG export); copy.ts (clipboard targets)
exercises/              # one package per exercise: exercise.yaml (language-neutral structure) +
                        # i18n/<locale>.yaml (texts + vars per language) + optional bundle.yaml
  git-init-repo/        #   git init (1.0): no bundle, starts as an empty directory
  git-config-setup/     #   config + commit + inspect (1.1)
  feature-branch-merge/ #   merge (2.0): exercise.yaml + bundle.yaml (+ generated schema/.bundle)
  git-plumbing-blob/    #   plumbing (3.0): hash-object -w / cat-file -p (no bundle)
  git-remote-bare/      #   remote/bare (4.0): git init --bare, remote add, push (no bundle)
  git-reflog-rescue/    #   reflog recovery (5.0): hard-reset, rescue a lost commit as a branch
  git-gc-prune/         #   garbage collection (5.1): remove orphaned commits via gc --prune=now
scripts/
  generate-schema.ts    #   Zod → JSON schemas (exercise.schema.json + i18n/texts.schema.json per package)
  generate-bundles.ts   #   scans exercises/*/bundle.yaml and builds the bundles (one per locale with ${vars})
  generate-icon.ts      #   build/icon.svg → build/icon.png
  gen-unlock.ts         #   prints an unlock: block (salted hash) from a plaintext code
  clean.ts              #   removes build outputs + caches (npm run clean / clean:deep)
  fetch-git-portable.ts #   downloads Git for Windows Portable for the Windows build
  fetch-electron.ts     #   fetches the Electron binary (Electron ≥ 42 has no postinstall of its own)
build/
  icon.svg              #   app-icon source (versioned; icon.png is generated, gitignored)
test/                   # Vitest mirror of the core (+ a few infra/electron-pure tests)
```

---

## Architecture & design decisions

This section records the decisions with their rationale.

### Stack: Electron + xterm.js + node-pty

The hands-on part needs a **real** console (interactive editors, arbitrary tools on the `.git`
folder). That forces a real PTY plus a terminal emulator — the solved path in the JS ecosystem (the
same stack as VS Code). Avalonia/.NET was rejected because terminal emulation there would be too
costly. **Electron over Tauri** because (a) the bundled Chromium **renders identically** across 76
uncontrolled machines, (b) no system webview runtime can be assumed in an air-gapped network
(self-containment), (c) `node-pty` is the canonical PTY path. Consequence: on Windows, bundle **Git
for Windows Portable** (MinGit is not enough).

### Clean Architecture, dependency rule inward

`core` is pure and depends on nothing. `application` orchestrates use cases over **ports**
(interfaces). `infrastructure` implements the ports against Git/Node. `electron` is the shell and the
**composition root** — the only place that wires concrete classes (`composition.ts`). As a result
the whole core is testable without Electron/Git (see `test/`).

### Use cases = discrete SRP operations

Every user intent is its own use case (`StartExercise`, `ResumeExercise`, `PauseExercise`,
`CompleteExercise`, `ProcessRepoChange`, `ResetExercise`, `RequestHint`, `UnlockExercises`). The
persistable application logic (writing snapshot + progress on pause, recording completion, recording
unlocks) lives in **tested** use cases. The imperative session runtime (PTY, watcher, ticks, timer
deadline, the held progress) is bundled in the **`SessionController`**; it talks to the windows only
through a thin `SessionView` interface. `main.ts` therefore holds only window, menu and
export/about concerns (~4 globals).

### ExerciseProgress vs. SessionContext

`ExerciseProgress` (in `core/domain`) is a **pure aggregate**: it guards only the invariant
"forward only, only when the step is satisfied" — no IO, no `repoPath`. `SessionContext` (in
`application`) is the **thin runtime carrier**: sandbox, revealed hints, already-reported pitfalls,
stuck timestamp.

### Validation is purely declarative

Commits are **never referenced by OID** (hashes are non-deterministic) but **structurally** (parent
count, ahead/behind, reachability) or via the `summary`. An `Assertion` is a **discriminated
union**; there is exactly one evaluator per type. A **mapped type**
(`{ [K in AssertionType]: ... }`) enforces completeness: a missing evaluator does not compile.
`Step.goals` is an AND-list; the `Verdict` aggregates the individual results into a checklist.

### Trainer substitute: hints, pitfalls, stuck detection

Three deliberately separate mechanisms:

1. **Hints (pull)** — an escalating ladder, revealed one at a time on demand (`revealedHints` in
   `SessionContext`).
2. **Pitfalls (push)** — **affirmatively** detected bad states (`when: Assertion[]`, AND-joined).
   **Edge-triggered**: a pitfall is reported only on the *transition*, not on every tick
   (`matchedPitfalls` set). There are per-step (`Step.pitfalls`) and exercise-wide
   (`Exercise.commonPitfalls`) pitfalls, with `severity` and an optional `recovery`.
3. **Stuck detection** — time-based via the `IClock` port (testable): on no progress beyond a
   threshold, the next hint is revealed automatically.

Important: **"goal not satisfied" is not an error** — only pitfalls are errors.

**Concept layer (didactics).** Besides procedural feedback, exercises carry two optional,
exercise-wide fields for *understanding*: **`intro`** (concept framing, shown foldable above the
goals — "why/what" *before* doing) and **`debrief`** (consolidation on completion — "what happened /
real-world use"). They travel exercise-wide via `TickBroadcast`; exercises without the fields behave
unchanged.

**Rich text (`richtext.ts`).** `intro`, `debrief` **and `task`** run through the same **minimal,
safe** formatter (no Markdown lib → offline/CSP-safe; HTML is escaped). Supports: paragraphs (blank
line), **bullet lists** (`- ` / `* `), `**bold**` and `` `code` ``. Within a paragraph single line
breaks are **reflowed** (Markdown soft-wrap) — literal blocks (`task: |`) wrap to the panel width
instead of at the YAML lines.

### RepoState construction (GitInspector)

The full DAG is read **once per tick**; after that all topological assertions are pure graph
computations. Orphaned commits = **all commit objects** (`git cat-file --batch-all-objects
--batch-check`) **minus** those reachable from refs (`git rev-list --all HEAD`, deliberately
**without** `--reflog`). Further plumbing: `cat-file --batch` (hydrate, including the full commit
message — feeds the graph popup, no extra git call), `for-each-ref` (NUL format), `symbolic-ref` +
`rev-parse` (HEAD incl. unborn), `status --porcelain=v2 -z`, `ls-files --stage -z` (index).
Additionally the inspector reads the sandbox's **GIT_TRACE2 log** (`commands`, see plumbing check).
NUL-separation throughout, `LC_ALL=C`, `core.quotepath=false`. The impure `GitRunner` (argv, **no
shell**) is strictly separated from the **pure parsers** (the latter are tested).

### Graph layout: a custom pure railroad algorithm

No `@gitgraph/js` (fights orphans), no `dagre` (un-git-like). Four steps: (1) components via
union-find, (2) topological sort (child before parent, tiebreaker = committer date descending),
(3) lane assignment **per component** with a band offset (disconnected components appear set apart),
(4) edges/refs. `layout(state, previous?)` stays **pure**; `previous` is the **hysteresis seam** for
stable animations (currently reserved, see open points). The layout also carries a per-commit
**sidecar** `GraphLayout.commits` (author/committer/message keyed by oid) for the detail popup.

### d3 animation (MUST HAVE)

OID as the **join key** (stable), nodes animate `cx/cy`, edges interpolate their endpoints via
`attrTween` (not the `d` string), transitions are interruptible (last-one-wins),
`prefers-reduced-motion` is respected. All in the renderer; the core stays untouched (apart from the
`previous` parameter).

### Provisioning & sandbox isolation

`git bundle` carries the **committed history** (offline transport); an optional `setup` script
establishes **transient** state (worktree/index/in-progress) and runs in the sandbox shell.
Isolation via the environment (`GIT_CONFIG_GLOBAL/SYSTEM/NOSYSTEM=1`, `HOME`, `PATH`→toolchain,
`LC_ALL=C`) plus a sandbox `.gitconfig` (`gc.auto=0` so orphans aren't collected;
`core.quotepath=false`; `core.editor`=a real editor; `longpaths`). The **same env** is used by the
PTY *and* the inspector. `LC_ALL=C` keeps the inspector output deterministic; the **interactive
shell** however switches via `.bashrc` to a **UTF-8 locale** (C.UTF-8 or the first available UTF-8
locale) so **umlauts/multibyte input** work in readline and editors — the inspector stays on `C`.
**Reset = clone-then-swap.** Before the clone, `git bundle verify` (offline you can't "re-fetch").
Determinism data (date/author) only author-side or in setup, **not live** (otherwise the topo
tiebreaker breaks).

**Without a bundle** (`provisioning` without `bundle`) the sandbox starts as an **empty, not-yet-
initialized** directory — for `git init` exercises. The `GitInspector` detects this up front
(`rev-parse --is-inside-work-tree`) and returns an empty state with `head.kind: 'none'` instead of
throwing; after `git init` it becomes `unborn`.

### Progress, pausing & resuming (snapshot)

Learning progress is persisted **per participant** outside the repo (`~/.git-workshop/progress.json`),
encapsulated behind the `IProgressStore` port (adapter: `FileProgressStore`, atomic write). The pure
aggregate `ParticipantProgress` (in `core/domain`) **derives** the display status
(`paused > completed > new > not-started`) — "new" via a `seenExerciseIds` set (so exercises shipped
by a later version stand out) — and holds the **unlock state** (`unlockedIds`). Time comes in as a
parameter so the aggregate stays pure/testable. `locked` in the status view defaults to false in the
domain and is filled by the `SessionController` (it needs the exercise's `gated` flag + the trainer
override).

**Real resume** instead of restart: on pause the **whole sandbox directory** (the sandbox HOME —
worktree + `.git` **and any sibling repos the exercise created outside the worktree**, e.g. a bare
remote at `../remote.git`) is copied as a **snapshot** to `~/.git-workshop/snapshots/<uuid>/`
(`SandboxManager.saveSnapshot`); capturing the whole dir preserves the relative layout so relative
remote URLs keep resolving. `ResumeExercise` builds a fresh sandbox from it
(`createFromSnapshot`), regenerates the HOME-level config, drops the carried-over GIT_TRACE2 log, and
positions progress at the last step (`ExerciseProgress.resumeAt`). "Restart" (🔄) discards the
snapshot. A completed exercise with no live attempt is **locked** in the overview — only 🔄 reopens
it.

The **exercise search** filters client-side: `renderPicker()` loads list + progress once and caches
them, `drawRows()` renders the (filtered) view on each keystroke — no IPC per keystroke. Matching is
on `"<chapter> <title>"`, normalized (lowercase + umlaut fold ä→a/ö→o/ü→u/ß→ss) so input with and
without umlauts matches.

### Code gating (unlock codes)

An exercise may carry an `unlock: { salt, hash }` block: a **salted SHA-256 hash** of a code (never
the plaintext — the repo is public). `FileExerciseRepository.matchUnlockCode(code)` hashes the typed
code (trimmed + lower-cased, via `infrastructure/exercise/unlockCode.ts`) against each gated
exercise's stored hash and returns the matching ids; `UnlockExercises` records them in
`ParticipantProgress.unlockedIds` and persists. The renderer only ever learns a **`gated` boolean**
(via `ExerciseSummary`) and the resulting `locked` flag — the code/hash stay in main. The
`SessionController` guards `open`/`restart` (defense-in-depth) and applies the **trainer override**
`settings.json "unlockAll"`. Gating controls the **pace, not the answers** (solutions are in the
hints), so a non-trivial code is enough.

### Timer (optional)

`durationMinutes` in the `exercise.yaml` enables a countdown in the status bar. **Main holds the
authoritative deadline** and sends the remaining seconds on start/resume/reset (`timer:set`); the
**renderer** counts down visibly, blinks the last minute red, plays a **metronome tick** per second
in the final 10 s and a **beep** at expiry (Web Audio, synthesized, no asset, offline). Pausing
freezes the remaining time (in `progress.json`); resuming continues from the same point. Expiry is
**soft** (a hint, no abort).

### Sandbox observation: polling instead of inotify

The tick is triggered by a `chokidar` watcher on the sandbox (debounced). In its default mode
chokidar calls `fs.watch` for **every watched file and directory**; on Linux each of those is an
inotify *watch* on the **single inotify instance** libuv keeps per event loop. Both are per-user
kernel limits shared by **every process of the session**: the watches count against
`fs.inotify.max_user_watches` (8192 on older kernels, RAM-scaled on newer ones), the instance against
`fs.inotify.max_user_instances` (128 by default). A `.git/objects` with thousands of loose objects
(e.g. after resuming a worked-on exercise) burns thousands of watches, and a busy desktop (browsers,
IDEs, Electron apps) alone can sit at the instance limit. When either limit is hit, `fs.watch` fails
with `ENOSPC`/`EMFILE`; chokidar merely emits an `error` event and leaves the affected paths
unwatched → no ticks, with nothing visible in the UI. So the watcher runs in **polling mode**
(`fs.watchFile`, stat-based, no inotify at all) and ignores `.git/objects` (every relevant git
operation also touches HEAD/refs/index/logs/config → the trigger stays complete). The **dev server**
(Vite) still uses inotify — see README → Troubleshooting for the symptoms when the instance limit is
exhausted.
Additionally the watcher observes the **GIT_TRACE2 log file** (`$HOME/trace2.jsonl`, outside the
repo): purely read-only plumbing commands (`cat-file`, `ls-files`, …) change nothing in the worktree
and would otherwise trigger **no tick** — via the (per git-call growing) trace file the tick still
fires, so `gitCommandUsed` goals evaluate reliably. The controller **pre-creates the trace file**
(empty, append mode) before starting the watch: git only creates it on the first traced call, and
chokidar (v3 and v4 alike) does not pick up a path that does not exist when the watch starts.

### Graph: zoom/pan, PNG export, hover/click/right-click

All graph content lives in a zoom layer; **Ctrl+wheel** zooms (custom `wheelDelta` to neutralize
d3's 10× ctrl amplification), drag pans; a mousedown pans only with the **left** button so a
right-click can raise the copy menu. The **PNG export** (menu → File) serializes the SVG with
**inlined styles** + background + watermark into a clone, rasterizes it via `<canvas>` and hands the
bytes to main, which shows a save dialog (default `commit-graph_<slug>_<timestamp>.png`). The graph
styles have **one source** (`GRAPH_CSS` in `graph.ts`): injected into the document at runtime
(screen) and reused for the export — the latter only appends two special rules (explicit font for
the standalone SVG, arrowhead without `context-stroke`).

**Hover over a node** shows its **SHA** (`PositionedNode.oid`, first 7 chars bold, rest dimmed) in a
**DOM `<div>` outside the SVG** (positioned at the cursor, `pointer-events: none`, flips at window
edges) — follows the theme and does **not** appear in the PNG export. **Click** opens a **detail
popup** with author, committer, author/committer dates (formatted in the commit's **original time
zone**, `YYYY-MM-DD HH:MM:SS ±HHMM`, like `git show`) and the full commit message, fed by the
`GraphLayout.commits` sidecar (no extra git call). **Right-click** raises a **native copy context
menu** (SHA / message / author / committer / all); the detail popup also has per-field copy buttons.
Both the menu and the buttons derive their clipboard strings from a single pure source
(`renderer-graph/copy.ts`), and copying runs in main via Electron's `clipboard` (the popup buttons
reuse the existing clipboard bridge; the menu uses a `graph:copy-menu` channel). Tooltip, popup and
buttons are DOM outside the SVG → never in the export.

### Export console output

**File → Export console output…** saves a **transcript** of the terminal output as **plain text**
(`.txt`). Instead of recording the raw PTY stream (which would contain line-editing artifacts and
full-screen-app garbage), the renderer serializes the **already reconstructed xterm buffer**
(scrollback + screen, `buffer.translateToString`): line corrections are already applied, and
full-screen apps like `nano` run on the *alternate screen* → their content never lands in the
scrollback. The flow mirrors the PNG export: menu → request to the console window → renderer
serializes → text back to main → save dialog (default `konsole_<slug>_<timestamp>.txt`). Scrollback:
5000 lines.

### Application menu & About

**Reset progress** (File): after a confirmation it resets the entire participant progress — ends a
running exercise, deletes all resume **snapshots** (`sandboxes.clearSnapshots()`) and the
`progress.json` (`progressStore.clear()`), reloads fresh (re-seeds `seenExerciseIds` so nothing is
"new"; also clears unlocks) and sends the console back to the (re-rendered) overview. Intended for
the **participant switch** on the same machine.

Global actions go through the **application menu** (File → export/quit, View, Help → About) —
deliberately **no** extra in-window buttons. The menu lives only on the **console window**; the graph
window stays chrome-free (`setMenuBarVisibility(false)`). "About" is a **modal** dialog bound to the
active window (`dialog.showMessageBox`) with version/author/project page and buttons for the **MIT
license text** (inline, offline) and the project page.

**DevTools** are hidden by default and opt-in only via `~/.git-workshop/settings.json` with
`"devTools": true`. Then the menu item appears (View → DevTools, acts on the focused window) and the
**graph window** also gets its menu bar so DevTools is reachable there too. The same `settings.json`
also reads `"unlockAll"` (the gating trainer override).

### Light/dark theme

Under **View → Appearance** you choose **System / Light / Dark**. Default is **System**: Electron's
`nativeTheme` resolves the preference to an effective `light`/`dark` and follows OS changes live
(`nativeTheme.on('updated')`). The choice is persisted in `~/.git-workshop/settings.json`
(`SettingsStore`, which writes by merging so it preserves other keys like `devTools`/`unlockAll`).
Main sends the effective theme over IPC (`theme:get` + `theme:changed`) to both windows; the
renderers set it as `<html data-theme>`. All colors are **CSS custom properties** (dark as the base,
`[data-theme="light"]` overrides) — one source for screen **and** PNG export. xterm gets its colors
read back from the same variables; the export pulls the **resolved** values of the current theme
onto the SVG clone (so the exported image follows the visible theme).

### Exercise format: YAML with an anti-corruption layer

YAML over JSON (comments, block scalars for prose). The on-disk format is a **separate, stable DTO**,
distinct from the domain types — `FileExerciseRepository` translates (read → Zod-parse → DTO →
domain) and resolves relative bundle paths. Validation via **Zod** (one source for the runtime check
*and* the type; `discriminatedUnion`). A **JSON schema** is generated from the Zod schema; the YAML
references it via `# yaml-language-server: $schema=…` → validation/autocomplete **while typing** in
the editor. A `schemaVersion` field allows later migration. An exercise package is a **folder**
(`exercise.yaml` structure + `i18n/<locale>.yaml` texts + `bundle.yaml` + schemas, with the
`.bundle` files generated per locale) with relative paths → freely movable across the 76 machines.

### Internationalization (i18n)

Locales are **BCP 47 tags** (ISO 639-1 language + ISO 3166-1 region, e.g. `de-DE`, `en-US`),
resolved by the pure `core/i18n/Locale.ts`: exact tag → same language → `DEFAULT_LOCALE` (`de-DE`)
→ first available. Three layers, three catalogs, all **typed for completeness** (a missing key in
one language does not compile):

1. **Exercise content** is split into a language-neutral **structure** (`exercise.yaml`: ids,
   goals, pitfall conditions, provisioning, unlock) and one **texts** file per locale
   (`i18n/<locale>.yaml`: title/intro/debrief, per-step title/task/hints, per-pitfall
   message/recovery, keyed by id). Localized *values* (branch/file names, commit messages) are
   `vars` of the texts file, substituted as `${name}` into structure, texts and `bundle.yaml`
   (`placeholders.ts`, pure; `${locale}`/`${lang}` built in). `FileExerciseRepository` merges both
   into the resolved domain `Exercise`, which therefore carries **two locales**: `locale` (texts)
   and `contentLocale` (the vars the sandbox was built with). They differ only after a resume or a
   live switch — `ParticipantProgress` records the content locale on pause so goals keep matching
   the already-provisioned sandbox, and `RelocalizeExercise` swaps only the texts of a running
   attempt (`SessionContext.relocalized`). Bundles are generated per locale when `bundle.yaml` uses
   vars (`provisioning.bundle` then contains `${locale}`).
2. **Checklist texts** of the verdict come from `core/i18n/assertionMessages.ts` (one catalog per
   UI locale, mapped over `AssertionType`); `evaluate()` takes the locale, `holds()` is the
   text-free predicate used for pitfalls.
3. **UI chrome**: renderer strings in `electron/shared/i18n/ui.ts` (both windows), main-process
   strings (menu, dialogs, context menus, thrown participant-facing errors) in
   `electron/main/i18n.ts`. The effective UI locale = settings `"locale"` (`system` → Electron's
   `app.getLocale()`), pushed over IPC (`locale:get`/`locale:changed`); the renderers re-label
   static elements in `applyLocale()`, the controller relocalizes the session and re-ticks.

Author-facing diagnostics (YAML validation errors) stay German, as before.

---

## Project conventions (working agreements)

- **Commits:** write commit messages in **English**, with **no `Co-Authored-By` footer**. Commit (or
  push) **only when the user asks**.
- **Git scope:** the `git-workshop` directory is **its own git repo on branch `develop`**. Stage
  only this repo's own files — the parent `MyTests` working tree has unrelated changes that must not
  be swept in. Branch before committing if on the default branch.
- **Comment/string language:** **code comments in English.** Participant-facing UI strings live in
  the i18n **catalogs** (`de-DE` **and** `en-US`, both filled — never a literal in a renderer or in
  main). Author-facing YAML diagnostics stay German. YAML: comments in `exercise.yaml`/`bundle.yaml`
  in German, each `i18n/<locale>.yaml` in its own language.
- **UUIDs:** use **real UUIDs**, never patterned placeholders — including in tests.
- **App-level actions** belong in the **application menu**, not as extra in-window buttons.
- **Secrets in a public repo:** the repo is public and exercise `hints` already contain solutions, so
  gating is about **pacing, not anti-cheat**. Anything that must not be discoverable (e.g. unlock
  codes) is stored **hashed** (`unlockCode.ts`), never as plaintext.
- **Toolchain:** Node 22 via `export PATH="$HOME/.local/node22/bin:$PATH"` before running npm.
  **Dependency changes:** the npm 10.9.0 bundled with Node 22.12 crashes with `Cannot read properties
  of null (reading 'edgesOut')` whenever `npm install <pkg>` / `npm audit fix` has to resolve this
  tree's peer sets (vitest/vite/electron). Use `npx -y npm@11 <command>` for those; `npm ci`, `test`
  and `build` are unaffected. (Unrelated to npm: Electron ≥ 42 ships **no postinstall** any more,
  so our `postinstall` ends with `scripts/fetch-electron.ts`, which runs Electron's own installer
  idempotently; `ELECTRON_SKIP_BINARY_DOWNLOAD=1` skips it, `npm run electron:fetch` retries it.)
- **Purity:** never import Node/Electron/Git in `core/`. IO belongs in `infrastructure`, wiring in
  `electron/main/composition.ts`. Keep IPC handlers in `main.ts` thin.

---

## Extension guide

- **Add a new assertion:** add the union member in `core/domain/Assertion.ts` → the compiler then
  forces a predicate in `core/validation/evaluators.ts` **and** a checklist text per UI locale in
  `core/i18n/assertionMessages.ts` → add the same case in `src/infrastructure/exercise/schema.ts`
  (`discriminatedUnion`) → `npm run schema:gen` → add a test in `test/core/evaluators.test.ts`.
- **Keep purity:** never import Node/Electron/Git in `core/`. IO in `infrastructure`, wiring in
  `electron/main/composition.ts`.
- **New use cases:** as their own class in `application/use-cases/`, depending only on ports. IPC
  handlers in `main.ts` stay thin (delegate to the `SessionController`).
- **Change git plumbing:** impure spawning in `GitRunner`/`GitInspector`, parsing in `parsers.ts`
  (pure, with a unit test). Never split on whitespace — use the NUL format.
- **Adjust the graph:** layout logic stays pure in `core/graph/`; everything visual (SVG/d3) in
  `renderer-graph/`.
- **Gate an exercise:** `npm run unlock:gen -- "CODE"`, paste the `unlock:` block into the
  `exercise.yaml`, keep the plaintext code to announce it.
- **Translate an exercise:** add `i18n/<tag>.yaml` (title, intro, debrief, steps, pitfalls, vars),
  `npm run bundles:gen`, `npm test` (`packages.test.ts` loads every package in every UI locale).
- **Add a UI language:** add the tag to `UI_LOCALES` (`core/i18n/Locale.ts`) and fill the three
  catalogs (`assertionMessages.ts`, `shared/i18n/ui.ts`, `main/i18n.ts`) plus `LANGUAGE_NAMES`; the
  compiler lists every missing key. Ship `i18n/<tag>.yaml` for the exercises.

---

## Verification

Run with the Node 22 toolchain on PATH (`export PATH="$HOME/.local/node22/bin:$PATH"`).

- `npm run verify` — fresh `clean` → `typecheck` → `test` → `build` (the one-shot check).
- `npm test` / `npm run typecheck:core` / `npm run schema:gen` run in **any** environment (CI,
  container) — they don't need Electron.
- `npm run dev` / `build` / `start` and `npm run typecheck` need a **desktop environment** and the
  native modules (Electron, node-pty).
- After regenerating: `npm run schema:gen` rewrites `exercises/**/exercise.schema.json` (versioned).
- `npm run clean:deep && npm ci` for a truly fresh dependency tree; if Electron's binary download was
  skipped or failed, re-run `npm run electron:fetch`.

---

## Known state / open points

- **Pure core: fully implemented and tested** (`npm test` — currently 139 green: domain aggregate,
  `ParticipantProgress`/`resumeAt`/unlock, pause/complete/unlock use cases, evaluators (incl.
  plumbing checks), layout, parsers (incl. objects/index/trace2), sandbox env, snapshot round-trip,
  schema validation (structure + texts), locale resolution, assertion catalogs, placeholders, the
  exercise repository (fallback, content locale, author errors), every shipped package in every UI
  locale, relocalization, chapter sorting, file slug, application tick, copy targets, rich text).
  `npm run typecheck:core` is clean; `schema:gen`/`bundles:gen` produce their artifacts.
- **Electron shell (`src/electron/`):** builds (`npm run build`) and runs (`npm run dev`). Needs a
  desktop environment + native modules. The full packaging run (`npm run dist:*`, AppImage/NSIS)
  must be done per target OS.
- **Layout hysteresis:** the `previous` parameter of `layout()` exists as a seam but is not yet used
  for lane stabilization — the d3 animation is already stable via the OID join. Next step: prefer
  previous lanes.
- **Toolchain bundling:** fully automated (see README → Deployment — `build.win.extraResources` +
  `resolveToolchain()`): `dist:win` fetches Git for Windows Portable via `npm run vendor:win`
  (download + 7-Zip extract into `vendor/git-portable/`, not in the repo). Override anytime via
  `TOOLCHAIN_BIN`/`GIT_BIN`.
- **esbuild** is pinned to `0.28.1` via an npm `override` (security advisory covered esbuild
  0.17.0–0.28.0). vite ≥ 7.3.7 already accepts `^0.28.0`, but electron-vite 5.0.0 still requires
  `^0.25.11` (electron-vite 6 has no esbuild dependency at all) → the override can go with the
  electron-vite 6 upgrade.
- **global-agent** is overridden to `^4.1.3`: electron-builder's `app-builder-lib` depends on
  `@electron/get` 3.x, whose optional proxy helper `global-agent` 3.x pulls `roarr` → `sprintf-js`
  (advisory, no fixed version). 4.x keeps the `bootstrap()` API and drops `roarr`. Build-time only
  (not shipped). Drop the override once app-builder-lib depends on `@electron/get` ≥ 5 (27.x).
