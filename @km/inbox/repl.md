---
mentions:
  - km
id: "@km/inbox/repl"
aliases:
  - km-repl
  - "@km/_orphan/repl"
created_at: 2026-01-15T13:47:24Z
closed_at: 2026-01-16T09:35:26Z
---

# [x] km-repl: interactive shell with filesystem semantics @km/_orphan #feature #P4

REPL mode for `km sh` that adds interactive features and filesystem-like navigation.

## Usage

```bash
# REPL mode (auto-detected when stdin is TTY)
km sh ~/vault

# Or explicit
km sh --repl ~/vault
```

## Mode Detection

- **Script mode** (@km/_orphan/sh): stdin is pipe/file → read commands, execute, exit
- **REPL mode** (this): stdin is TTY → interactive prompt with completion

## Shell Commands

### Navigation (filesystem semantics)

- `pwd` - show current path (slugs, not titles)
- `ls [path]` - list children of current/specified node
- `cd <path>` - change to node (supports .., /, relative paths)
- `tree [path] [depth]` - hierarchical listing with box-drawing

### Content

- `cat <node>` - show node content/details
- `view` - render current view as TUI2 would (ASCII board)

### Manipulation

- `rm <node>` - remove node
- `mv <src> <dest>` - move node
- `edit <node>` - open in \$EDITOR or inline edit
- `touch <name>` - create new node

### TUI Actions (from script mode)

- All board actions: `move_down`, `move_up`, etc.
- `key <keystroke>` - raw key input

### Meta

- `help [command]` - show help
- `history` - show command history
- `state` - dump current BoardState as JSON
- `exit` / `quit` / Ctrl-D - exit REPL

## Example Session

```
vault> tree projects 2
projects/
├── km/
│   ├── inbox.md
│   ├── roadmap.md
│   └── archive/
├── other/
│   └── notes.md
└── ideas.md

vault> cd projects/km
vault/projects/km> ls
inbox.md  roadmap.md  archive/

vault/projects/km> cat inbox
# Inbox
- [ ] Review PR
- [x] Update docs

vault/projects/km> cd ..
vault/projects> 
```

## Prompt

Slug-based path:

```
vault/projects/km> 
```

## Interactive Features

- Tab completion for paths and commands
- Readline history (persisted to ~/.km_history)
- Help on `?` or `help`
- Colored output

## Architecture

- Builds on @km/_orphan/sh (script mode)
- Adds REPL loop with readline
- Path resolution layer (slug-based navigation)
- Command parser routes to:
  - Shell commands → @km/_orphan/store queries
  - Board actions → script mode dispatcher

## Dependencies

- @km/_orphan/sh (script mode - core)

