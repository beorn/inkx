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

### Changed
- Simplified engine abstraction (removed legacy Ink engine, only inkx remains)
- Cursor system redesign: zoom operations now preserve selection context
- Renamed `selectedNodeId` to `cursorNodeId` for clarity

### Fixed
- Blank screen when opening km view (async React reconciler race condition)
- Crash on directories containing socket files (EOPNOTSUPP)
- TreeNode row alignment in TUI
- Cursor navigation: depth preservation across columns
- Zoom behavior at column and root levels
- 'u' key at root/column level now correctly moves to board selection

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
