# km Specifications

See [../README.md](../README.md) for vision, use cases, and roadmap.

This directory contains technical specifications for implementation.

---

## Reading Order

| #   | Spec                           | Description                                      |
| --- | ------------------------------ | ------------------------------------------------ |
| 1   | [Overview](km-overview.md)     | Design principles, architecture, quick reference |
| 2   | [Data Model](km-data-model.md) | Nodes, events, storage schema                    |
| 3   | [Store](km-store.md)           | Persisted vs in-memory modes                     |
| 4   | [UI](km-ui.md)                 | Views, collapsing, formatting                    |
| 5   | [CLI](km-cli.md)               | Commands and TUI                                 |

### Supporting Specs

| Spec                         | Description                   | Status         |
| ---------------------------- | ----------------------------- | -------------- |
| [Markdown](km-markdown.md)   | Parsing, AST conversion       | Implemented    |
| [Watch](km-watch.md)         | Bidirectional filesystem sync | Persisted mode |
| [Daemon](km-services.md)     | Background sync & automation  | Design         |
| [Agents](km-agents.md)       | AI agent orchestration        | Future         |
| [Tasks](km-tasks.md)         | Task management system        | Implemented    |
| [TUI State](km-tui-state.md) | TUI state architecture        | Phase 1        |
| [Roadmap](../ROADMAP.md)     | Implementation phases         | Current        |

---

## Glossary

| Term            | Definition                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| **fs-tree**     | Raw filesystem: folders, files, markdown content. Source of truth.               |
| **km-tree**     | Unified node hierarchy in SQLite. Queryable.                                     |
| **ui-tree**     | Render-time transformation with collapsing and formatting.                       |
| **node**        | Everything is a node: folder, file, section, task, paragraph, etc.               |
| **collapsing**  | Unifying same-named folder/file/section into one display line.                   |
| **memory mode** | No `.km/`. SQLite in RAM. Rebuilt each run. Ephemeral IDs.                       |
| **disk mode**   | `.km/` exists. SQLite on disk. Full tracking: events, history, stable IDs, sync. |
| **agent**       | An AI agent that can claim and execute tasks.                                    |
| **harness**     | A preconfigured set of tools and data connectors for an agent.                   |
| **queue**       | Tasks assigned to an agent, awaiting execution.                                  |
| **Kimmi**       | The default built-in agent / assistant.                                          |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI / TUI                                                      │
│  km task, km view, km show, km agent                            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────────┐ ┌───────────────────────────────────────┐
│  Agent Runtime      │ │  Display Layer        (km-ui.md)      │
│  (km-agents.md)     │ │  Collapsing, formatting               │
│  Harnesses, queues  │ └───────────────────────────────────────┘
└─────────────────────┘               │
              │                       ▼
              │       ┌───────────────────────────────────────┐
              │       │  Store Layer            (km-store.md) │
              └──────►│  MemoryStore | DiskStore              │
                      └───────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  km-tree                (km-data-model.md)    │
              │  Unified nodes in SQLite                      │
              └───────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌───────────────────────────────────────────────┐
              │  fs-tree                (km-markdown.md)      │
              │  Markdown files on disk                       │
              └───────────────────────────────────────────────┘
```

---

## Architectural Principles (MUST HAVE)

These principles are non-negotiable. All code changes MUST adhere to them.

### 1. Clear Layering

```
┌───────────────────────────────────────────────────────────────┐
│  UI Layer               (km-cli, TUI components)              │
│  • Renders nodes for display                                  │
│  • User input → commands                                      │
│  • NO direct filesystem access                                │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Query Layer            (km-store queries)                    │
│  • SQL queries on km-tree                                     │
│  • Filtering, sorting, aggregation                            │
│  • Returns Node objects                                       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Model Layer            (km-store, km-core)                   │
│  • Node CRUD operations                                       │
│  • Event emission (disk mode)                                 │
│  • Bidirectional sync coordination                            │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Sync Layer             (km-watch)                            │
│  • Filesystem ↔ Model synchronization                         │
│  • Conflict detection & resolution                            │
│  • Change debouncing                                          │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Parser Layer           (km-markdown)                         │
│  • Markdown → AST → Nodes (parseMarkdownToNodes)              │
│  • Nodes → Markdown (nodesToMarkdown)                         │
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
