# Concepts

Core concepts of km: the node tree, properties, modes, and queries.

---

## Core Insight

km is a **PIM/PKM engine** that transforms a directory of markdown files into a manipulable semantic tree.

```
Your Files                    km's View
─────────────────────         ─────────────────────
projects/                     Node (folder)
├── website.md         →      └── Node (file + H1 merged)
│   # Launch Plan                 ├── Node (task, status:todo)
│   - [ ] Design                  └── Node (task, status:done)
│   - [x] Research
```

**Currently implements:** Tasks with GTD workflow
**Planned:** Notes, contacts, calendar events, custom content types

Any node can have properties. A node with `item.task` is a task. A node with `email` and `phone` properties could be a contact. The tree is the universal primitive.

---

## Core Structure

Four layers, bottom to top:

```
FS        markdown files on disk              source of truth
            ↕ parse / serialize
Repo      KNode tree in SQLite                queryable, subscribable
            ↕ build / mutate
Tree      operations, history, normalize      atomic ops, undo, invariants
            ↕ derive
View      ViewTree, Selection, Board          what you see and interact with
```

Each layer has a primary abstraction (domain interface, domain object, or external system):

| Layer | Domain Interface | State | Key Operations |
|---|---|---|---|
| **FS** | filesystem (external system) | `.md` files | read, write, watch |
| **Repo** | `Repo` (domain object) | SQLite rows | `getNode`, `getChildren`, `addNode`, `moveNode` |
| **Tree** | `KTree`, `TreeOp` | node tree | `KTree.nodes()`, `TreeOp.inverse()`, `withHistory()` |
| **View** | `ViewTree`, `Selection`, `Board` | derived visual state | `ViewTree.nodes()`, `Selection.cursor()`, `Board.apply()` |

**Data flows down** (FS → Repo → View). **Mutations flow up** (command → op → apply → effects → change → FS sync). The **unified pipeline** connects them:

```
event → command → op → apply() → [state, effects] → change → FS sync
```

### Command routing

The command pipeline has two routing levels:

```
event → when (route to command) → command (resolve to op) → apply()
```

**`when` clauses** are the first filter — keybindings evaluate conditions like `inputMode === "text"` or `Selection.isEditing(sel)` to select which command handles a key. This means one key (e.g., Backspace) routes to different commands based on context, and each command stays focused on one case.

**Commands** are the second level — they read `CommandContext` (selection, cursor, node type, position) and resolve to concrete ops with specific locations. Commands can assume their `when` conditions are met.

This two-level routing keeps commands simple. Instead of one "delete backward" command with 5 branches, you have 3 specialized commands, each with a `when` condition and a focused `execute()` that produces one kind of op.

**Comparison with SlateJS**: SlateJS puts all routing inside commands (`editor.deleteBackward()` handles every case). km's `when` system does the routing externally, so commands are smaller and more testable.

### Command context from the signal DAG

Commands need state (cursor, selection, node) to resolve ops. In km, the **signal DAG already computes this** — `cursor`, `inputMode`, `selectedIds`, `cursorNode` are all derived signals, always up to date.

Command dispatch snapshots signal values into a flat context object. No separate context builder needed — the DAG IS the builder. `when` clauses are signal reads too (already computed, zero work).

```
signals (always computed) → when (read signals) → command (pure fn of context → op)
```

The command context is **DAG snapshot + event-specific data**. The DAG part is free (cached). The event adds ephemeral context (which key, modifiers, mouse position, hit target):

Each event type has its own **input adapter** that bridges raw events to the command system:

```
keyboard adapter: DAG + key + modifiers      → context → when → command → op
mouse adapter:    DAG + position + hit + btn  → context → when → command → op  
FS adapter:       DAG + path + changeType     → context → handler → op
sync adapter:     DAG + remote changes        → context → handler → op
```

The prep handler snapshots the DAG (free, cached) and adds event-specific data. Different event types produce different context shapes, but all feed into the same dispatch → apply pipeline.

The snapshot must be **atomic** — the same immutable snapshot is used for both `when` evaluation and command execution. No signals update between routing and execution.

