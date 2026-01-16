# km Specifications

See [../README.md](../README.md) for vision, use cases, and roadmap.

This directory contains technical specifications for implementation.

---

## Reading Order

| #   | Spec                           | Description                                      |
| --- | ------------------------------ | ------------------------------------------------ |
| 1   | [Overview](km-overview.md)     | Design principles, architecture, quick reference |
| 2   | [Data Model](km-data-model.md) | Nodes, events, storage schema                    |
| 3   | [Storage](km-storage.md)       | Persisted vs in-memory modes                     |
| 4   | [UI](km-ui.md)                 | Views, collapsing, formatting                    |
| 5   | [CLI](km-cli.md)               | Commands and TUI                                 |

### Supporting Specs

| Spec                                       | Description                        | Status         |
| ------------------------------------------ | ---------------------------------- | -------------- |
| [Markdown](km-markdown.md)                 | Parsing, AST conversion            | Implemented    |
| [Watch](km-watch.md)                       | Bidirectional filesystem sync      | Persisted mode |
| [Daemon](km-services.md)                   | Background sync & automation       | Design         |
| [Agents](km-agents.md)                     | AI agent orchestration             | Future         |
| [Tasks](km-tasks.md)                       | Task management system             | Implemented    |
| [TUI State](km-tui-state.md)               | TUI state architecture             | Phase 1        |
| [Board Navigation](km-board-navigation.md) | Visual cursor, selection, shifting | Implemented    |
| [Design System](km-design-system.md)       | Colors, styling, visual hierarchy  | Implemented    |
| [Roadmap](../ROADMAP.md)                   | Implementation phases              | Current        |

---

## Glossary

| Term              | Definition                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| **DBNode**        | Flat database record with `parent_id`. Stored in SQLite (@km/storage).           |
| **TNode**         | Recursive tree structure with `children[]`. For navigation (@km/tree).           |
| **BoardState**    | Visual navigation state: cursor, selection, fold (@km/board).                    |
| **fs-tree**       | Raw filesystem: folders, files, markdown content. Source of truth.               |
| **node**          | Everything is a node: folder, file, section, task, paragraph, etc.               |
| **collapsing**    | Unifying same-named folder/file/section into one display line.                   |
| **memory mode**   | No `.km/`. SQLite in RAM. Rebuilt each run. Ephemeral IDs.                       |
| **disk mode**     | `.km/` exists. SQLite on disk. Full tracking: events, history, stable IDs, sync. |
| **agent**         | An AI agent that can claim and execute tasks.                                    |
| **harness**       | A preconfigured set of tools and data connectors for an agent.                   |
| **queue**         | Tasks assigned to an agent, awaiting execution.                                  |
| **Kimmi**         | The default built-in agent / assistant.                                          |
| **cursoring**     | Moving cursor to visually adjacent block (hjkl keys).                            |
| **navigating**    | Changing board root via zoom (u/Enter/Backspace/[/]).                            |
| **extend-select** | Extending selection in visual direction (shift+hjkl).                            |
| **shifting**      | Moving selected nodes in visual direction (opt+hjkl).                            |
| **moving**        | Relocating nodes to arbitrary destination (m + destination).                     |

---

## Architecture

### Package Structure

```
packages/                          # Shared libraries
  @km/storage    - DBNode, SQLite, queries, events, sync
  @km/markdown   - Parser (markdown ↔ DBNode)
  @km/tree       - TNode, tree queries, display names
  @km/board      - BoardState, cursor, selection, fold

apps/
  km-cli/        → @km/cli-app     CLI commands
  km-tui/        → @km/tui-app     TUI application
    packages/
      km-ink/    → @km/ink         React/Ink renderer
      km-opentui/                  OpenTUI renderer
  km-sh/         → @km/sh-app      Shell application
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/                                                          │
│  @km/cli-app       CLI commands (km task, km view, km show)     │
│  @km/tui-app       TUI application (km view)                    │
│  @km/sh-app        Shell application (km sh)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────────┐ ┌───────────────────────────────────────┐
│  Agent Runtime      │ │  @km/board          Visual navigation │
│  (km-agents.md)     │ │  Cursor, selection, fold, zoom        │
│  Harnesses, queues  │ └───────────────────────────────────────┘
└─────────────────────┘               │
              │                       ▼
              │       ┌───────────────────────────────────────┐
              │       │  @km/tree             Tree data model │
              └──────►│  TNode, queries, display names        │
                      └───────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  @km/storage          (km-storage.md)         │
              │  DBNode, SQLite, events, sync                 │
              └───────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  @km/markdown         (km-markdown.md)        │
              │  Markdown files ↔ DBNode                      │
              └───────────────────────────────────────────────┘
```

