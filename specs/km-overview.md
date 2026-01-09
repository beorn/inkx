# km Overview

**Knowledge Machine** — The agentic work desk.

---

## What km Does

km combines knowledge management and agent orchestration:

**Knowledge Management**

- Treats markdown files as a unified tree of nodes
- Task views — `km task`, `km board`
- Navigation — `km tree`, `km show`
- Zero setup — works instantly on any directory

**Agent Orchestration** _(coming soon)_

- Run AI agents with preconfigured harnesses
- Assign tasks to agents or yourself
- Full session logging and replay

---

## Two Modes

| Mode       | Trigger       | Description                                                     |
| ---------- | ------------- | --------------------------------------------------------------- |
| **Memory** | No `.km/`     | SQLite in RAM. Changes go directly to `.md` files. No history.  |
| **Disk**   | `.km/` exists | SQLite on disk. Full tracking: event history, stable IDs, sync. |

Both modes are **read-write**. The difference is where state lives:

- **Memory**: SQLite rebuilt from `.md` files each run. Toggle tasks, browse structure. Changes write through to `.md` files but aren't tracked. Node IDs are ephemeral. Great for quick access or using km on any repo.

- **Disk**: Run `km init` once. SQLite persists in `.km/state.db`. Every change logged to `events.jsonl`. Stable node IDs, undo capability, sync support. Use for your own projects.

```bash
km task               # Works anywhere (memory mode)
km init               # Enable tracking (creates .km/, disk mode)
```

---

## Quick Reference

```bash
# Core views (all accept optional [query] for root node)
km list [query]             # List nodes (alias: ls)
km tree [query]             # Show structure
km show <query>             # Show node details
km board [query]            # Kanban board (TUI)

# Query can be: node ID, path pattern, or relative path
km ls projects/             # Nodes under projects/
km tree 01H5X               # Tree from node ID prefix
km ls --type task           # List all tasks
km ls --type task --context # Tasks with ancestor paths

# Task commands
km task [query]             # = km ls --type task --context
km task status <id> [status] # View or set task status

# Actions
km init                     # Enable persistence

km --help                   # All commands
```

---

## Node Types

Everything is a node:

````
node
├── structural
│   ├── folder          # Directory
│   ├── file            # .md file
│   └── section         # Heading (# ## ###)
└── content
    ├── task            # - [ ] checkbox
    ├── paragraph       # Text block
    ├── ul / ol         # List items
    ├── quote           # > blockquote
    ├── code            # ```code```
    └── ...             # table, hr, html
````

---

## Collapsing

When folder, file, and section share the same name, they collapse:

```
Taxes/                      →    Taxes / .md #
  Taxes.md                       (single line with type suffix)
    # Taxes
```

The `/ .md #` suffix shows what was collapsed. See [km-display](km-ui.md).

---

## Files

**Memory mode:** Just your `.md` files.

**Disk mode:**

```
.km/
├── events.jsonl      # Append-only event log (git-tracked)
└── state.db          # SQLite cache (gitignored, rebuildable)
```

---

## Agents & Harnesses

> **Status: Future** — Not yet implemented.

**Harness**: A preconfigured set of tools and data connectors for an agent.

```yaml
harness:
  name: code-reviewer
  tools: [read_file, write_file, run_tests]
  connectors: [github, linear]
```

**Agent**: An AI agent equipped with a harness, working on a queue of tasks.

```bash
km agent ls                    # List agents
km agent run reviewer          # Run agent continuously
km agent run reviewer "do X"   # One-shot task
```

See [km-agents.md](km-agents.md) for details.

---

## See Also

- [README](README.md) — Reading order, glossary
- [Data Model](km-data-model.md) — Node schema, events
- [Store](km-store.md) — Mode detection, interfaces
- [UI](km-ui.md) — Views, collapsing
- [CLI](km-cli.md) — Commands
- [Agents](km-agents.md) — Agent orchestration
