# Concepts

Core concepts of km: the node tree, two operating modes, and the query language.

---

## Everything is a Node

Nodes form a tree representing your markdown files and their content:

```
vault/
├── folder          # Directory
├── file            # .md file
│   ├── section     # # Heading
│   └── task        # - [ ] checkbox
└── ...             # paragraph, quote, code, etc.
```

**A node is a task if it has a status property.**

### Node Types

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

## Status Model

Tasks have one of five statuses:

| Mark  | Status    | Meaning                      |
| ----- | --------- | ---------------------------- |
| `[ ]` | `todo`    | Available to work on         |
| `[/]` | `wip`     | Work in progress             |
| `[!]` | `blocked` | Waiting on something/someone |
| `[x]` | `done`    | Completed                    |
| `[-]` | `dropped` | Cancelled                    |

Status answers: **Can I work on this?**

- `todo` — Yes, ready to pick up
- `wip` — Someone is actively working on it
- `blocked` — No, waiting on something/someone
- `done` — No, it's finished
- `dropped` — No, decided not to do it

**Note:** `wip` enables cross-board queries for "what's being worked on" (`status:wip`). The `task_claimed` event sets status to `wip`; `task_released` sets it back to `todo`.

---

## Links

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

### Files

**Memory mode:** Just your `.md` files.

**Disk mode:**

```
.km/
├── events.jsonl      # Append-only event log (git-tracked)
└── state.db          # SQLite cache (gitignored, rebuildable)
```

---

## Query Language

| Pattern       | Example          | Description            |
| ------------- | ---------------- | ---------------------- |
| `prop:value`  | `status:todo`    | Field equals value     |
| `prop:func()` | `due:past()`     | Field matches function |
| `-prop:value` | `-status:done`   | Negate match           |
| `@ref #tag`   | `@bjorn #urgent` | Reference contains     |
| `./path/*`    | `./inbox/**`     | Path pattern           |
| `"text"`      | `"quarterly"`    | Full-text search       |

See [06-query.md](06-query.md) for full query language specification.

---

## Collapsing

When folder, file, and section share the same name, they collapse:

```
Taxes/                      →    Taxes / .md #
  Taxes.md                       (single line with type suffix)
    # Taxes
```

The `/ .md #` suffix shows what was collapsed. See [08-ui.md](08-ui.md).

---

## See Also

- [02-architecture.md](02-architecture.md) — Package structure, data flow
- [03-storage.md](03-storage.md) — Mode detection, SQLite schema
- [10-tasks.md](10-tasks.md) — Task management, GTD workflow
