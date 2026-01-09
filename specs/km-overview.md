# km Overview

A local-first knowledge and task management system.

---

## What km Does

km treats markdown files as a unified tree of nodes. It provides:

- **Task views** — `km tasks`, `km board`
- **Navigation** — `km tree`, `km show`
- **Zero setup** — works instantly on any directory
- **Full persistence** — optional `km init` for history and sync

---

## Two Modes

| Mode | Trigger | What You Get |
|------|---------|--------------|
| **In-memory** | No `.km/` | Instant. Read-write to `.md` files. |
| **Persisted** | `.km/` exists | + Event history, sync, stable IDs |

Run `km init` to enable persisted mode.

---

## Quick Reference

```bash
# Views
km tasks                    # List tasks with context
km tasks --filter path/**   # Filter by path pattern
km board                    # Kanban board
km board <path>             # Board rooted at path
km tree                     # Show actual structure

# Task actions
km toggle <id>              # Toggle task status

# Info
km show <id>                # Show node details
km --help                   # All commands
```

---

## Node Types

Everything is a node:

```
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
```

---

## Collapsing

When folder, file, and section share the same name, they collapse:

```
Taxes/                      →    Taxes / .md #
  Taxes.md                       (single line with type suffix)
    # Taxes
```

The `/ .md #` suffix shows what was collapsed. See [km-display](km-display.md).

---

## Files

**In-memory mode:** Just your `.md` files.

**Persisted mode:**
```
.km/
├── events.jsonl      # Append-only event log (git-tracked)
└── state.db          # SQLite cache (gitignored, rebuildable)
```

---

## See Also

- [README](README.md) — Reading order, glossary
- [Data Model](km-data-model.md) — Node schema, events
- [Store](km-store.md) — Mode detection, interfaces
- [Display](km-display.md) — Views, collapsing
- [CLI](km-cli.md) — Commands
