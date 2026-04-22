# Package & CLI Reference

Complete inventory of every package, CLI command, and tool in the km monorepo.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  km CLI + TUI                                               │
│  apps/km-cli, apps/km-tui, apps/km-repl, apps/km-web       │
├─────────────────────────────────────────────────────────────┤
│  km domain packages                                         │
│  @km/commands, @km/board, @km/beads, @km/agent              │
├─────────────────────────────────────────────────────────────┤
│  km core + storage                                          │
│  @km/core (types, events), @km/tree, @km/markdown,          │
│  @km/storage (SQLite), @km/connector-caldav                  │
├─────────────────────────────────────────────────────────────┤
│  Silvery (TUI framework)                                    │
│  silvery barrel → @silvery/ag-react, @silvery/ag-term,       │
│  @silvery/create, @silvery/headless, @silvery/theme          │
├─────────────────────────────────────────────────────────────┤
│  Foundation                                                  │
│  flexily (layout), @silvery/ansi (styling), @silvery/color   │
│  loggily (logging), vterm.js/vt100.js (emulation)            │
│  termless (testing), vimonkey (fuzz)                          │
├─────────────────────────────────────────────────────────────┤
│  Tools (bearly)                                              │
│  tribe, recall, llm, refactor, worktree, tty-mcp             │
└─────────────────────────────────────────────────────────────┘
```

## km Apps (private, workspace-only)

| Package | Location | What |
|---------|----------|------|
| `@km/cli-app` | `apps/km-cli` | Main CLI — `bun km <subcommand>` |
| `@km/tui` | `apps/km-tui` | TUI views — board, card, column, detail, edit |
| `@km/repl` | `apps/km-repl` | Interactive REPL for scripting/debugging |
| `@km/web` | `apps/km-web` | Web server (early stage) |

## km Packages (private, workspace-only)

| Package | Location | What | Key deps |
|---------|----------|------|----------|
| `@km/core` | `packages/km-core` | Types, events, config | loggily |
| `@km/tree` | `packages/km-tree` | Node tree structure, queries | @km/core |
| `@km/markdown` | `packages/km-markdown` | Parse/serialize markdown ↔ nodes | @km/core, mdast |
| `@km/storage` | `packages/km-storage` | SQLite DB, queries, reactive store, emitter, federation | @km/core, @km/markdown |
| `@km/fs-mount` | `packages/km-fs-mount` | Filesystem adapter — watcher, sync, CAS, ignore patterns, path utils, reconciliation, safe-write, echo-guard | @km/core, @km/markdown, @km/storage |
| `@km/board` | `packages/km-board` | Board state — cursor, selection, fold, zoom | @km/core, @km/tree |
| `@km/commands` | `packages/km-commands` | Command registry, keybindings, parsing | @km/board |
| `@km/beads` | `packages/km-beads` | bd-compatible issue tracking on km data | @km/core, @km/storage |
| `@km/agent` | `packages/km-agent` | Claude SDK agent integration | @km/core, @km/storage |
| `@km/connector-caldav` | `packages/km-connector-caldav` | CalDAV/CardDAV sync | — |
| `@km/infra` | `packages/km-infra` | Shared config: oxlint, oxfmt, vitest setup | — |
| `@silvery/selection` | `packages/silvery-selection` | Pure selection state machine | alien-signals |

## Silvery — TUI Framework (`vendor/silvery/`)

### Public packages (published to npm)

| Package | Version | What |
|---------|---------|------|
| `silvery` | 0.17.2 | Main barrel — components, hooks, runtime, theme |
| `@silvery/ansi` | 0.3.4 | Terminal styling, ANSI primitives, detection, theme derivation |
| `@silvery/color` | 0.1.2 | Pure color math — hex/RGB/HSL, blending, contrast (zero deps) |
| `@silvery/commander` | 0.8.2 | Colorized Commander.js help with ANSI |
| `@silvery/examples` | 0.5.6 | Interactive demos — `npx @silvery/examples <name>` |

### Internal packages (private, bundled into silvery barrel)

| Package | Version | What |
|---------|---------|------|
| `@silvery/ag` | 0.5.2 | Core types — AgNode, BoxProps, keys, focus |
| `@silvery/ag-react` | 0.5.2 | React reconciler, hooks, UI components |
| `@silvery/ag-term` | 0.5.2 | Terminal runtime, ANSI output, 5-phase pipeline |
| `@silvery/create` | 0.5.3 | App composition — createApp, pipe(), withApp, TEA store |
| `@silvery/headless` | 0.5.1 | Pure state machines — SelectList, Readline (no React) |
| `@silvery/theme` | 0.5.1 | 84 color schemes, ThemeProvider, useTheme, theme CLI |
| `@silvery/test` | 0.5.3 | Testing — virtual renderer, locators, assertions |
| `@silvery/commands` | 0.5.2 | Command registry, keymaps, invocation |
| `@silvery/scope` | 0.5.1 | Structured concurrency — createScope, disposal |
| `@silvery/signals` | 0.5.1 | Reactive signals (alien-signals wrapper) |
| `@silvery/model` | 0.5.1 | Optional DI model factories |
| `@silvery/ink` | 0.5.1 | Ink/Chalk compatibility layer |

### Dependency chain

```
@silvery/color (zero deps)
  → @silvery/ansi (+ string-width)
    → @silvery/theme
      → @silvery/ag (core types)
        → @silvery/ag-react (+ react-reconciler)
          → @silvery/ag-term (+ flexily)
            → @silvery/create (+ @silvery/headless, @silvery/commands)
              → silvery barrel (re-exports everything)
