# km Overview

See [../README.md](../README.md) for vision, use cases, and roadmap.

This spec covers the technical design of km's core: the node tree and two operating modes.

---

## Data Model Quick Reference

### Everything is a Node

Nodes form a tree:

```
vault/
├── folder          # Directory
├── file            # .md file
│   ├── section     # # Heading
│   └── task        # - [ ] checkbox
└── ...             # paragraph, quote, code, etc.
```

**A node is a task if it has a status property.**

### Status (5 values)

| Mark  | Status    | Meaning                      |
| ----- | --------- | ---------------------------- |
| `[ ]` | `todo`    | Available to work on         |
| `[/]` | `wip`     | Work in progress             |
| `[!]` | `blocked` | Waiting on something/someone |
| `[x]` | `done`    | Completed                    |
| `[-]` | `dropped` | Cancelled                    |

**Note:** `wip` enables cross-board queries for "what's being worked on" (`status:wip`). The `task_claimed` event sets status to `wip`; `task_released` sets it back to `todo`.

### Links

| Syntax        | Type       | Creates       |
| ------------- | ---------- | ------------- |
| `[[target]]`  | Wiki link  | Forward link  |
| `![[target]]` | Embed link | Embedded node |
| `@user`       | Sigil link | Forward link  |
| `#tag`        | Sigil link | Forward link  |
| `+project`    | Sigil link | Forward link  |
| (reverse)     | Back link  | Auto-tracked  |

### Node References

| Syntax   | Example             | Description      |
| -------- | ------------------- | ---------------- |
| `^id`    | `^abc123`           | Partial ID match |
| `name`   | `@inbox`            | Unique name      |
| `./path` | `./inbox/task.md`   | Relative path    |
| `/path`  | `/projects/work.md` | Absolute path    |

### Query Language

| Pattern       | Example          | Description            |
| ------------- | ---------------- | ---------------------- |
| `prop:value`  | `status:todo`    | Field equals value     |
| `prop:func()` | `due:past()`     | Field matches function |
| `-prop:value` | `-status:done`   | Negate match           |
| `@ref #tag`   | `@bjorn #urgent` | Reference contains     |
| `./path/*`    | `./inbox/**`     | Path pattern           |
| `"text"`      | `"quarterly"`    | Full-text search       |

### Board Sync Example

```markdown
# My Board

## Ready {sync: {status: todo}}

## In Progress {sync: {status: wip}}

## Waiting {sync: {status: blocked}}

## Done {sync: {status: done}}
```

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
km show <query>             # Show node details
km show --tree <query>      # Show structure
km view [query]             # Kanban board (TUI)

# Query can be: node ID, path pattern, or relative path
km ls projects/             # Nodes under projects/
km show --tree 01H5X        # Tree from node ID prefix
km ls --type task           # List all tasks
km ls --type task --context # Tasks with ancestor paths
km ls "search term"         # Full-text search

# Task commands
km task [query]             # = km ls --type task --context
km status <id> [status]     # View or set task status (todo, wip, blocked, done, dropped)

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
- [Storage](km-storage.md) — Mode detection, interfaces
- [UI](km-ui.md) — Views, collapsing
- [CLI](km-cli.md) — Commands
- [Tasks](km-tasks.md) — Task management, GTD workflow
- [Agents](km-agents.md) — Agent orchestration
