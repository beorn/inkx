# Tasks Prior Art

Research on metadata syntax, recurrence models, and design patterns from other systems.

---

## Metadata Syntax Comparison

| System | Assignee | Due Date | Priority | Tags | ID/Permalink |
|--------|----------|----------|----------|------|--------------|
| **[todo.txt](https://github.com/todotxt/todo.txt)** | — | `due:YYYY-MM-DD` | `(A)`-`(Z)` | `@context` | — |
| **[TaskPaper](https://guide.taskpaper.com/)** | — | `@due(YYYY-MM-DD)` | `@priority(N)` | `@tag` | `@id(value)` |
| **[Todoist](https://todoist.com/)** | — | natural language | `!p1`-`!p4` | `@label` | internal |
| **[TODO.md](https://github.com/todomd/todo.md)** | `@name` | `YYYY-MM-DD` | — | `#tag` | — |
| **[Org-mode](https://orgmode.org/)** | — | `DEADLINE:` | `[#A]` | `:tag:` | `:ID:` property |
| **[Logseq](https://docs.logseq.com/)** | — | `deadline:: DATE` | — | `#tag` | `id:: UUID` |
| **[Obsidian Tasks](https://obsidian-tasks-group.github.io/obsidian-tasks/)** | — | `📅 YYYY-MM-DD` or `[due:: DATE]` | `⏫` or `[priority:: high]` | `#tag` | `^block-id` |
| **[Dataview](https://blacksmithgu.github.io/obsidian-dataview/)** | `[assigned:: name]` | `[due:: DATE]` | `[priority:: N]` | `#tag` | — |
| **[Task Genius](https://taskgenius.md/)** | — | `📅 YYYY-MM-DD` | `⏫` or `[#A]` or `[priority:: N]` | `#tag` | — |
| **[TaskForge](https://taskforge.md/)** | `👤 @user` | `📅 YYYY-MM-DD` | `⏫` emoji | `@context` | — |
| **[Tana](https://tana.inc/)** | field | field | field | `#supertag` | node ID |
| **[Linear](https://linear.app/)** | UI/API | UI/API | UI/API | labels | UUID |
| **[Pandoc](https://pandoc.org/MANUAL.html)** | — | — | — | `{.class}` | `{#id}` |
| **[GFM](https://github.github.com/gfm/)** | — | — | — | — | `#heading-slug` |

---

## Metadata Syntax Families

Systems use different approaches for inline metadata:

| Family | Syntax | Placement | Examples |
|--------|--------|-----------|----------|
| **Key-colon-value** | `key:value` | same line | todo.txt, km |
| **Property syntax** | `key:: value` | line(s) below | Logseq, Dataview |
| **Function style** | `@key(value)` | same line | TaskPaper |
| **Emoji prefix** | `📅 value` | same line | Obsidian Tasks, TaskForge |
| **Brackets** | `[key:: value]` | inline | Dataview |
| **Curly brace attrs** | `{#id .class key=val}` | same line (end) | Pandoc, kramdown |
| **Typed tags** | `#supertag` | node-level | Tana |
| **Structured data** | fields/UI | separate | Linear, Notion |

---

## Placement Patterns

```markdown
# Same line (km, todo.txt, TaskPaper)
- [ ] Review budget @bjorn due:2025-01-15

# End of line (Pandoc)
## Review budget {#budget-review .task}

# Lines below (Logseq)
- Review budget
  due:: 2025-01-15
  assigned:: bjorn

# Fenced block (Pandoc divs)
::: {#budget-review .task due="2025-01-15"}
Review budget content here...
:::
```

**Tradeoffs:**
- **Same line** — compact, good for short metadata, can get cluttered
- **Lines below** — cleaner for many properties, but takes more space
- **Fenced blocks** — powerful for rich content, but verbose

---

## Tana Supertags vs Plain Tags

Tana's `#supertag` is fundamentally different from plain hashtags:

| Aspect | Plain `#tag` | Tana `#supertag` |
|--------|--------------|------------------|
| Purpose | Classification/grouping | Type definition ("is-a") |
| Schema | None | Fields, defaults, views |
| Inheritance | No | Yes (`#author` extends `#person`) |
| Fields | No | Yes (due date, priority, etc.) |
| Behavior | Search/filter only | Auto-populates template |

**Supertags define what a node *is***, not just how to find it. `#task` in Tana means
"this node is a task" and brings fields (status, due, assignee), not just a search keyword.

Plain hashtags still work in Tana for simple categorization, but supertags enable
database-like behavior with typed fields and views.

---

## Recurrence Models

### 1. Clone-on-Complete

Each completion creates a new task entity.

```
Task A (recur: FREQ=WEEKLY)  →  mark done  →  Task A' (done)
                                              Task B (recur: FREQ=WEEKLY)
```

**Schema:**
```typescript
interface Node {
  recur?: string;      // RRULE (on current active instance)
  recur_prev?: string; // ID of task this was cloned from
}
```

**Pros:**
- Each instance has full history, notes, edits
- Simple mental model: "tasks are tasks"
- Natural fit for event log / CRDT sync
- Skip/defer is just editing that instance's due date
- Backlinks and references work normally

**Cons:**
- Database grows with every completion
- Series modifications affect only future instances
- No single "template" to edit for all future occurrences
- Can pollute search with completed instances (mitigate: filter by default)

**Used by:** Todoist, Things, OmniFocus, Reminders.app, Asana

---

### 2. Template + Virtual Instances

One template generates virtual instances on-demand.

```
Template T (recur: FREQ=WEEKLY)
  └── generates →  Virtual Jan 6, Virtual Jan 13, Virtual Jan 20...
```

**Schema:**
```typescript
interface RecurringTemplate {
  id: string;
  content: string;
  recur: string;          // RRULE
  exceptions: string[];   // Dates to skip (EXDATE)
  completions: string[];  // Dates completed
}
// Virtual instances computed, not stored
```

**Pros:**
- Single source of truth for rule changes
- Efficient storage (one record, many instances)
- Calendar-like exception handling (EXDATE)
- Easy "edit all future" behavior

**Cons:**
- Virtual instances can't have individual notes/edits
- Completion is "mark date done" not "mark task done"
- Doesn't fit node-as-file model well
- Complex queries (must compute instances)
- Sync conflicts on completions array

**Used by:** Google Calendar, Apple Calendar, iCal spec

---

### 3. Hybrid: Template + Materialized Exceptions

Template generates instances, but edits materialize them.

```
Template T (recur: FREQ=WEEKLY)
  └── Jan 6: (virtual)
  └── Jan 13: Task M (materialized, edited)
  └── Jan 20: (virtual)
```

**Schema:**
```typescript
interface Template {
  id: string;
  recur: string;
  completions: Date[];    // Simple completions stay here
}

interface MaterializedInstance {
  template_id: string;
  occurrence_date: Date;  // Which instance this represents
  // ... full task fields, can diverge from template
}
```

**Pros:**
- Best of both: efficient storage + instance customization
- "Edit this one" vs "edit all" is clear
- Calendar apps use this model

**Cons:**
- Two types of entities
- Query complexity: merge virtual + materialized
- Which fields come from template vs instance?

**Used by:** Outlook, Google Calendar (for events)

---

### 4. Parent-Child Series

Recurring task is a "series" node with child instances.

```
Series S (type: recurring_series, recur: FREQ=WEEKLY)
  ├── Task 1 (parent: S, occurrence: 2025-01-06)
  ├── Task 2 (parent: S, occurrence: 2025-01-13)
  └── Task 3 (parent: S, occurrence: 2025-01-20)
```

**Schema:**
```typescript
interface Series {
  type: "recurring_series";
  recur: string;
  generate_ahead: number;  // How many future instances to create
}

interface Instance {
  parent_id: string;       // Points to series
  occurrence: string;      // ISO date for this instance
  // ... full task fields
}
```

**Pros:**
- Fits parent-child model naturally
- Series node holds the rule, instances are real tasks
- Can view series as project, see all instances
- Each instance fully independent

**Cons:**
- Need to generate instances (how far ahead?)
- Series deletion = cascade delete instances?
- "Edit future instances" is N edits

**Used by:** Asana (loosely), some project management tools

---

### 5. Inline Expansion (Logseq/Org-mode style)

Recurrence is a property; completion adds a new block.

```markdown
- [ ] Weekly review
  recur:: FREQ=WEEKLY
  - [x] 2025-01-06 ✓
  - [x] 2025-01-13 ✓
  - [ ] 2025-01-20  ← current
```

**Pros:**
- Single file, visible history
- Markdown-native
- No separate entities

**Cons:**
- File grows with every completion
- Hard to query "what's due today"
- Parsing complexity
- Doesn't separate "done" from "open" instances

**Used by:** Org-mode, Logseq (partially)

---

## Recurrence Model Comparison

| Aspect | Clone | Template | Hybrid | Parent-Child | Inline |
|--------|-------|----------|--------|--------------|--------|
| Storage efficiency | Low | High | Medium | Low | Medium |
| Instance customization | Full | None | On edit | Full | Limited |
| Single source for rule | No | Yes | Yes | Yes | Yes |
| Fits node model | Yes | No | Partial | Yes | Yes |
| Query simplicity | Yes | No | Partial | Yes | No |
| Sync/CRDT friendly | Yes | Partial | Partial | Yes | Yes |
| Skip instance | Edit due | EXDATE | EXDATE | Delete | Mark skip |
| Edit one instance | Normal | Materialize | Edit | Normal | Edit child |
| Edit all future | Can't | Edit template | Edit template | N edits | Edit parent |

---

## km Design Choices

### Recurrence: Clone-on-Complete

km uses clone-on-complete (like Todoist, Things, Asana):
- Fits km's "everything is a node" model
- Each instance has its own history
- Natural for markdown files and event log

**Linked list via `recur_prev`:**
- Each instance points to its predecessor (the task it was cloned from)
- Traverse chain to find history: E → D → C → B → A
- Pattern changes visible in chain (each instance has its own `recur`)

**Shallow clones:** Only parent task cloned, not subtasks
- Avoids expensive deep copies of large tasks
- Prevents search pollution from accumulated subtasks
- Subtasks represent the same checklist each recurrence (they reset)

**Pattern changes:** Update `recur` on current instance
- Linked list naturally captures pattern evolution
- Future clones inherit pattern from the instance they're cloned from

**Search filtering:** Completed instances excluded by default (`status != done`)
- Prevents clone pollution in search results
- Use `--all` flag to include history

### Metadata Syntax

Same-line `key:value` (like todo.txt):
- Compact for typical 0-3 metadata fields
- Familiar syntax
- No special parsing for multi-line properties

### Type Determination

Implicit from structure:
- Checkbox prefix (`- [ ]`) → task
- Frontmatter `type: task` → task
- Future: `#type/task` or `##task` for explicit typing

---

## See Also

- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks.md](km-tasks.md) — Overview
