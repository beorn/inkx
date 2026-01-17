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

## See Also

- [../07-tasks.md](../07-tasks.md) — Task data model, GTD workflow
