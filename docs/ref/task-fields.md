# Task Fields Reference

Cross-system field reference for km tasks. Maps km fields to Asana, VTODO (CalDAV/RFC 5545), Linear, Jira, and GitHub Issues.

See also: [tasks guide](../guides/tasks.md), [recurrence design](../design/recurrence.md), [markdown format](markdown.md), [Asana import](../../apps/km-cli/src/import/adapters/asana/README.md).

---

## Field Summary

| Field | Type | Markdown | Example | Description |
| --- | --- | --- | --- | --- |
| `task_marker` | `TaskMarker` | `[ ]` `[x]` `[/]` `[!]` `[-]` | `[x]` | Status marker (stored) |
| `task_status` | `TaskStatus` | — | `done` | Derived from marker |
| `priority` | `number` | `p:: N` | `p:: 1` | 0-4 (P0=urgent, P4=backlog) |
| `due_at` | `string` | `due:: DATE` | `due:: 2026-03-15` | ISO 8601 date or datetime |
| `start_at` | `string` | `start:: DATE` | `start:: 2026-03-01` | Defer until date |
| `assigned_to` | `string` | `@slug` | `@alice` | First `@` reference |
| `rrule` | `string` | `recur:: RULE` | `recur:: every 2 weeks` | RRULE + km `FROM` extension |
| `recur_prev` | `string` | — | node ID | Previous recurrence instance |
| `completed_at` | `number` | — | Unix ms | When marked done |
| `reminders` | `Reminder[]` | — | `[{minutes_before: 15}]` | Advance notifications |

---

## Status

Five statuses, stored as `task_marker` on the node.

| Marker | Status | Meaning | Keyword |
| --- | --- | --- | --- |
| `[ ]` | `todo` | Ready to work on | Available |
| `[/]` | `wip` | Actively being worked on | In progress |
| `[!]` | `blocked` | Waiting on something | Stuck |
| `[x]` | `done` | Completed | Finished |
| `[-]` | `dropped` | Cancelled | Won't do |

### Cross-System Status Mapping

| km | Asana | VTODO (RFC 5545) | Linear | Jira | GitHub Issues |
| --- | --- | --- | --- | --- | --- |
| `todo` | not completed | `NEEDS-ACTION` | Todo / Backlog | To Do | Open |
| `wip` | not completed | `IN-PROCESS` | In Progress | In Progress | Open |
| `blocked` | not completed | `IN-PROCESS` + `X-KM-STATUS:blocked` | In Progress (blocked label) | Blocked | Open (blocked label) |
| `done` | completed=true | `COMPLETED` + `PERCENT-COMPLETE:100` | Done | Done | Closed |
| `dropped` | completed=true | `CANCELLED` | Cancelled | Won't Do | Closed (wontfix label) |

**Notes:**
- VTODO has no `blocked` status — km uses `IN-PROCESS` with a custom `X-KM-STATUS:blocked` property for round-trip fidelity.
- Asana conflates `todo`/`wip`/`blocked` into "not completed" — km derives these from section placement and custom fields on import.
- GitHub Issues only has Open/Closed — status is conveyed via labels.

---

## Priority

Integer 0-4. Absence (`null`/`undefined`) means no priority set.

| Level | Name | Description | Keybinding |
| --- | --- | --- | --- |
| P0 | Urgent | Drop everything, fix now | `t 0` |
| P1 | Critical | Must fix this sprint | `t 1` |
| P2 | High | Important, plan it | `t 2` |
| P3 | Medium | Normal priority | `t 3` |
| P4 | Low | Backlog, nice to have | `t 4` |
| — | None | No priority assigned | (cycle past P4) |

- `t !` cycles: none → P0 → P1 → P2 → P3 → P4 → none
- `t 0`–`t 4` sets directly (no picker)

### Markdown Formats

```markdown
- [ ] Task p:: 2            # Canonical (Dataview-compatible)
- [ ] Task p:2              # Legacy (todo.txt-style, read-only)
- [ ] Task ⏫               # Emoji: P1 (Obsidian Tasks, read-only)
- [ ] Task 🔼               # Emoji: P2
- [ ] Task 🔽               # Emoji: P3
```

Parsing accepts all formats; writes always use `p:: N`.

### Cross-System Priority Mapping

| km | Asana | VTODO (RFC 5545) | Linear | Jira | beads (bd) |
| --- | --- | --- | --- | --- | --- |
| P0 | — (no P0) | `PRIORITY:1` | Urgent (0) | Blocker | P0 |
| P1 | High | `PRIORITY:1` | High (1) | Critical | P1 |
| P2 | Medium | `PRIORITY:3` | Medium (2) | Major | P2 |
| P3 | Low | `PRIORITY:5` | Low (3) | Minor | P3 |
| P4 | — (only 3 levels) | `PRIORITY:7` | No priority (4) | Trivial | P4 |
| None | None | `PRIORITY:0` (undefined) | No priority (4) | — | — |