---

## Everything is a Node

Nodes form a tree representing your markdown files and their content:

```
repo/
├── oi (folder)     # Directory
├── oi (file)       # .md file (merged with H1 if names match)
│   ├── oi (section)    # ## Heading (H2+)
│   └── li (task)       # - [ ] checkbox
└── ...                 # p, code, quote, etc.
```

**A node is a task if it has `item.task`** (e.g. `item: { task: { marker: "[ ]", status: "todo" } }`).

### Node Types (km-ast)

11 types in 3 categories:

````
Block (8)  — content blocks
  p, h, code, quote, table, hr, html, math

Item (2)   — tree structure
  oi       — outline item (folder, file, section via fstype)
  li       — list item (bullets, numbered, tasks via markers)

Link (1)   — references
  link     — wiki links, sigil links (inline in content)
````

- **`oi`** (outline item) creates hierarchy. `fstype` distinguishes: `folder`, `file`, `mdfile`, `mdsection`.
- **`li`** (list item) holds content. `item.list` for bullet style, `item.task` for task status.
- **Blocks** are leaf content that doesn't create hierarchy.

### References: Symlinks, Links, Embeds

Three ways a node can reference another:

| Type | Where | What it does | Example |
|---|---|---|---|
| **Symlink** | `KNode.symlink_to` (structural) | Node IS the target — displays target's content and children at this position | A task card that mirrors a node from another file |
| **Link** | `[[wikilink]]` in content (inline) | Clickable text that navigates to the target | `See [[project-alpha]]` |
| **Embed** | `![[page]]` in content (inline, future) | Displays target's content inline within the node's body | `![[meeting-notes]]` renders notes inline |

Symlinks are structural (node-level `symlink_to` field). Links and embeds are inline content (parsed from markdown). The ViewTree resolves symlinks: `viewNode.display` is always the renderable node.

---

## Task Model

A node becomes a task when it has a `status` property. Tasks have one of five statuses:

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

**Note:** `wip` enables cross-board queries for "what's being worked on" (`status:wip`). The `task_claimed` change sets status to `wip`; `task_released` sets it back to `todo`.

---

## Links

| Syntax              | Type          | Creates                        |
| ------------------- | ------------- | ------------------------------ |
| `[[target]]`        | Wiki link     | Forward link                   |
| `![[target]]`       | Embed link    | Embedded node                  |
| `@user`             | Sigil link    | Forward link                   |
| `#tag`              | Sigil link    | Forward link                   |
| `+project`          | Sigil link    | Forward link                   |
| `prop:: [[target]]` | Property link | Forward link with relationship |
| (reverse)           | Back link     | Auto-tracked                   |

### Property Links

Property links add semantic relationships to links:

```markdown
- [ ] Deploy blocked-by:: [[km-auth]]
- [ ] Review blocks:: [[km-release]]
```

These create backlinks with relationship type, enabling queries like:

- `blocked:true` — tasks with unresolved blockers
- `blocks::km-123` — tasks that block a specific issue

### Node References

| Syntax   | Example             | Description      |
| -------- | ------------------- | ---------------- |
| `^id`    | `^abc123`           | Partial ID match |
| `name`   | `@next`             | Unique name      |
| `./path` | `./inbox/task.md`   | Relative path    |
| `/path`  | `/projects/work.md` | Absolute path    |

---

## Two Modes

| Mode       | Trigger       | Description                                                     |
| ---------- | ------------- | --------------------------------------------------------------- |
| **Memory** | No `.km/`     | SQLite in RAM. Changes go directly to `.md` files. No history.  |
| **Disk**   | `.km/` exists | SQLite on disk. Full tracking: change history, stable IDs, sync. |

Both modes are **read-write**. The difference is where state lives:

- **Memory**: SQLite rebuilt from `.md` files each run. Toggle tasks, browse structure. Changes write through to `.md` files but aren't tracked. Node IDs are ephemeral. Great for quick access or using km on any repo.

- **Disk**: Run `km init` once. SQLite persists in `.km/state.db`. Every change logged to `changes.jsonl`. Stable node IDs, undo capability, sync support. Use for your own projects.

