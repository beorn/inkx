# Knowledge Machine

> km - the workspace for agentic knowledge workers

## Why

AI can finally think. Now it needs a place to work.

A new role is emerging: the **agentic knowledge worker**. Human and AI agents, side by side. You set direction. Agents do the rest.

But today's tools weren't built for this:

- **Context is fragmented** — calendar here, notes there, tasks elsewhere
- **Agents are blind** — they see only what you paste in
- **No history** — what did the agent do while you weren't looking?
- **No "run" mode** — agents can't work in the background

The bottleneck isn't AI capability. It's the workspace.

## What km Does

A shared workspace for you and your agents — with full history.

- Unified context — notes, tasks, calendar in one place
- Full audit trail — every change tracked
- Pure function agents — undo, replay, approve
- Local-first — you own your data

## Use Cases

- **Vibe coding** — like Claude Code, but with persistent task tracking and background agents
- **Research** — like Perplexity, but agents organize findings into your knowledge base
- **Project management** — like Linear or Asana, but local-first, markdown-based, and agents do the work
- **Personal knowledge** — like Cloud Drive, Notion or Apple Notes, but local-first and agents integrated
- **AI automation** — configure and run agents in one system

## Quick Start

```bash
# Install (run from source)
git clone https://github.com/beorn/km.git && cd km
bun install

# Initialize in your notes folder
cd ~/notes     # or any folder with .md files
bun run km init
bun run km sync              # Import your existing markdown files

# View your knowledge
bun run km tree              # See the tree structure
bun run km task              # List all tasks found in your files
bun run km task -i           # Show task IDs (use these with done/show)

# Create tasks
bun run km new "Review Q4 budget @finance #urgent"
bun run km new -p @next "Task under @next board"   # Create under parent
bun run km sync              # Sync to pick up the new task

# Add tasks to boards
bun run km add @next ABCD1234        # Add task to @next board
bun run km add @next ./inbox/**      # Add all inbox tasks to @next
bun run km add @next status:open     # Add all open tasks to @next

# Complete tasks (accepts ID, path, or filename)
bun run km done ABCD1234     # Mark task done using short ID
bun run km done @inbox       # Mark done by filename

# Task status workflow
bun run km task status ABCD1234            # View status
bun run km task status ABCD1234 in_progress # Set to in_progress

# View tasks by folder
bun run km task ./inbox/**   # List tasks in inbox folder

# Search
bun run km search "meeting"        # Full-text search
bun run km search '"exact phrase"' # Phrase search

# Changes sync both ways
# - Edit .md files → run 'km sync' → changes appear in km
# - Use 'km done' → task checkbox updates in your .md file automatically
```

### Alias Setup (Recommended)

```bash
# Add to ~/.zshrc or ~/.bashrc
alias km="bun run ~/path/to/km/apps/km-cli/src/index.ts"

# Then use simply:
km task
km done ABCD1234
km sync
```

### Query Language

```bash
# Field filters
status:open               # By status (open, blocked, done, dropped)
priority:1                # By priority (1=high, 2=medium, 3=low)
due:today                 # By due date
due:week                  # Due this week
assigned:@bjorn           # By assignee

# References
@bjorn                    # Mentions
#urgent                   # Tags
+project-name             # Projects

# Path patterns
./inbox/**                # Tasks in inbox folder (recursive)
/projects/alpha           # Absolute path

# Negation & combination
-status:done              # Exclude done tasks
status:open,blocked       # Multiple values (OR)
status:open @bjorn #urgent  # Multiple conditions (AND)
```

## Phases

### Phase 1: The Tree _(now)_

Your markdown becomes a knowledge base. Notes, tasks, calendar — all nodes in one tree.

```bash
cd ~/notes
km init               # Create .km/ folder
km sync               # Scan and import .md files
km tree               # Your knowledge hierarchy
km task               # Every TODO across all files
km task -i            # Show with IDs for use with done/show
km board              # Kanban TUI (vim keys)
km board @inbox       # Open @inbox board by filename
km search "query"     # Full-text search
km show <node>        # Node details (ID, path, or filename)
km done <node>        # Mark done - accepts ID, path, or filename
```

Features:

- **PKM + PIM** — notes, tasks, calendar, contacts in one tree
- **Bidirectional links** — wikilinks and backlinks
- **Event-sourced** — every change logged, undo anything
- **Git sync** — push/pull your knowledge via GitHub
- **Obsidian-compatible** — edit in Obsidian, VS Code, or any editor
- **Watch mode** — `km watch` keeps index updated in real-time
- **Connectors** — sync calendar/contacts via CalDAV/CardDAV
- **No lock-in** — plain markdown, standard frontmatter

### Phase 2: The Hub

Command center for agent teams. Spawn agents, assign work, watch progress.

```bash
km hub        # Agent dashboard
km hub start  # Run agents in background
```

### Phase 3: The Assistant

AI with full context on your life. Chat or email — same assistant, same knowledge.

```bash
km chat "What's on my calendar today?"
km mail                              # Email bot
```

### Phase 4: Collaboration

Your team's agents and yours, working on shared knowledge. Web interface. Cloud sync. Mobile app with ubiquitous capture. Email as a content type.

## Project Structure

Monorepo with `packages/` for shared libraries and `apps/` for runnable applications.

```
km/
├── apps/
│   └── km-cli/           # CLI application (@km/app-cli)
│
├── packages/
│   ├── km-core/          # Core types & events (@km/core)
│   ├── km-store/         # Database & storage (@km/store)
│   ├── km-markdown/      # Markdown parsing (@km/markdown)
│   ├── km-watch/         # File system watching (@km/watch)
│   └── km-shared/        # Shared utilities (@km/shared)
│
└── specs/                # Architecture docs
```

**Dependency Graph:**

```
@km/core ──────────────────────────────┐
    │                                  │
    ├──→ @km/store                     │
    ├──→ @km/markdown                  │
    └──→ @km/shared                    │
            │                          │
            └──→ @km/watch ←───────────┤
                     │                 │
                     └──→ @km/app-cli ←┘
```

## Development

```bash
bun install          # Install dependencies
bun test             # Run all tests
bun fix              # Lint + format
bun run km           # Run CLI
```

## Docs

- [ROADMAP.md](ROADMAP.md) — Implementation phases
- [specs/README.md](specs/README.md) — Architecture & principles
- [specs/km-overview.md](specs/km-overview.md) — Design overview
- [specs/km-tasks.md](specs/km-tasks.md) — Task management
- [CLAUDE.md](CLAUDE.md) — Agent development instructions

Inspired by [Beads](https://github.com/steveyegge/beads) and [Gas Town](https://github.com/steveyegge/gastown).

## License

All rights reserved.