```

## Flexily — Layout Engine (`vendor/flexily/`)

| Package | Version | What |
|---------|---------|------|
| `flexily` | 0.5.2 | Pure JS flexbox — Yoga-compatible API, no WASM, zero deps |

Exports: `.` (main), `./classic` (Yoga-compat API), `./testing` (test helpers)

## Loggily — Logging (`vendor/loggily/`)

| Package | Version | What |
|---------|---------|------|
| `loggily` | 0.6.1 | Debug/log/span — disabled logs skip evaluation via `?.`. ~3KB, zero deps |

## Vimonkey — Fuzz Testing (`vendor/vimonkey/`)

| Package | Version | What |
|---------|---------|------|
| `vimonkey` | 0.2.1 | Fuzz testing with auto-shrinking + chaos streams for Vitest |

Exports: `.` (main), `./plugin`, `./fuzz`, `./chaos`

## Termless — Terminal Testing (`vendor/termless/`)

### Core + CLI

| Package | Version | What |
|---------|---------|------|
| `@termless/core` | 0.6.0 | Headless terminal testing library — selectors, 25+ matchers |
| `@termless/cli` | 0.3.1 | CLI + MCP server — `bun termless` |
| `@termless/test` | 0.3.1 | Vitest integration — matchers, fixtures, snapshots |

### Terminal backends (one per emulator)

| Package | Version | Emulator | Implementation |
|---------|---------|----------|----------------|
| `@termless/xtermjs` | 0.3.1 | xterm.js | JS (headless) |
| `@termless/vterm` | 0.3.1 | vterm.js | JS (modern, full) |
| `@termless/vt100` | 0.3.1 | vt100.js | JS (VT100 baseline) |
| `@termless/vt220` | 0.1.1 | vt220.js | JS (VT220, 8 colors) |
| `@termless/ghostty` | 0.3.1 | Ghostty | WASM |
| `@termless/ghostty-native` | 0.3.1 | Ghostty | Zig napi |
| `@termless/alacritty` | 0.3.1 | Alacritty | Rust napi-rs |
| `@termless/wezterm` | 0.3.1 | WezTerm | Rust napi-rs |
| `@termless/libvterm` | 0.3.1 | libvterm | Emscripten WASM |
| `@termless/kitty` | 0.3.1 | Kitty | Subprocess (GPL) |
| `@termless/peekaboo` | 0.3.1 | Any | OS-level automation |

## vterm — Terminal Emulators (`vendor/vterm/`)

| Package | Version | What |
|---------|---------|------|
| `vt100.js` | 0.3.1 | VT100 — monochrome, cursor, scroll regions. Pure TS, zero deps |
| `vt220.js` | 0.1.1 | VT220 — 8 colors, insert/delete, selective erase. Pure TS |
| `vterm.js` | 0.3.1 | Modern — full VT/ECMA-48/xterm coverage. Pure TS, zero deps |

## Bearly — Claude Code Tools (`vendor/bearly/`)

### Published packages

| Package | Version | What |
|---------|---------|------|
| `@bearly/tribe` | 0.8.1 | Cross-session coordination MCP server |
| `@bearly/github` | 0.1.0 | GitHub notifications MCP server |
| `alien-projections` | 0.1.3 | Incremental reactive collection transforms (alien-signals) |
| `alien-resources` | 0.1.3 | Async signal bridge — loading/error states (alien-signals) |
| `vitepress-enrich` | 0.4.1 | Glossary linking, SEO, tooltips for VitePress |
| `vitest-silvery-dots` | 0.1.0 | Streaming dot reporter for Vitest (silvery UI) |

### MCP servers (plugins/)

| Package | Location | What |
|---------|----------|------|
| `@bearly/tribe` | `plugins/tribe` | Cross-session coordination daemon + proxy |
| `@bearly/github` | `plugins/github` | GitHub push/PR/CI/issue notifications |
| `claude-tty-mcp` | `plugins/tty` | Headless terminal testing (PTY + xterm.js) |

### Unpublished tools (run from source via `bun`)

| Tool | Entry | What |
|------|-------|------|
| recall | `tools/recall.ts` | Session history search + LLM synthesis |
| llm | `tools/llm.ts` | Multi-LLM research, consensus, deep research |
| refactor | `tools/refactor.ts` | Batch rename/replace/migration across files |
| worktree | `tools/worktree.ts` | Git worktree management with submodules |
| tribe-cli | `tools/tribe-cli.ts` | Tribe CLI: status, send, log, health |
| tribe-daemon | `tools/tribe-daemon.ts` | Coordination daemon (Unix socket IPC) |
| tribe-retro | `tools/tribe-retro.ts` | Session retrospective |

## Other Vendor Packages

| Package | Location | Version | What |
|---------|----------|---------|------|
| `@beorn/accountly` | `vendor/accountly` | 0.2.0 | Multi-account credential switching (private) |
| `@beorn/tap` | `vendor/tap` | 0.3.0 | TAP stream merge + format conversion (private) |
| `@beorn/watcher-chaos` | `vendor/watcher-chaos` | 0.2.0 | Chaos file watcher for testing |
| `terminfo.dev` | `vendor/terminfo.dev` | — | Terminal capability database + probes (private) |

## CLI Commands

### `bun km` subcommands

| Subcommand | File | What |
|------------|------|------|
| `km view [path]` | `commands/view.ts` | Launch TUI board view |
| `km tasks [path]` | `commands/tasks.ts` | List tasks from markdown |
| `km list [query]` | `commands/list.ts` | Query nodes with DSL |
| `km show <id>` | `commands/show.ts` | Show node details |
| `km add <title>` | `commands/add.ts` | Add a new node |
| `km new <title>` | `commands/new.ts` | Create new file/node |
| `km move <id> <target>` | `commands/move.ts` | Move node to target |
| `km import` | `commands/import.ts` | Import from CalDAV/CardDAV |
| `km init` | `commands/init.ts` | Initialize .km/ in directory |
| `km sync` | `commands/sync.ts` | Run sync cycle |
| `km watch` | `commands/watch.ts` | Watch files for changes |
| `km stats` | `commands/stats.ts` | Database statistics |
| `km status` | `commands/status.ts` | Sync status |
| `km doctor` | `commands/doctor.ts` | Health checks |
| `km inbox` | `commands/inbox.ts` | Show inbox items |
| `km perf` | `commands/perf.ts` | Performance diagnostics |
| `km screenshot` | `commands/screenshot.ts` | Capture TUI screenshot |
| `km sh` | `commands/sh.ts` | Interactive shell |
| `km agent` | `commands/agent.ts` | Run agent tasks |
| `km daemon` | `commands/daemon.ts` | Background daemon |
| `km termtest` | `commands/termtest.ts` | Terminal capability test |
| `km bd <subcommand>` | `commands/bd.ts` | bd-compatible issue tracking (see below) |

### `km bd` subcommands

`km bd` is a bd-compatible CLI that operates on km's own SQLite data (not `.beads/`).

| Subcommand | What |
|------------|------|
| `km bd ready` | Available work (unblocked, todo) |
| `km bd list [query]` | Query issues with filters |
| `km bd show <id>` | Issue details |
| `km bd create <title>` | New issue |
| `km bd update <id>` | Change status, priority, assignee, etc. |
| `km bd close <id>` | Mark done |
| `km bd drop <id>` | Mark won't-do |
| `km bd claim <id>` | Claim work (status=wip, assignee=you) |
| `km bd rename <old> <new>` | Rename issue ID, update references |
| `km bd dep add/remove/list` | Dependency management |
| `km bd stale [days]` | Issues not updated in N days |
| `km bd blocked` | Show blocked issues |
| `km bd children <id>` | List sub-tasks |
| `km bd info` | Configuration and statistics |
| `km bd query <expr>` | Raw DSL query |
| `km bd migrate` | Import from `.beads/issues.jsonl` |
| `km bd export` | Export to `.beads/issues.jsonl` |

### Root-level bun scripts (tools)

| Command | What |
|---------|------|
| `bun km` | Main km CLI |
| `bun recall "query"` | Search session history |
| `bun llm "question"` | Multi-LLM queries |
| `bun refactor` | Batch rename/migration |
| `bun worktree` | Git worktree with submodules |
| `bun tribe` | Tribe coordination CLI |
| `bun tribe-retro` | Session retrospective |
| `bun termless` | Terminal testing CLI |
| `bun silvery` | Silvery theme CLI |
| `bun tap` | TAP test orchestration |
| `bun accountly` | Account credential switching |
| `bun terminfo` | Terminal capability database |

### Test commands

| Command | What |
|---------|------|
| `bun run test:fast` | Default project — non-slow, non-vendor (~190 files) |
| `bun run test:vendor` | Vendor tests only (~182 files) |
| `bun run test:slow` | Slow tests only |
| `bun run test:fuzz` | Fuzz tests (FUZZ=1) |
| `bun run test:all` | All 4 projects (~393 files) |
| `bun run test:ci` | Full suite: typecheck + lint + all tests (~3-5 min) |
| `bun run test:strictest` | All with SILVERY_STRICT=2 |
| `bun run test:changed` | Tests affected by uncommitted changes |
| `bun vitest run <dir>` | Tests in specific directory |

### Build/lint commands

| Command | What |
|---------|------|
| `bun fix` | Lint + format (oxlint + oxfmt) |
| `bun run typecheck` | TypeScript check |
| `bun run lint` | Lint only |
| `bun run format` | Format check only |
| `bun run bench` | Run benchmarks |

## npm Scopes

| Scope | Owner | Packages |
|-------|-------|----------|
| `@silvery/*` | beorn | ansi, color, commander, examples + internal packages |
| `@termless/*` | beorn | core, cli, test + 11 backends |
| `@bearly/*` | beorn | tribe, github |
| `@beorn/*` | beorn | accountly, tap, watcher-chaos |
| `@vterm/*` | beorn | (reserved, not yet used) |
| `@km/*` | — | workspace-only, never published |
| (unscoped) | beorn | silvery, flexily, loggily, vimonkey, vt100.js, vt220.js, vterm.js |

## Publishing

All packages use tsdown + publishConfig. See `vendor/CLAUDE.md` for the pattern.
Run `bun packages/km-infra/scripts/audit-packages.ts` for publishing readiness.
Use `/release` skill for coordinated releases.
