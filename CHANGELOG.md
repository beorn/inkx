---
depth: 1
---

# Changelogt

## [Unreleased]

### Added

- tui,commands,core: Defensive command chain with boundary error feedback
  - Added Result<T,E> type to @km/core for explicit error handling
  - Added ActionError types (boundary, precondition, unimplemented) to @km/commands
  - Navigation handlers now return boundary errors when operations can't proceed
  - Users get feedback (bell indicator) when hitting navigation boundaries
  - Escape key is now hierarchical: close overlays → zoom out → boundary
  - Simplified test helpers by removing allowNoEffect flags
  - Resolves: km-defensive-chain.6
- tui,core: Status messages integrated into bottom bar with boundary feedback
  - Added NotificationLevel type to @km/core for consistent UI feedback levels
  - Status messages display in bottom bar middle section (takes priority over indicators)
  - Selection actions show status messages ("3 items selected", etc.)
  - Boundary navigation rings terminal bell (\x07) + shows warning message with 🔔 visual indicator
  - Status messages clear automatically on next keypress
  - Resolves: km-defensive-chain.7
- core: Cross-layer event system for observability and decoupling
  - Added kmEvents global emitter using nanoevents (107 bytes)
  - Three event categories: User (UI feedback), Debug (tracing), Metric (performance)
  - Full TypeScript type safety with interface-based typing
  - Disposable support: works as unbind function, .dispose(), and using keyword
  - DisposableStore for managing multiple subscriptions
  - Complete docs in docs/dev/events.md
  - Resolves: km-defensive-chain.8

### Fixed

- TUI: Fixed j/k navigation not working - keybindings produced cursor_up/cursor_down with "up"/"down" directions, but handleTreeNavigation() only handled "prev"/"next". Added mapping in handleCursorMove() and exhaustiveness checking to prevent future regressions.

### Changed

- docs,tests: Clarified .spec.ts is reserved for acceptance tests only (UI-level, CLI)
  - Unit tests use .test.ts naming convention
  - Updated testing.md with test level table and file naming guidelines
- tui,tests: migrate UI tests to spec pattern with tree fixtures
  - Created board.spec.ts with decker-inspired item() tree builder
  - Added testEnv() helper for one-line fixture creation + rendering
  - Migrated 14 UI acceptance tests from board.test.ts to board.spec.ts
  - Reduced board.test.ts from 1056 lines to 520 lines (unit tests only)
  - Tests now use tree builder pattern: item("board", item("col", item("card")))
  - CSS selectors for structural tests: #col1 #1a, #card[data-cursor]
  - boundingBox() for visual layout tests
  - Resolves: km-lp7k

### Bug Fixes

- tui: prevent constant re-renders from spinner animation (db5457d)
  - Fixed unconditional setInterval in useSpinnerFrame causing 60ms render loop
  - Spinner animation now only runs when actually loading/syncing
  - Resolves: km-jfr6
- storage: intercept createDebug.log in workers before imports (db5457d)
  - Prevents debug() calls from imported modules going to stderr in worker threads
  - All worker debug output properly forwarded to DEBUG_LOG
  - Fixes debug messages interfering with TUI rendering
  - Resolves: km-lvrl

## 0.2.0 (2026-01-23)

### Features

- board,storage: add Board and Config domain objects (40beb76)
- cli: add stats command as domain object migration example (3eb7473)
- core: add Service interface and generator utilities (3d45cc4)
- storage: add Repo domain object and createRepo factory (7b4a052)
- storage: add Watcher service and createWatcher factory (a37a67b)

## 0.1.1 (2026-01-23)

### Features

- add claude-session tool for searching/recovering files from session history (7431527)
- add domain objects and Service interface (7631b5c)
- add MockFileSystem for in-memory filesystem testing (648de91)
- agent: improve harness, queries, and sessions (35a98cb)
- beads: implement resolveShortId and dependentCount; fix visual testing (084c37e)
- beads: implement resolveShortId and improve sync (417bbcd)
- board: add Board domain object with simpler API (50eaab5)
- board: implement curswant for sticky cursor navigation (1dd1b70)
- chaos: add CLI wrapper for chaos fuzzer (80e7863)
- cli: add /bd skill for beads issue tracking (7d2f695)
- cli: add /commit command for multi-repo commits (cbf57a5)
- cli: add bootstrap entry point for early loading indicator (81dc923)
- cli: improve /commit with bd sync and submodule guidance (e83849e)
- cli: improve bd commands and add task progress utility (4d86cf6)
- cli: improve progress reporting for repo loading (edf3b93)
- cli: improve view loading with task progress (84f5d79)
- cli: integrate progressx for progress indicators (30a6af9)
- cli: restore loading indicator with dynamic storage import (1171730)
- cli: show loading indicator immediately on km view (110a8af)
- cli: wire up stats command and update version import (671bad6)
- docs,tui,core: fix docs, TUI bugs, add core tests (c9b9fe9)
- filesystem paths as node refs + fix selection colors per design system (4f88041)
- improve storage, caldav, and core packages (cdd698a)
- nav: bind j/k to up/down directions, constrain to column hierarchy (9e9b229)
- progressx: add tests and contributing guide (337269f)
- query: add inline property queries and property-based backlinks (24283ec)
- refactor1: architecture review and cleanup (cb646ea)
- storage: add bidirectional chaos tests and regression system (14bff28)
- storage: add chaos simulation test framework and robustness improvements (47112e4)
- storage: add deterministic concurrent chaos tests (04d358d)
- storage: add P1 robustness improvements for sync system (7b5d682)
- storage: add recursive reconciliation and stress tests for chaos framework (3a5a032)
- storage: resolve embedded wikilinks to link_to field (b180397), closes target#section
- storage: run chokidar watcher in worker thread for non-blocking startup (93decb1)
- tui: add generator-based board state initialization (fa88b53)
- tui: implement sticky Y navigation and improve card positions (d97297d)
- tui: implement sticky Y navigation for h/l cross-column movement (e64f970)
- tui: improve bottom bar formatting and clarity (55f66d3)
- tui: use icons for DB and file counts in bottom bar (ad3fce5)
- watcher-chaos: add MockFileSystem for virtual fs testing (e4a7703)
- watcher-chaos: extract chaos testing framework to vendor package (0116557)