```bash
km task               # Works anywhere (memory mode)
km init               # Enable tracking (creates .km/, disk mode)
```

### Files

**Memory mode:** Just your `.md` files.

**Disk mode:**

```
.km/
├── changes.jsonl      # Append-only event log (git-tracked)
└── state.db          # SQLite cache (gitignored, rebuildable)
```

---

## Query Language

| Pattern        | Example          | Description             |
| -------------- | ---------------- | ----------------------- |
| `field:value`  | `status:todo`    | Field equals value      |
| `field:func()` | `due:past()`     | Field matches function  |
| `-field:value` | `-status:done`   | Negate match            |
| `@ref #tag`    | `@bjorn #urgent` | Reference contains      |
| `./path/*`     | `./inbox/**`     | Path pattern            |
| `prop::value`  | `rating::5`      | Property equals value   |
| `prop::>N`     | `rating::>3`     | Property comparison     |
| `blocked:true` | `blocked:true`   | Has unresolved blockers |
| `"text"`       | `"quarterly"`    | Full-text search        |

See [ref/query.md](ref/query.md) for full query language specification.

---

## Collapsing

When folder, file, and section share the same name, they collapse:

```
Taxes/                      →    Taxes / .md #
  Taxes.md                       (single line with type suffix)
    # Taxes
```

The `/ .md #` suffix shows what was collapsed. See [ref/ui.md](ref/ui.md).

---

## Glossary

See [glossary.md](glossary.md) for the full project glossary. Key terms for this page:

| Term | Definition |
|---|---|
| **KNode** | Flat record with `parent_id`. Stored in SQLite. |
| **TNode** | Recursive tree with `children[]`. For navigation. |
| **domain object** | Stateful instance created by factory function. Examples: Repo, Term, Scope. |
| **domain interface** | Type + pure function namespace sharing one name. Examples: KNode, Selection, ViewTree. |
| **domain type** | Plain data shape, no function namespace. Examples: TextPoint, ID. |
| **event** | Something that happened (keypress, file change, sync). |
| **command** | Registered event handler (named, keybinding-mapped, palette-discoverable). |
| **op** | Serializable data dispatched to `Machine.apply()`. |
| **op handler** | Pure function implementing one op type, defined in a `createSlice()` handler map. |
| **op() proxy** | Ergonomic wrapper: `op(model).method(args)` routes through `apply()` as serializable data. |
| **selector** | Pure function deriving a value from state. |
| **effect** | Side-effect instruction emitted by apply. |
| **change** | Persisted record of what changed (e.g., `node_created`). |

### SlateJS comparison

km's tree layer descends from SlateJS. Terminology mapping:

| SlateJS | km | Notes |
|---|---|---|
| `editor.deleteBackward()` | **command** | User-facing intent, keybinding-mapped |
| `Transforms.splitNodes(editor)` | `repo.splitNode()` | Implementation helpers op handlers call. No separate namespace — methods on Repo/TreeMutator |
| `TreeOp` | **op** (`TreeOp`) | Atomic, invertible, serializable |
| `Editor.apply(op)` | `Machine.apply(state, op)` | State transition. Ours is pure (returns new state), SlateJS mutates |
| `Editor.nodes()`, `Node.string()` | **selectors** | Read-only queries on the domain interface |
| `Node`, `Path`, `Point`, `Range` | **domain interfaces** | Type + function namespace. We use stable IDs instead of index-based paths |
| `TreeOp.inverse()` | `TreeOp.inverse(op)` | Same concept. Ours is a standalone function (moving to domain interface) |

Key differences: we use stable node IDs (not fragile index paths), effects are data (not imperative side effects), and state transitions are pure (return new state, not mutation).

---

## See Also

- [architecture.md](architecture.md) — Package structure, data flow, event system
- [storage.md](storage.md) — Mode detection, SQLite schema, sync
- [guides/tasks.md](guides/tasks.md) — Task management, GTD workflow
- [principles.md](principles.md) — Composability and architectural principles
