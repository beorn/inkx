# Changelog

## [Unreleased]

### Fixed
- **TUI**: Fixed j/k navigation not working - keybindings produced cursor_up/cursor_down with "up"/"down" directions, but handleTreeNavigation() only handled "prev"/"next". Added mapping in handleCursorMove() and exhaustiveness checking to prevent future regressions.

### Changed

- **tui,tests:** migrate UI tests to spec pattern with tree fixtures
  - Created `board.spec.ts` with decker-inspired `item()` tree builder
  - Added `testEnv()` helper for one-line fixture creation + rendering
  - Migrated 14 UI acceptance tests from `board.test.ts` to `board.spec.ts`
  - Reduced `board.test.ts` from 1056 lines to 520 lines (unit tests only)
  - Tests now use tree builder pattern: `item("board", item("col", item("card")))`
  - CSS selectors for structural tests: `#col1 #1a`, `#card[data-cursor]`
  - boundingBox() for visual layout tests
  - Resolves: km-lp7k

### Bug Fixes

- **tui:** prevent constant re-renders from spinner animation ([db5457d](https://github.com/beorn/km/commit/db5457d))
  - Fixed unconditional setInterval in useSpinnerFrame causing 60ms render loop
  - Spinner animation now only runs when actually loading/syncing
  - Resolves: km-jfr6
- **storage:** intercept createDebug.log in workers before imports ([db5457d](https://github.com/beorn/km/commit/db5457d))
  - Prevents debug() calls from imported modules going to stderr in worker threads
  - All worker debug output properly forwarded to DEBUG_LOG
  - Fixes debug messages interfering with TUI rendering
  - Resolves: km-lvrl

## [0.2.0](https://github.com/beorn/km/compare/v0.1.1...v0.2.0) (2026-01-23)

### Features

- **board,storage:** add Board and Config domain objects ([40beb76](https://github.com/beorn/km/commit/40beb76f09c9be4d926712366740dd201c7f4741))
- **cli:** add stats command as domain object migration example ([3eb7473](https://github.com/beorn/km/commit/3eb74737505d8b97516620f44e67d24ec830412a))
- **core:** add Service interface and generator utilities ([3d45cc4](https://github.com/beorn/km/commit/3d45cc4efda983c7de6a70cba4eddd960e560a5b))
- **storage:** add Vault domain object and createVault factory ([7b4a052](https://github.com/beorn/km/commit/7b4a05212caae07ba9f344aa36fe287354f378d9))
- **storage:** add Watcher service and createWatcher factory ([a37a67b](https://github.com/beorn/km/commit/a37a67bb2173ff5d0b2053df3ad93c6dfc439aec))

## 0.1.1 (2026-01-23)

### Features

- add claude-session tool for searching/recovering files from session history ([7431527](https://github.com/beorn/km/commit/7431527f70518a0b095e2e9af6d7cc98fab5cad7))
- add domain objects and Service interface ([7631b5c](https://github.com/beorn/km/commit/7631b5c617d49be509d6ea81779beb0cabc7ce7a))
- add MockFileSystem for in-memory filesystem testing ([648de91](https://github.com/beorn/km/commit/648de911062052c7fae069eaea3355e4730c05c7))
- **agent:** improve harness, queries, and sessions ([35a98cb](https://github.com/beorn/km/commit/35a98cbf1a85671cd071a477b75e8d11f1d37ad6))
- **beads:** implement resolveShortId and dependentCount; fix visual testing ([084c37e](https://github.com/beorn/km/commit/084c37ed882fec04f0fbe75e066434490366b9f9))
- **beads:** implement resolveShortId and improve sync ([417bbcd](https://github.com/beorn/km/commit/417bbcddf05e506130855913fa2762d1649e10f4))
- **board:** add Board domain object with simpler API ([50eaab5](https://github.com/beorn/km/commit/50eaab5245a3d740e3b8748dbea1ff97890c8986))
- **board:** implement curswant for sticky cursor navigation ([1dd1b70](https://github.com/beorn/km/commit/1dd1b702dbf5d633edddd3c3e80ee972c3d65fa6))
- **chaos:** add CLI wrapper for chaos fuzzer ([80e7863](https://github.com/beorn/km/commit/80e7863c0cb900f846620c4a76e0a056e3015e40))
- **cli:** add /bd skill for beads issue tracking ([7d2f695](https://github.com/beorn/km/commit/7d2f69593f9bb9431afd7972fa5431505d913937))
- **cli:** add /commit command for multi-repo commits ([cbf57a5](https://github.com/beorn/km/commit/cbf57a5077f71ae47fecdaaf3426daf8bf4440a9))
- **cli:** add bootstrap entry point for early loading indicator ([81dc923](https://github.com/beorn/km/commit/81dc92373eee9e078264d80f6b482fd04e2d7cab))
- **cli:** improve /commit with bd sync and submodule guidance ([e83849e](https://github.com/beorn/km/commit/e83849ef8895effdca59de4185af4f846785d83b))
- **cli:** improve bd commands and add task progress utility ([4d86cf6](https://github.com/beorn/km/commit/4d86cf6564cbbc29db86c0a120a8bc8c26e52033))
- **cli:** improve progress reporting for vault loading ([edf3b93](https://github.com/beorn/km/commit/edf3b930d5819a24ad6ee0ff2d1d0191853b4ae4))
- **cli:** improve view loading with task progress ([84f5d79](https://github.com/beorn/km/commit/84f5d79a5653fcb1057ff9cd1501aae296389e71))
- **cli:** integrate progressx for progress indicators ([30a6af9](https://github.com/beorn/km/commit/30a6af9d2b53a522d313f38a2861b4402796729a))
- **cli:** restore loading indicator with dynamic storage import ([1171730](https://github.com/beorn/km/commit/117173049ffda7249d86b0553500ad6f0e131654))
- **cli:** show loading indicator immediately on km view ([110a8af](https://github.com/beorn/km/commit/110a8aff2bf893ba94ba6b4cb3b9b20e94d3012a))
- **cli:** wire up stats command and update version import ([671bad6](https://github.com/beorn/km/commit/671bad6e4e56700198c16a99bbf8071e5ba3025d))
- **docs,tui,core:** fix docs, TUI bugs, add core tests ([c9b9fe9](https://github.com/beorn/km/commit/c9b9fe9526f79c4ec0f9a47cf51e2ddd1eb7b242))
- filesystem paths as node refs + fix selection colors per design system ([4f88041](https://github.com/beorn/km/commit/4f8804155e36e264ca3508a968e1b3c6ad4ea735))
- improve storage, caldav, and core packages ([cdd698a](https://github.com/beorn/km/commit/cdd698a68ebb921c806b81956dbd53e8ecd095e5))
- **nav:** bind j/k to up/down directions, constrain to column hierarchy ([9e9b229](https://github.com/beorn/km/commit/9e9b22989a1c4f48f823f3e1b2fe1d0029bdfcc9))
- **progressx:** add tests and contributing guide ([337269f](https://github.com/beorn/km/commit/337269fbd2bb2bca927a58955515e01780893f1f))
- **query:** add inline property queries and property-based backlinks ([24283ec](https://github.com/beorn/km/commit/24283ecfc8d11e4af6ca8be21c3d27f5d8efe7e5))
- **refactor1:** architecture review and cleanup ([cb646ea](https://github.com/beorn/km/commit/cb646eaaa60c7383502044ebaabae47db1d7d4cf))
- **storage:** add bidirectional chaos tests and regression system ([14bff28](https://github.com/beorn/km/commit/14bff28b0f19fdb7bd40527e88a8b02745b4e8b1))
- **storage:** add chaos simulation test framework and robustness improvements ([47112e4](https://github.com/beorn/km/commit/47112e45071643feb84508712800d082221973cb))
- **storage:** add deterministic concurrent chaos tests ([04d358d](https://github.com/beorn/km/commit/04d358dd21484941c72e1fcc1d7fa2114c2a83d9))
- **storage:** add P1 robustness improvements for sync system ([7b5d682](https://github.com/beorn/km/commit/7b5d6821b9312ec8f9adc0e7773114ccedf75391))
- **storage:** add recursive reconciliation and stress tests for chaos framework ([3a5a032](https://github.com/beorn/km/commit/3a5a03202d765fbd24ef5a8275cbf3e51b5afac4))
- **storage:** resolve embedded wikilinks to link_to field ([b180397](https://github.com/beorn/km/commit/b180397859ca9580718e8a07972d083480552c2f)), closes [target#section](https://github.com/beorn/target/issues/section)
- **storage:** run chokidar watcher in worker thread for non-blocking startup ([93decb1](https://github.com/beorn/km/commit/93decb1ff5cee736a603585a790c946147d64e7e))
- **tui:** add generator-based board state initialization ([fa88b53](https://github.com/beorn/km/commit/fa88b534d323c64f1ba22994dc7ef21705a999d0))
- **tui:** implement sticky Y navigation and improve card positions ([d97297d](https://github.com/beorn/km/commit/d97297df7248540764c2f08cf0924e363d503d15))
- **tui:** implement sticky Y navigation for h/l cross-column movement ([e64f970](https://github.com/beorn/km/commit/e64f970a2c10eadccd2503215cde31a32925ebce))
- **tui:** improve bottom bar formatting and clarity ([55f66d3](https://github.com/beorn/km/commit/55f66d3325b920d2f914ec32b05e50513c23fca4))
- **tui:** use icons for DB and file counts in bottom bar ([ad3fce5](https://github.com/beorn/km/commit/ad3fce5b88d89da60af682740f04073aa88b3a47))
- **watcher-chaos:** add MockFileSystem for virtual fs testing ([e4a7703](https://github.com/beorn/km/commit/e4a77030c7fca872023f4c5394cd906433f6da29))
- **watcher-chaos:** extract chaos testing framework to vendor package ([0116557](https://github.com/beorn/km/commit/01165575fdbe4ddc01ddeb51ce4d1479e3a1b6b8))

### Bug Fixes

- **board:** use ratio-based curswantY for cross-column navigation ([c97df56](https://github.com/beorn/km/commit/c97df56e9fdea2aa3cf57fdd3e7571c8a02f73b5))
- **cli:** consume ensureState generator to prevent timeout ([7dd5837](https://github.com/beorn/km/commit/7dd58378a39c97078fec50a5eb1c914723a6ff77))
- **cli:** detect submodules with .git files in /commit ([f06300f](https://github.com/beorn/km/commit/f06300facb2d26dd1f1c74aa095714e343085468))
- **markdown:** eliminate extra newlines between consecutive list items ([a9c98df](https://github.com/beorn/km/commit/a9c98dfde4b7677435571722f38a2afe14677d76))
- resolve all lint errors ([abb7e0d](https://github.com/beorn/km/commit/abb7e0dbae6983d02f47de6d95f7935137d1c99e))
- **skill:** apply Claude Code best practices to /bd skill ([f917e58](https://github.com/beorn/km/commit/f917e58e9233f150c13f7b4af06819848e355333))
- **storage:** filter ignored paths in watcher event handler ([234e4d3](https://github.com/beorn/km/commit/234e4d309bfd6a912a5e5e260cdf958522d72b3f))
- **storage:** fix glob pattern matching for **/.git/** ignore patterns ([7ddc8cd](https://github.com/beorn/km/commit/7ddc8cde35ad31a5b7c3cf128b6b770f5cb55f77))
- **storage:** forward worker debug messages to main thread for DEBUG_LOG capture ([b7205cd](https://github.com/beorn/km/commit/b7205cd9c689b137a6bab0f2d2b31d30e16c122f))
- **storage:** get all descendants in getFileWithChildren ([586b2bb](https://github.com/beorn/km/commit/586b2bbb09291a5d41fe2d3c967d5bf9415a43fe))
- **storage:** preserve node IDs during watcher reconciliation ([690540d](https://github.com/beorn/km/commit/690540dd742802b42bc0618a2bf42f8a3aeba0d6))
- **storage:** prevent data loss on concurrent FS/DB edits ([b89c05f](https://github.com/beorn/km/commit/b89c05ff61929dd841794592674e657f0d93e060))
- **storage:** prevent syncToFs from corrupting non-markdown files ([b999423](https://github.com/beorn/km/commit/b999423bdd6fbbe3b7f7ec3c67f8c0ad5b784063))
- **storage:** suppress worker localDebug when DEBUG_LOG is set ([2fdc315](https://github.com/beorn/km/commit/2fdc315300e3bf2942c6eee9672e1458a15a7c87))
- **storage:** use structural matching in node diff instead of md_pos ([8524d97](https://github.com/beorn/km/commit/8524d97fb076466c6dfcd1490ca03a11574d6a8d))
- **testing:** eliminate React act() warnings in test output ([3ae7eaf](https://github.com/beorn/km/commit/3ae7eaffac61bf2f694895e2e552ef6159ba77a9))
- **tree:** use KNode type instead of DOM Node in display.ts ([8711c65](https://github.com/beorn/km/commit/8711c65da9becbc46f56fc4f537c3cc35f9e787c))
- **tui:** add paddingLeft to storybook card boxes ([891e7d6](https://github.com/beorn/km/commit/891e7d6220986abc9811c9fb8928b11de9974f13))
- **tui:** correct storybook visual rendering width ([d5911fe](https://github.com/beorn/km/commit/d5911fe0e40721cf7a0f4fda1658458f767ec786))
- **tui:** implement edge-based scrolling for cards and columns ([308a7f9](https://github.com/beorn/km/commit/308a7f98d539413149e3b9cf5fec558e7187767c))
- **tui:** improve ColumnsView layout and styling ([d823030](https://github.com/beorn/km/commit/d823030df843355c18f53c5d560643cad40f8366))
- **tui:** increase virtualization overscan to prevent blank rendering ([b8914ef](https://github.com/beorn/km/commit/b8914ef57d4636a0a33ba8f1acc74f7eff64d5cb))
- **tui:** prevent bottom bar right side truncation ([8039c53](https://github.com/beorn/km/commit/8039c53c095babfca9031e005cdc90df8a55d6d3))
- **tui:** restore terminal state on SIGTERM/SIGINT ([b75e9c0](https://github.com/beorn/km/commit/b75e9c032c1db112b720f6fa1e7c48634cb3b070))
- **tui:** scroll containers now follow cursor in all views ([9ed343d](https://github.com/beorn/km/commit/9ed343d08da5b071d1f96e9cfb8d41c2c3c0525f))
- **tui:** update inkx for scroll container background fix ([92016cb](https://github.com/beorn/km/commit/92016cbc45e208e439b867397592ad1b517b6955))
- **tui:** use ref to prevent stale closure in refresh handler ([1db376d](https://github.com/beorn/km/commit/1db376dd6a784bbb7a9c39030b7a6cfa8579b8f8))
- update tui-measure submodule to correct commit ([9978631](https://github.com/beorn/km/commit/9978631a6822f77ad681cf931a4de66e1945a76e))

### Performance Improvements

- **tui:** add shared memoized components for all views ([4d32d05](https://github.com/beorn/km/commit/4d32d05109e202425b7cdf07606ff3c03e10ae76))
- **tui:** fix O(n) cursor search and N+1 column queries ([f5f5960](https://github.com/beorn/km/commit/f5f5960b589f800acd262333cf5c82b8293c3610))
- **tui:** fix selector performance - select booleans not Sets ([e1472ff](https://github.com/beorn/km/commit/e1472ff9558adc23bfa2c2405d45f8720a694eba))
- **tui:** optimize cursor movement with React.memo and useMemo ([3c365ab](https://github.com/beorn/km/commit/3c365abdec77f3fe3d0356d8fdbee8674bfefffe))
- **tui:** optimize ListView rendering with pre-cached board pills ([75329da](https://github.com/beorn/km/commit/75329da35db24ea2dfee62ad3a08764121153401))
- **tui:** separate columns memoization from cursor indices ([534f461](https://github.com/beorn/km/commit/534f4619427dde28b6b7e0b5542be9b3d17251a7))

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Node aggregation: mentions, tags, and projects from child nodes bubble up to file nodes
- `bd` command for beads issue tracking integration
- `km agent` and `bd agent` CLI commands for AI-assisted workflows
- Debug script with tmux wrapper and lnav integration (`bun debug`)
- DEBUG_LOG environment variable for redirecting debug output to file
- Retry logic with exponential backoff for WriteQueue filesystem operations
- Conflict detection and resolution for concurrent TUI/filesystem edits
- Permission error handling with actionable user suggestions (EACCES/EPERM/EROFS)
- Symlink detection during directory scanning (skipped to avoid infinite loops)
- Case-sensitivity detection and collision detection for cross-platform compatibility
- `resolveShortId()` function for beads short ID to node ID lookup
- `dependentCount` calculation for beads issues (reverse dependency tracking)
- `scripts/playwright-capture.ts` for headless TUI screenshot capture via ttyd

### Changed

- Simplified engine abstraction (removed legacy Ink engine, only inkx remains)
- Cursor system redesign: zoom operations now preserve selection context
- Renamed `selectedNodeId` to `cursorNodeId` for clarity
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