### Bug Fixes

- board: use ratio-based curswantY for cross-column navigation (c97df56)
- cli: consume ensureState generator to prevent timeout (7dd5837)
- cli: detect submodules with .git files in /commit (f06300f)
- markdown: eliminate extra newlines between consecutive list items (a9c98df)
- resolve all lint errors (abb7e0d)
- skill: apply Claude Code best practices to /bd skill (f917e58)
- storage: filter ignored paths in watcher event handler (234e4d3)
- storage: fix glob pattern matching for /.git/ ignore patterns (7ddc8cd)
- storage: forward worker debug messages to main thread for DEBUG_LOG capture (b7205cd)
- storage: get all descendants in getFileWithChildren (586b2bb)
- storage: preserve node IDs during watcher reconciliation (690540d)
- storage: prevent data loss on concurrent FS/DB edits (b89c05f)
- storage: prevent syncToFs from corrupting non-markdown files (b999423)
- storage: suppress worker localDebug when DEBUG_LOG is set (2fdc315)
- storage: use structural matching in node diff instead of md_pos (8524d97)
- testing: eliminate React act() warnings in test output (3ae7eaf)
- tree: use KNode type instead of DOM Node in display.ts (8711c65)
- tui: add paddingLeft to storybook card boxes (891e7d6)
- tui: correct storybook visual rendering width (d5911fe)
- tui: implement edge-based scrolling for cards and columns (308a7f9)
- tui: improve ColumnsView layout and styling (d823030)
- tui: increase virtualization overscan to prevent blank rendering (b8914ef)
- tui: prevent bottom bar right side truncation (8039c53)
- tui: restore terminal state on SIGTERM/SIGINT (b75e9c0)
- tui: scroll containers now follow cursor in all views (9ed343d)
- tui: update inkx for scroll container background fix (92016cb)
- tui: use ref to prevent stale closure in refresh handler (1db376d)
- update tui-measure submodule to correct commit (9978631)

### Performance Improvements

- tui: add shared memoized components for all views (4d32d05)
- tui: fix O(n) cursor search and N+1 column queries (f5f5960)
- tui: fix selector performance - select booleans not Sets (e1472ff)
- tui: optimize cursor movement with React.memo and useMemo (3c365ab)
- tui: optimize ListView rendering with pre-cached board pills (75329da)
- tui: separate columns memoization from cursor indices (534f461)

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- Node aggregation: mentions, tags, and projects from child nodes bubble up to file nodes
- bd command for beads issue tracking integration
- km agent and bd agent CLI commands for AI-assisted workflows
- Debug script with tmux wrapper and lnav integration (bun debug)
- DEBUG_LOG environment variable for redirecting debug output to file
- Retry logic with exponential backoff for WriteQueue filesystem operations
- Conflict detection and resolution for concurrent TUI/filesystem edits
- Permission error handling with actionable user suggestions (EACCES/EPERM/EROFS)
- Symlink detection during directory scanning (skipped to avoid infinite loops)
- Case-sensitivity detection and collision detection for cross-platform compatibility
- resolveShortId() function for beads short ID to node ID lookup
- dependentCount calculation for beads issues (reverse dependency tracking)
- scripts/playwright-capture.ts for headless TUI screenshot capture via ttyd

### Changed

- Simplified engine abstraction (removed legacy Ink engine, only inkx remains)
- Cursor system redesign: zoom operations now preserve selection context
- Renamed selectedNodeId to cursorNodeId for clarity
- Progress indicators now update every directory during sync (previously every 10)
- Unified progress phase labels across CLI commands (consistent "Verb noun" style)

### Fixed

- Blank screen when opening km view (async React reconciler race condition)
- Crash on directories containing socket files (EOPNOTSUPP)
- TreeNode row alignment in TUI
- Cursor navigation: depth preservation across columns
- Zoom behavior at column and root levels
- 'u' key at root/column level now correctly moves to board selection
- TUI content disappearing after watcher sync (stale closure in refresh handler)
- Visual testing (ttyd+Playwright) showing blank screen by keeping WebSocket connection open during TUI initialization

### Removed

- Legacy Ink engine and views-ink components (archived)
- Unused board-handlers.ts (787 lines dead code)

## [0.1.0] - 2026-01-01

Initial development version.

- Core markdown task parser (@km/markdown)
- Tree model with hierarchical task structure (@km/tree)
- Storage layer with file watching (@km/storage)
- Board abstraction for kanban-style views (@km/board)
- TUI application using inkx renderer (@km/cli-app)
- Query language for filtering tasks (@km/query)