### Type Hierarchy

| Layer | Type         | Description                                     |
| ----- | ------------ | ----------------------------------------------- |
| DB    | `DBNode`     | Flat record with `parent_id` (stored in SQLite) |
| Tree  | `TNode`      | Recursive with `children[]` (for navigation)    |
| Board | `BoardState` | Visual state: cursor, selection, fold           |
| App   | `AppState`   | App-specific: modals, search, view mode         |

---

## Architectural Principles (MUST HAVE)

These principles are non-negotiable. All code changes MUST adhere to them.

### 1. Clear Layering

```
┌───────────────────────────────────────────────────────────────┐
│  App Layer              (apps/)                               │
│  • @km/tui-app, @km/sh-app, @km/cli-app                       │
│  • App-specific state (modals, search)                        │
│  • User input → actions                                       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Board Layer            (@km/board)                           │
│  • Visual navigation state                                    │
│  • Cursor, selection, fold, zoom                              │
│  • Returns BoardState                                         │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Tree Layer             (@km/tree)                            │
│  • TNode (recursive tree structure)                           │
│  • Tree queries, traversal                                    │
│  • Display name computation                                   │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Storage Layer          (@km/storage)                         │
│  • DBNode CRUD operations                                     │
│  • Event emission (disk mode)                                 │
│  • Filesystem ↔ DB synchronization                            │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Parser Layer           (@km/markdown)                        │
│  • Markdown → AST → DBNode                                    │
│  • DBNode → Markdown                                          │
│  • Extracts: frontmatter, tasks, refs, fields                 │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Filesystem             (plain markdown files)                │
│  • Source of truth in memory mode                             │
│  • Synchronized with model in disk mode                       │
└───────────────────────────────────────────────────────────────┘
```

**Rules:**

- Each layer only calls the layer directly below it
- UI never touches filesystem directly
- Model changes MUST propagate to filesystem (bidirectional)
- Parser is stateless — pure transformation

### 2. Bidirectional Sync (Task Edits)

All task modifications MUST flow both directions:

```
User toggles task in TUI
         │
         ▼
┌─────────────────┐
│  UI Layer       │  Calls: store.updateNode(id, {task_status: "done"})
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Model Layer    │  Updates SQLite, emits node_updated event
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Sync Layer     │  Detects change, calls writer
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Parser Layer   │  Regenerates markdown for affected node
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Filesystem     │  File updated: - [x] Task
└─────────────────┘
```

**AND** the reverse:

```
User edits markdown file
         │
         ▼
┌─────────────────┐
│  Filesystem     │  File watcher detects change
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Sync Layer     │  Debounces, triggers re-parse
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Parser Layer   │  Parses markdown → nodes
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Model Layer    │  Diffs and updates SQLite
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  UI Layer       │  Re-renders with new state
└─────────────────┘
```

### 3. Test-Driven Development

**BEFORE implementing any feature:**

1. Write acceptance test(s) that verify user-visible behavior
2. Run `bun test` — test should fail
3. Implement the feature
4. Run `bun test` — test should pass
5. Run `bun fix` — code must lint/format

**Quality gates that MUST pass before any commit:**

```bash
bun fix              # Auto-fix lint + format issues
bun test             # All tests must pass
```

**Test file locations:**

- Unit tests: `packages/<pkg>/tests/` or `apps/<app>/tests/`
- E2E tests: alongside implementation, testing real CLI behavior

**Acceptance test pattern:**

```typescript
// tests/task-toggle.test.ts
import { describe, it, expect } from "bun:test";

describe("km task toggle", () => {
  it("marks task done in model AND file", async () => {
    // Setup: create temp dir with markdown file
    // Action: toggle task via store
    // Assert: SQLite shows done
    // Assert: File contains [x]
  });
});
```

### 4. Design Principles

1. **Everything is a node** — folders, files, sections, tasks, paragraphs
2. **Zero setup** — works on any markdown directory
3. **Markdown-native** — files are the source of truth
4. **Git-friendly** — plain text, mergeable
5. **Progressive enhancement** — `km init` adds persistence when needed
