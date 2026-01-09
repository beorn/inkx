# Knowledge Machine

> The agentic work desk

## Try It

```bash
cd ~/notes
km task       # Every TODO across all files
km tree       # Your knowledge hierarchy
km board      # Kanban view
```

Point km at any folder. No config. Files stay plain text.

## Why

AI can finally think. Now it needs a place to work.

Today's tools assume *you* do everything. But a new way of working is emerging: **human and AI agents, side by side**. You set direction. Agents do the rest.

The problem:

- **Context is fragmented** — calendar here, notes there, tasks somewhere else
- **Agents are blind** — they can't see your life, only what you paste in
- **No history** — what did the agent do while you weren't looking?
- **No "run" mode** — agents can't work in the background or on a schedule

The bottleneck isn't AI capability. It's the workspace.

## What km Does

A shared workspace for you and your agents.

```
     You ◄────────────► km ◄────────────► Agents
                         │
                    ┌────┴────┐
                    │  Notes  │
                    │  Tasks  │
                    │ Calendar│
                    │ Contacts│
                    │ History │
                    └─────────┘
```

Same notes. Same tasks. Same calendar. Full history.

- Agents see your context — no copy-paste
- Every change tracked — full audit trail
- Data stays local — plain markdown, Obsidian-compatible

## Components

**Index** — Markdown becomes a knowledge base. Notes, tasks, calendar, contacts — all nodes in one tree.

**Board** — Kanban TUI. Vim keys.

**Hub** *(coming)* — Command center for agent teams. Inspired by [Beads](https://github.com/steveyegge/beads) and [Gas Town](https://github.com/steveyegge/gastown).

**Kimmi** *(coming)* — AI assistant with full context on your life.

## Status

| Component | Status |
|-----------|--------|
| Index (notes, tasks, tree) | ✓ Done |
| Event log (history) | ✓ Done |
| Board (kanban TUI) | ✓ Done |
| Agent CLI | ✓ Works |
| Task dependencies | In progress |
| Hub (orchestration) | Designed |
| Connectors (CalDAV) | Planned |
| Kimmi (assistant) | Planned |

## Install

```bash
git clone https://github.com/beorn/km
cd km && bun install && bun link
```

## Docs

- [specs/](specs/) — Architecture
- [specs/km-agents.md](specs/km-agents.md) — Agent orchestration

## License

MIT
