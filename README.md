# Knowledge Machine

> km - the agentic work desk

## Why

AI can finally think. Now it needs a place to work.

**Human and AI agents, side by side.** You set direction. Agents do the rest.

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
- **Personal knowledge** — like Notion or Apple Notes, but local-first and agents integrated
- **AI automation** — configure and run agents in one system

## Phases

### Phase 1: The Tree *(now)*

Your markdown becomes a knowledge base. Notes, tasks, calendar — all nodes in one tree.

```bash
cd ~/notes
km task       # Every TODO across all files
km tree       # Your knowledge hierarchy
km board      # Kanban view
```

### Phase 2: The Hub

Command center for agent teams. Spawn agents, assign work, watch progress.

```bash
km hub        # Agent dashboard
km hub start  # Run agents in background
```

### Phase 3: The Assistant

AI with full context on your life. Ask questions, get answers that know your schedule, your projects, your people.

```bash
km chat "What's on my calendar today?"
km chat "Summarize my notes on Project X"
```

### Phase 4: Collaboration

Your team's agents and yours, working on shared knowledge. Web interface. Cloud sync.

## Docs

- [specs/](specs/) — Architecture
- [specs/km-agents.md](specs/km-agents.md) — Agent orchestration

Inspired by [Beads](https://github.com/steveyegge/beads) and [Gas Town](https://github.com/steveyegge/gastown).

## License

All rights reserved.
