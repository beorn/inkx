# Kimmi (KM) Specification

A local-first, event-sourced knowledge and task management system.

**KM** = Knowledge Management (also: kilometers — go far, standardize)

---

## Overview

Kimmi unifies files, folders, markdown sections, blocks, and tasks into a single node tree. Everything is a node. The system syncs bidirectionally between:

1. **Filesystem** — Obsidian-compatible markdown files
2. **SQLite** — Fast queryable state (state.db)
3. **Events** — Append-only audit log (events.jsonl)

### Design Principles

1. **Everything is a node** — folders, files, sections, blocks, tasks
2. **Bidirectional sync** — filesystem ↔ SQLite, real-time
3. **Event-sourced** — all changes recorded as immutable events
4. **Git-native** — events.jsonl is the sync mechanism
5. **Obsidian-compatible** — standard markdown, wikilinks, frontmatter

---

## Architecture

```
.kimmi/
├── events.jsonl      # Source of truth (git-tracked)
├── events.sock       # Unix socket for IPC (runtime only)
└── state.db          # SQLite snapshot (gitignored, disposable)

vault/                # Obsidian vault (filesystem materialized view)
├── projects/
│   └── MyProject.md
├── areas/
└── inbox/
```

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Filesystem ◄──────► km-watch ◄──────► state.db             │
│  (Obsidian)            │                  │                 │
│                        ▼                  ▼                 │
│                   events.jsonl ◄───► km-cli                 │
│                        │                                    │
│                        ▼                                    │
│                   km-code (agents)                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

| Component | Description | Spec |
|-----------|-------------|------|
| **km-node** | Data model: nodes, events, storage | [km-node-spec](km-node-spec.md) |
| **km-md** | Markdown parsing, AST → nodes | [km-md-spec](km-md-spec.md) |
| **km-watch** | Bidirectional filesystem sync | [km-watch-spec](km-watch-spec.md) |
| **km-cli** | CLI: outliner, task management | [km-cli-spec](km-cli-spec.md) |
| **km-code** | Agent orchestration | [km-code-spec](km-code-spec.md) |
| **km-cloud** | Cloud sync, mobile capture (future) | — |

---

## Node Types

Everything is a node. Node types form a hierarchy:

```
node
├── item (has children, navigable)
│   ├── folder
│   ├── file
│   └── section (heading)
└── block (content leaf)
    ├── paragraph
    ├── quote
    ├── code
    ├── list_item
    │   ├── ul (-, *)
    │   ├── ol (1., a., i.)
    │   └── task ([ ], [x], [/], [1], [2])
    ├── table
    ├── hr
    └── html
```

### Node Properties

```typescript
interface Node {
  id: string              // ULID
  type: NodeType          // folder | file | section | paragraph | ...
  parent_id: string | null
  sort_order: number      // Position within parent

  // Filesystem mapping
  fs_path?: string        // For folder/file nodes
  fs_ino?: number         // Inode for change detection

  // Markdown mapping
  md_pos?: number         // Byte offset in file
  md_slug?: string        // Heading slug for sections

  // Task properties (if task)
  task_status?: 'open' | 'in_progress' | 'done' | 'blocked' | 'waiting'
  task_mark?: ' ' | 'x' | '/' | '1' | '2'  // Checkbox character
  assigned_to?: string
  due_date?: string

  // Content
  content?: string        // Text content (may be in CAS)
  content_hash?: string   // CAS reference for large content

  // Metadata
  data: Record<string, any>  // Frontmatter, custom fields
  created_at: number
  updated_at: number
}
```

---

## ID Mapping

Nodes need stable IDs across filesystem changes:

| Node Type | ID Strategy |
|-----------|-------------|
| folder | `ino:path` (inode + path) |
| file | `ino:path` (inode + path) |
| section | `path:pos:slug` (file path + byte offset + heading slug) |
| block | `path:pos` (file path + byte offset) |

When files move, inode stays same → ID preserved.
When content shifts, pos changes but slug anchors sections.

---

## Task Management

Tasks are nodes with `task_status` set. Compatible with:

- **Obsidian Tasks** — `- [ ] task text`
- **Beads** — git-backed issue tracker patterns

### Task Properties

```typescript
// Task-specific fields
task_status: 'open' | 'in_progress' | 'done' | 'blocked' | 'waiting' | 'scheduled'
task_mark: ' ' | 'x' | '/' | '1' | '2'  // Visual checkbox
priority: number        // 1-5
due_date: string        // YYYY-MM-DD
scheduled_date: string  // When to work on it
project_id: string      // Parent project node
tags: string[]          // Labels
dependencies: Dependency[]

interface Dependency {
  type: 'blocks' | 'blocked_by' | 'parent' | 'related' | 'waits_for'
  target_id: string
}
```

### Task Workflow (Asana-compatible)

```
inbox → today → in_progress → done
         ↓
      scheduled → (date arrives) → today
         ↓
      waiting → (unblocked) → today
         ↓
      blocked → (dependency done) → today
```

---

## Content Addressing

Large content stored in Content-Addressable Store (CAS):

```
.kimmi/
└── blobs/
    ├── ab/cd1234...  # SHA-256 prefix sharding
    └── ef/gh5678...
```

Node stores `content_hash` reference. Benefits:
- Deduplication
- Fast change detection
- Efficient sync

---

## Quick Reference

### Write Path

```
Edit file ──► km-watch ──► parse MD ──► emit(node_updated) ──► state.db
                                              │
                                              ▼
                                        events.jsonl
```

### Read Path

```
km-cli query ──► state.db (fast, indexed)
km-cli history ──► events.jsonl (full audit trail)
```

### Sync Paths

```
Filesystem → SQLite:  watch → debounce 5s → rescan → reconcile → emit
SQLite → Filesystem:  apply → debounce 3s → write files

Conflict resolution: last-write-wins (with event history for recovery)
Round-trip prevention: no-op if content unchanged
```

---

## CLI Commands

```bash
# Sync
km watch          # Start bidirectional sync daemon
km rebuild        # Rebuild state.db from events + filesystem

# Tasks (Asana replacement)
km list           # List tasks (orderable)
km inbox          # Show inbox
km today          # Today's tasks
km ready          # Tasks ready to work on (beads-compatible)
km add "Task"     # Quick capture
km done <id>      # Mark complete

# Navigation
km tree           # Outliner view
km board          # Kanban view
km search <query> # Full-text search

# Projects
km project list
km project show <id>

# Agents
km agent list
km agent start <id>
km agent queue <id>
```

---

## File Format: Markdown Export

Nodes export to Obsidian-compatible markdown:

```markdown
---
id: 01H5X...
type: file
tags: [project, active]
---

# Project Title

## Tasks

- [ ] First task
- [x] Completed task
- [/] In progress task

## Notes

Regular paragraph content.
```

### Folder Structure

```
vault/
├── index.md          # Or README.md — folder's content
├── projects/
│   ├── index.md
│   └── MyProject.md
└── inbox/
    └── quick-note.md
```

Folders are "see-through" — no special metadata file needed.
Optional `index.md` or `README.md` for folder-level content.

---

## References

- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [ULID Spec](https://github.com/ulid/spec)
- [Beads](https://github.com/steveyegge/beads) — Git-backed issue tracker
- [Obsidian](https://obsidian.md) — Markdown knowledge base
- [mdast](https://github.com/syntax-tree/mdast) — Markdown AST spec
