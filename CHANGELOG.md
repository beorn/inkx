# Changelog

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
