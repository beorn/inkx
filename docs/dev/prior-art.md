# Prior Art

Research on metadata syntax, recurrence models, and design patterns from other systems.

---

## Metadata Syntax Comparison

| System        | Assignee            | Due Date                          | Priority                    | Tags        |
| ------------- | ------------------- | --------------------------------- | --------------------------- | ----------- |
| **todo.txt**  | —                   | `due:YYYY-MM-DD`                  | `(A)`-`(Z)`                 | `@context`  |
| **TaskPaper** | —                   | `@due(YYYY-MM-DD)`                | `@priority(N)`              | `@tag`      |
| **Todoist**   | —                   | natural language                  | `!p1`-`!p4`                 | `@label`    |
| **Org-mode**  | —                   | `DEADLINE:`                       | `[#A]`                      | `:tag:`     |
| **Logseq**    | —                   | `deadline:: DATE`                 | —                           | `#tag`      |
| **Obsidian**  | —                   | `📅 YYYY-MM-DD` or `[due:: DATE]` | `⏫` or `[priority:: high]` | `#tag`      |
| **Dataview**  | `[assigned:: name]` | `[due:: DATE]`                    | `[priority:: N]`            | `#tag`      |
| **Tana**      | field               | field                             | field                       | `#supertag` |
| **Linear**    | UI/API              | UI/API                            | UI/API                      | labels      |

---

## Metadata Syntax Families

| Family              | Syntax                 | Examples         |
| ------------------- | ---------------------- | ---------------- |
| **Key-colon-value** | `key:value`            | todo.txt, km     |
| **Property syntax** | `key:: value`          | Logseq, Dataview |
| **Function style**  | `@key(value)`          | TaskPaper        |
| **Emoji prefix**    | `📅 value`             | Obsidian Tasks   |
| **Brackets**        | `[key:: value]`        | Dataview         |
| **Curly brace**     | `{#id .class key=val}` | Pandoc, kramdown |

---

## Recurrence Models

### 1. Clone-on-Complete (km uses this)

Each completion creates a new task entity.

```
Task A (recur: FREQ=WEEKLY)  →  mark done  →  Task A' (done)
                                              Task B (recur: FREQ=WEEKLY)
```

**Pros**: Full history per instance, natural fit for event log
**Cons**: Database grows, no single template to edit
**Used by**: Todoist, Things, OmniFocus, Reminders.app

### 2. Template + Virtual Instances

One template generates virtual instances on-demand.

**Pros**: Single source of truth, efficient storage
**Cons**: Virtual instances can't have notes, complex queries
**Used by**: Google Calendar, Apple Calendar

### 3. Hybrid: Template + Materialized Exceptions

Template generates instances, but edits materialize them.

**Pros**: Best of both: efficient + customizable
**Cons**: Two types of entities, query complexity
**Used by**: Outlook, Google Calendar (for events)

### 4. Parent-Child Series

Recurring task is a "series" node with child instances.

**Pros**: Fits parent-child model, series as project
**Cons**: Need to generate ahead, cascade delete issues
**Used by**: Some project management tools

---

## km Design Choices

| Aspect     | Choice                      | Rationale                             |
| ---------- | --------------------------- | ------------------------------------- |
| Recurrence | Clone-on-complete           | Each instance is real, full history   |
| Metadata   | `key:value` inline          | Compact, grep-friendly, like todo.txt |
| References | `@person` `#tag` `+project` | Sigils = node links                   |
| Boards     | H2 columns + wikilinks      | Pure markdown, no special format      |
| Status     | 5 states                    | Minimal — covers all work states      |
| Queries    | Contains by default         | `@bjorn` matches @bjornson            |

---

## Sibling Projects

These projects share ideas, patterns, and code with km. All are accessible on the local filesystem and can be referenced for implementation inspiration.

### cloudi (../cloudi)

**AI email assistant + cloud PIM** — Nov 2025 – Jan 2026, ~1300 commits

Cloudi is a multi-mode Claude AI assistant combining an interactive CLI chat interface with an autonomous Gmail bot. The system stores all state in Gmail (tasks, contacts, drafts as key-value storage) rather than managing a separate database, enabling zero-infrastructure deployment. Features include conversation continuity across chat/email modes, tool result caching, and integration with Google Tasks/Contacts APIs.

**Tech stack**: Vercel AI SDK, TypeScript, Bun workspaces, Google APIs

**Patterns worth borrowing**:

- Build-time version generation (`scripts/generate-build-info.ts` → `build-info.gen.ts`)
- Structured logger (`@beorn/logger`) with log levels + `--log-level` CLI flag
- Type-safe env config via Zod (`@cloudi/env-config`)
- AppContext pattern for dependency injection
- Feature/task ID system (F###, T###) in CHANGELOG
- Factory functions over classes for better tree-shaking

### kimmi (../kimmi)

**Local-first PIM with CRDT sync** — Oct 2025 – Jan 2026, ~1200 commits

Kimmi is a local-first personal information manager that unifies contacts, calendar, notes, tasks, and files using Automerge CRDTs for conflict-free replication. It syncs bidirectionally with external PIM systems (CardDAV/CalDAV for iCloud, Google, Outlook) while maintaining complete local control. The architecture uses a Repo-based CRDT model with separate tree and content documents, enabling partial replication and efficient network sync.

**Tech stack**: Automerge 3.x, automerge-repo, Bun, TypeScript, vCard4

**Key differences from km**:
| Aspect | kimmi | km |
|--------|-------|-----|
| Storage | Automerge CRDTs | SQLite + markdown files |
| Scope | Full PIM (contacts, calendar, notes, tasks, files) | Task-focused markdown |
| Sync | Bidirectional with CardDAV/CalDAV | File system as source of truth |
| Conflict resolution | Automatic (CRDT) | Manual (file-based) |

**Patterns worth borrowing**:

- `@kimmi/obs` — Structured logging with hierarchical namespaces
- Connector architecture for external system sync
- Shadow cache pattern for external data

### decker (../../DZ/decker)

**Web-based collaborative boards** — Jan 2020 – Jan 2025, ~3000 commits

Decker (also called Boardliner) is a web-based document and project management app built with Next.js, React, Slate editor, and Yjs for real-time collaboration. Enables hierarchical document organization with kanban-style board views, drag-and-drop cards, outline editing, live cursors, and cloud sync. Collaboration with Mike Welch exploring rich board interfaces before km's TUI approach.

**Tech stack**: Next.js, React, Slate, Yjs, Radix UI, Tailwind, PostgreSQL, Redis

**Relationship to km's board view**:
| Concept | decker | km |
|---------|--------|-----|
| Platform | Web (React) | TUI (Ink) |
| Interaction | Drag-and-drop, mouse | Keyboard-first |
| Collaboration | Real-time multi-user (Yjs) | Single-user file-based |
| Data model | Hierarchical nodes | Hierarchical nodes |

**Shared concepts**: zoom, navigation history, move mode, selection states, columns/cards, cursor navigation, fold states

---

## See Also

- [../07-tasks.md](../07-tasks.md) — Task data model, GTD workflow