**References:**
- [RFC 5545 §3.8.1.9](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.1.9): VTODO PRIORITY is 0-9 (0=undefined, 1=highest, 9=lowest). Values 1,5,9 map to HIGH/MEDIUM/LOW.
- [Linear Priority Docs](https://linear.app/docs/priority): 5 levels (0=Urgent through 4=No priority).
- [P0-P4 Industry Convention](https://fibery.io/blog/product-management/p0-p1-p2-p3-p4/): P0-P4 is the de facto engineering standard, popularized by Google/Linear.

**Compatibility notes:**
- Asana has only 3 priority levels (High/Medium/Low) via a custom field — no P0 or P4. On import, Asana's numeric values map directly where possible.
- VTODO priority uses 1-9 where 1=highest. km maps: P0→1, P1→1, P2→3, P3→5, P4→7. On import, reverse mapping: 1-2→P0, 3-4→P2, 5→P3, 6-7→P3, 8-9→P4.
- Linear uses 0-4 where 0=Urgent — identical to km's P0-P4 model.
- GitHub Issues has no priority field — use labels (`priority: P0`, etc.).
- Jira uses named levels (Blocker through Trivial) — maps 1:1 to P0-P4.

---

## Dates

### Due Date

| Property | `due_at` |
| --- | --- |
| Type | ISO 8601 string |
| Date only | `2026-03-15` |
| With time | `2026-03-15T14:00:00-08:00` |
| Markdown | `due:: 2026-03-15` or `due:: 2026-03-15T14:00` |
| Legacy | `due:2026-03-15` (read-only) |

### Start Date (Defer Until)

| Property | `start_at` |
| --- | --- |
| Type | ISO 8601 string |
| Markdown | `start:: 2026-03-01` |
| Meaning | Don't show/surface until this date |

### Cross-System Date Mapping

| km | Asana | VTODO | Linear | Jira |
| --- | --- | --- | --- | --- |
| `due_at` (date) | `due_on` | `DUE` (DATE) | `dueDate` | Due Date |
| `due_at` (datetime) | `due_at` | `DUE` (DATE-TIME) | — | — |
| `start_at` | `start_on` / `start_at` | `DTSTART` | — | — |
| `completed_at` | `completed_at` | `COMPLETED` (timestamp) | `completedAt` | Resolution Date |

---

## Recurrence

Full specification: [design/recurrence.md](../design/recurrence.md).

km uses iCal RRULE (RFC 5545) with one extension: the `FROM` parameter.

| FROM value | Meaning | Default? |
| --- | --- | --- |
| `FROM=COMPLETED` | Next due = interval from completion date | Yes (omitted) |
| `FROM=DUE` | Next due = interval from due date | Must be explicit |

### Cross-System Recurrence Mapping

| System | From-completion support | Format | Notes |
| --- | --- | --- | --- |
| **km** | `FROM=COMPLETED` (default) | RRULE extension | Custom `FROM` parameter |
| **Asana** | `periodically` type only | JSON object | Max 30 days; all others from due |
| **VTODO** | No standard | `RRULE` | RFC 5545 says nothing about completion anchoring |
| **Todoist** | `every!` prefix | Natural language | `every! 2 weeks` = from completion |
| **Obsidian** | `when done` suffix | Natural language | `every week when done` |
| **Things** | "After Completion" toggle | UI toggle | — |
| **OmniFocus** | "Defer Another" toggle | UI toggle | — |

### Asana Recurrence Import

| Asana type | Asana JSON | km RRULE |
| --- | --- | --- |
| Daily | `{type: "daily", freq: 1}` | `FREQ=DAILY;FROM=DUE` |
| Weekly (Mon,Wed,Fri) | `{type: "weekly", days: [1,3,5]}` | `FREQ=WEEKLY;BYDAY=MO,WE,FR;FROM=DUE` |
| Monthly (15th) | `{type: "monthly", date: 15}` | `FREQ=MONTHLY;BYMONTHDAY=15;FROM=DUE` |
| Yearly | `{type: "yearly", freq: 1}` | `FREQ=YEARLY;FROM=DUE` |
| Periodically (14d) | `{type: "periodically", freq: 14}` | `FREQ=DAILY;INTERVAL=14` (FROM=COMPLETED) |

Asana day-of-week: 1=MO, 2=TU, 3=WE, 4=TH, 5=FR, 6=SA, 7=SU.

### VTODO Recurrence Export

```
RRULE:FREQ=DAILY;INTERVAL=14          # Standard (parseable by any client)
X-KM-RRULE-FROM:COMPLETED             # km custom property (round-trips)
```

The `FROM` parameter is stripped from the RRULE on export (non-standard) and preserved in `X-KM-RRULE-FROM`. CalDAV clients see a valid RRULE; km restores the anchoring on reimport.

---

## Assignee

| Property | `assigned_to` |
| --- | --- |
| Type | string (slug) |
| Markdown | First `@slug` in content |
| Import | Asana `assignee.name` → slugified |

### Cross-System Mapping

| km | Asana | VTODO | Linear | Jira |
| --- | --- | --- | --- | --- |
| `assigned_to` | `assignee.name` | `ATTENDEE` | `assignee` | Assignee |

---

## Tags / Labels

Tags are inline in content as `#tag-name`. Not a first-class KNode field — stored in content for markdown fidelity.

| km | Asana | VTODO | Linear | GitHub |
| --- | --- | --- | --- | --- |
| `#tag` in content | `tags[].name` | `CATEGORIES` | Labels | Labels |

---

## Implementation Files

| File | Purpose |
| --- | --- |
| `packages/km-core/src/types.ts` | KNode interface, TaskStatus, TaskMarker |
| `packages/km-core/src/task-metadata.ts` | Parse/stringify task metadata (all formats) |
| `packages/km-markdown/src/nodes2md.ts` | Serialize tasks to markdown |
| `packages/km-storage/src/recurrence.ts` | RRULE parsing, next occurrence |
| `apps/km-cli/src/import/adapters/asana/task-transform.ts` | Asana → km field mapping |
| `apps/km-tui/src/board/board-actions.ts` | Priority cycle + direct set |
| `packages/km-commands/src/commands/task.ts` | Priority commands (set_priority, set_priority_0-4) |
| `packages/km-commands/src/keybindings.ts` | t-prefix chord bindings |
