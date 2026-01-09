# Knowledge Machine

> The agentic work desk

## A New Kind of Coworker

AI can finally think. This changes everything.

The **knowledge worker** used to do it all — research, organize, decide, execute. Now there's a new role emerging: the **agentic coworker**. Human and AI agents, working together. You set direction. Agents do the rest.

## The Problem

Today's tools weren't built for this.

| Tool | Assumes... |
|------|------------|
| Obsidian, Notion | *You* do the work |
| Linear, Asana | *Humans* coordinate |
| Claude Code, Cursor | *Code* is the context |

**Your context is fragmented.** Calendar here, notes there, tasks somewhere else.

**Your agents are blind.** They can't see your schedule, your contacts, your research — only what you paste in.

**There's no audit trail.** What did the agent do while you weren't looking?

**You're still the glue.** Every handoff between tools and agents goes through you.

**Setup is a nightmare.** Custom scripts, API wiring, prompt engineering. Everything is bespoke.

**No "run" mode.** You can work interactively with Claude Code — but agents can't run in the background, on a schedule, or while you're away.

The bottleneck isn't AI capability anymore. It's the workspace.

## The Solution

**km** — the agentic work desk.

A shared workspace where you and your agents work side by side.

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

- Agents see your context — no more copy-paste
- Every change is tracked — see what happened
- Your data stays local — plain markdown, Obsidian-compatible

## Try It

```bash
cd ~/notes
km task       # Every TODO across all files
km tree       # Your knowledge hierarchy
km board      # Kanban view
```

Point km at any folder. No config. Files stay plain text.

## What km Provides

**The Index** — Your markdown becomes a knowledge base. Notes, tasks, calendar, contacts — all nodes in one tree.

**The Board** — Kanban TUI for tasks. Vim keys.

**The Hub** *(designed)* — Command center for agent teams. Spawn agents, assign work, watch progress. Inspired by [Beads](https://github.com/steveyegge/beads) and [Gas Town](https://github.com/steveyegge/gastown).

**Kimmi** *(planned)* — An AI assistant who knows your whole life:

```
You: "What's on my plate this week?"

Kimmi: Mon: Design review (10am), 3 open tasks on auth module
       Tue: Coffee with Sarah Chen
       Wed: API spec deadline — blocks 3 other tasks
       Thu: Clear — good for deep work
       Fri: Team retro (2pm)
```

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
