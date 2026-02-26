# Recurrence

km's recurrence model, cross-system comparison, and import mapping.

---

## km Data Model

### Fields

| Field        | Type     | Storage     | Example                                |
| ------------ | -------- | ----------- | -------------------------------------- |
| `rrule`      | `string` | RRULE + ext | `FREQ=WEEKLY;BYDAY=MO`                |
| `recur_prev` | `string` | Node ID     | `abc123`                               |

The `rrule` field stores an iCal RRULE string (RFC 5545) with one km extension:
the `FROM` parameter, which controls what date the next occurrence is calculated
from.

### FROM Parameter

| Value | Meaning | Default? |
| --- | --- | --- |
| `FROM=COMPLETED` | Next due = formula applied to `completed_at` | **Yes** (omitted) |
| `FROM=DUE` | Next due = formula applied to `due_at` | Must be explicit |

**Default is `FROM=COMPLETED`** because that's what people intuitively mean for
tasks. "Every 2 weeks" means "2 weeks after I finish," not "2 weeks after it
was due" (which can accumulate overdue instances).

`FROM=DUE` is only needed for calendar-anchored patterns where the date has
meaning independent of completion — rent on the 1st, standup every Monday.

```
FREQ=DAILY;INTERVAL=14                  # every 14 days from completion (default)
FREQ=WEEKLY;BYDAY=MO;FROM=DUE           # every Monday, anchored to due date
FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE      # 1st of every month, anchored to due date
FREQ=YEARLY;FROM=DUE                    # yearly, anchored to due date
```

### Why FROM=COMPLETED is the Default

In a clone-on-complete task manager, the recurrence rule is a **next-date
formula** — not a series generator. There's only ever one active instance.

If a task with `FREQ=DAILY;INTERVAL=14;FROM=DUE` is 3 weeks overdue:
- Due: Jan 1 → complete Jan 22 → next due: Jan 15 (past!) or Jan 29 (skip ahead?)
- Either way, the gap is wrong — 7 days instead of 14

With `FROM=COMPLETED` (default):
- Due: Jan 1 → complete Jan 22 → next due: Feb 5 (14 days from completion)
- Always the right interval

Calendar events use `FROM=DUE` because the series exists independently of
attendance. Tasks don't — the next instance only appears on completion.

### Markdown Syntax

```markdown
- [ ] Clean fridge recur:: every 2 weeks
- [ ] Water plants recur:: FREQ=DAILY;INTERVAL=7
- [ ] Pay rent recur:: FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE
- [ ] Team standup recur:: every weekday on schedule
```

The `recur::` shorthand is parsed into an RRULE string:
- `FREQ=...` → stored as-is
- Natural language → converted via `naturalToRRule()`
- `on schedule` / `on due` suffix → appends `FROM=DUE`

### Clone-on-Complete

When a recurring task is marked done:

1. Current task → status `done`, `completed_at` set
2. New task cloned with next due date
3. New task's `recur_prev` → points to completed task
4. RRULE carried to new task

```
Task A (recur:: FREQ=WEEKLY)
├── [x] done 2026-01-06  ← recur_prev chain
├── [x] done 2026-01-13
└── [ ] due 2026-01-20   ← current (active)
```

**Next due date calculation:**
- `FROM=COMPLETED` (default): `getNextOccurrence(rrule, task.completed_at)`
- `FROM=DUE`: `getNextOccurrence(rrule, task.due_at)`

The `recur_prev` chain provides full history. Each instance is a real node
with its own notes, comments, and attachments — unlike calendar events where
instances share the master's description.

### Supported RRULE Patterns

```
FREQ=DAILY                          # Every day (from completion)
FREQ=DAILY;INTERVAL=3               # Every 3 days (from completion)
FREQ=WEEKLY                         # Every week (from completion)
FREQ=WEEKLY;BYDAY=MO,WE,FR          # Mon/Wed/Fri (from completion)
FREQ=WEEKLY;INTERVAL=2;BYDAY=MO     # Every 2 weeks on Monday (from completion)
FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE  # 1st of every month (from due date)
FREQ=MONTHLY;INTERVAL=3;FROM=DUE    # Every 3 months (from due date)
FREQ=YEARLY;FROM=DUE                # Every year (from due date)
```

### Natural Language

| Input                     | RRULE                                     |
| ------------------------- | ----------------------------------------- |
| `daily`                   | `FREQ=DAILY`                              |
| `weekly`                  | `FREQ=WEEKLY`                             |
| `weekdays`                | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`       |
| `monthly`                 | `FREQ=MONTHLY`                            |
| `yearly`                  | `FREQ=YEARLY`                             |
| `every 2 weeks`           | `FREQ=WEEKLY;INTERVAL=2`                  |
| `every monday`            | `FREQ=WEEKLY;BYDAY=MO`                    |
| `every 2 weeks on schedule` | `FREQ=WEEKLY;INTERVAL=2;FROM=DUE`       |
| `every weekday on schedule` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;FROM=DUE` |

All rules default to `FROM=COMPLETED`. Add `on schedule` (or `on due`) to
set `FROM=DUE`.

---

## FROM=COMPLETED vs FROM=DUE

### The Problem with FROM=DUE for Tasks

iCal RRULE was designed for calendar events where the series exists
independently — "every Monday at 9am" generates Mondays whether you attend or
not. For tasks, this creates problems:

- "Clean fridge every 2 weeks" — if you do it late, the next one should be
  2 weeks from when you actually did it, not 2 weeks from when it was due
- Due-date anchoring can accumulate overdue instances or produce wrong gaps

### No Standard for Task Anchoring

RFC 5545 defines RRULE on VTODOs but says **nothing** about what happens on
completion. Every system invents its own approach:

| System          | Completion anchoring                        | Notes                          |
| --------------- | ------------------------------------------- | ------------------------------ |
| **Todoist**     | `every!` prefix = from completion            | `every! 2 weeks`               |
| **Obsidian**    | `when done` suffix = from completion         | `every week when done`         |
| **Things**      | "After Completion" toggle in UI              | —                              |
| **OmniFocus**   | "Defer Another" / "Due Again" toggles        | —                              |
| **TickTick**    | "By Completion Date" dropdown                | —                              |
| **Asana**       | `periodically` type = from completion (max 30d) | All other types from due    |
| **Reminders**   | Wanted "after completion" — dropped CalDAV   | Proprietary backend now        |
| **km**          | `FROM=COMPLETED` (default) / `FROM=DUE`     | RRULE parameter                |

### When to Use Each

**`FROM=COMPLETED` (default)** — most tasks:
```markdown
- [ ] Clean fridge recur:: every 2 weeks
- [ ] Review investments recur:: every 30 days
- [ ] Water plants recur:: every week
```

**`FROM=DUE`** — calendar-anchored deadlines:
```markdown
- [ ] Pay rent recur:: FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE
- [ ] Team standup recur:: every weekday on schedule
- [ ] Quarterly review recur:: FREQ=MONTHLY;INTERVAL=3;FROM=DUE
```

---

## Cross-System Comparison

### Recurrence Models

| Model                      | How It Works                                  | Used By                                  |
| -------------------------- | --------------------------------------------- | ---------------------------------------- |
| **Clone-on-complete**      | Each completion creates new task               | km, Todoist, Things, OmniFocus, Asana    |
| **Template + virtual**     | One template, instances generated on demand    | Google Calendar, Apple Calendar           |
| **Hybrid**                 | Template + materialized exceptions             | Outlook, Google Calendar (events)        |
| **Parent-child series**    | Series node with child instances               | Some project management tools            |

km uses **clone-on-complete** because:
- Each instance is a real node with full history
- Natural fit for the markdown file model (each instance is a line)
- No virtual instance complexity
- `recur_prev` chain provides audit trail

### Recurrence Rule Formats

| System          | Format                   | Standard?  | Example                              |
| --------------- | ------------------------ | ---------- | ------------------------------------ |
| **iCal**        | RRULE (RFC 5545)         | Yes        | `FREQ=WEEKLY;BYDAY=MO`              |
| **km**          | RRULE + `FROM` param     | RRULE part | `FREQ=WEEKLY;BYDAY=MO;FROM=DUE`     |
| **Todoist**     | Natural language          | No         | `every monday`, `every! 2 weeks`     |
| **Obsidian**    | Natural + `when done`    | No         | `every week`, `every week when done` |
| **Asana**       | JSON object              | No         | `{"type":"weekly","data":{...}}`     |
| **Google Tasks** | RRULE                   | Yes        | `FREQ=WEEKLY;BYDAY=MO`              |
| **Org-mode**    | Timestamps               | No         | `<2026-01-20 Mon +1w>`              |

### Asana Recurrence Object

Asana uses an undocumented JSON recurrence object (not officially in their API
docs, but accessible via `opt_fields=recurrence` since ~Oct 2024):

```json
{"type": "weekly",       "data": {"days_of_week": [1], "frequency": 2}}
{"type": "monthly",      "data": {"date": 1, "frequency": 1}}
{"type": "daily",        "data": {"frequency": 1}}
{"type": "yearly",       "data": {"frequency": 1}}
{"type": "periodically", "data": {"frequency": 14}}
```

**Asana recurrence types:**

| Type           | `data` fields                        | Notes                        |
| -------------- | ------------------------------------ | ---------------------------- |
| `daily`        | `frequency`                          | Every N days                 |
| `weekly`       | `days_of_week[]`, `frequency`        | Days: 1=Mon … 7=Sun         |
| `monthly`      | `date` or `days_of_month[]`, `freq`  | Day of month                 |
| `yearly`       | `frequency`                          | Every N years                |
| `periodically` | `frequency`                          | N days after completion      |

**Limitations**: `periodically` only supports 1–30 days. No weekly/monthly
after-completion option exists in Asana.

---

## Asana → km Mapping

See also: [Asana Import README](../../apps/km-cli/src/import/adapters/asana/README.md)

### Fixed-Schedule Types

Asana's fixed-schedule types map to RRULE with `FROM=DUE` since Asana anchors
these to the due date:

| Asana                                                       | km RRULE                                              |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `{type:"daily", data:{frequency:1}}`                        | `FREQ=DAILY;FROM=DUE`                                 |
| `{type:"daily", data:{frequency:3}}`                        | `FREQ=DAILY;INTERVAL=3;FROM=DUE`                      |
| `{type:"weekly", data:{days_of_week:[1],frequency:1}}`      | `FREQ=WEEKLY;BYDAY=MO;FROM=DUE`                       |
| `{type:"weekly", data:{days_of_week:[1,3,5],frequency:2}}`  | `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;FROM=DUE`     |
| `{type:"monthly", data:{date:15,frequency:1}}`              | `FREQ=MONTHLY;BYMONTHDAY=15;FROM=DUE`                 |
| `{type:"monthly", data:{date:1,frequency:3}}`               | `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1;FROM=DUE`      |
| `{type:"yearly", data:{frequency:1}}`                       | `FREQ=YEARLY;FROM=DUE`                                |

### Completion-Based Type

Asana's `periodically` type maps directly — `FROM=COMPLETED` is the default:

| Asana                                          | km RRULE                     |
| ---------------------------------------------- | ---------------------------- |
| `{type:"periodically", data:{frequency:1}}`    | `FREQ=DAILY`                 |
| `{type:"periodically", data:{frequency:14}}`   | `FREQ=DAILY;INTERVAL=14`    |
| `{type:"periodically", data:{frequency:30}}`   | `FREQ=DAILY;INTERVAL=30`    |

### Day-of-Week Mapping

| Asana `days_of_week` | iCal `BYDAY` |
| -------------------- | ------------ |
| 1                    | MO           |
| 2                    | TU           |
| 3                    | WE           |
| 4                    | TH           |
| 5                    | FR           |
| 6                    | SA           |
| 7                    | SU           |

---

## External Sync & Interoperability

### RRULE Syncs; FROM Parameter Doesn't

The RRULE portion of km's recurrence maps 1:1 to iCal RRULE and survives
round-trip through CalDAV, Google Calendar, and any standards-compliant system.

The `FROM` parameter is a km extension. When syncing:

- `FREQ=WEEKLY;BYDAY=MO;FROM=DUE` → exported as `RRULE:FREQ=WEEKLY;BYDAY=MO`
  (standard, works everywhere)
- `FREQ=DAILY;INTERVAL=14` (implicit `FROM=COMPLETED`) → exported as
  `RRULE:FREQ=DAILY;INTERVAL=14` (standard RRULE, but other clients will
  anchor to due date instead of completion date — acceptable degradation)

The RRULE always syncs. The anchoring behavior degrades gracefully — non-km
clients will use due-date anchoring, which is correct for `FROM=DUE` rules
and "close enough" for `FROM=COMPLETED` rules.

### Guidance

All recurrence rules sync as standard RRULE. The only question is whether the
anchoring behavior is preserved:

```markdown
- [ ] Pay rent recur:: FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE    # perfect sync ✓
- [ ] Team standup recur:: every weekday on schedule           # perfect sync ✓
- [ ] Clean fridge recur:: every 2 weeks                       # RRULE syncs, anchor degrades ✓
```

### VTODO Mapping (CalDAV Sync)

iCalendar `VTODO` (RFC 5545) is the natural sync target for km tasks. The
field mapping is nearly 1:1:

| km field | VTODO property | Notes |
| --- | --- | --- |
| `content` (title) | `SUMMARY` | |
| `task_status` | `STATUS` | See status mapping below |
| `due_at` | `DUE` | Date or datetime |
| `start_at` | `DTSTART` | |
| `completed_at` | `COMPLETED` | Timestamp |
| `priority` (1-5) | `PRIORITY` (1-9) | Needs range mapping |
| `rrule` | `RRULE` | `FROM` param stripped on export, restored on import |
| `recur_prev` | `RELATED-TO;RELTYPE=SIBLING` | Instance chain (see below) |
| body | `DESCRIPTION` | Plain text |
| `id` | `UID` | |

**Status mapping:**

| km | VTODO `STATUS` | Notes |
| --- | --- | --- |
| `todo` | `NEEDS-ACTION` | |
| `wip` | `IN-PROCESS` | |
| `blocked` | `IN-PROCESS` | No VTODO equivalent; use `X-KM-STATUS:blocked` |
| `done` | `COMPLETED` | Also sets `COMPLETED` timestamp and `PERCENT-COMPLETE:100` |
| `dropped` | `CANCELLED` | |

**Priority mapping:**

| km (1-5, 1=highest) | VTODO (1-9, 1=highest) |
| --- | --- |
| 1 | 1 |
| 2 | 3 |
| 3 | 5 |
| 4 | 7 |
| 5 | 9 |

**Recurrence export:**

km exports RRULE to VTODO, stripping the `FROM` parameter (non-standard) and
preserving it in a custom property:

```
BEGIN:VTODO
UID:clean-fridge-003@km
SUMMARY:Clean fridge
STATUS:NEEDS-ACTION
DUE:20260215
RRULE:FREQ=DAILY;INTERVAL=14
X-KM-RRULE-FROM:COMPLETED
RELATED-TO;RELTYPE=SIBLING:clean-fridge-002@km
END:VTODO
```

- `RRULE` contains standard RRULE only (parseable by any client)
- `X-KM-RRULE-FROM` preserves the km anchoring (round-trips through km;
  ignored by other clients)
- On import: if `X-KM-RRULE-FROM` is present, restore it; otherwise assume
  `FROM=DUE` (standard CalDAV behavior)

**Recurrence anchor — the spec doesn't say:**

RFC 5545 defines RRULE on VTODOs but says **nothing** about what happens when
a recurring VTODO is completed. Every client invents its own behavior:

| Client | On completion | Anchoring |
| --- | --- | --- |
| **Thunderbird** | Creates second VTODO with same UID + `RECURRENCE-ID` | Due date |
| **Tasks.org** | Modifies existing VTODO's `DUE`/`DTSTART` in place | Due date (skips to future) |
| **eM Client** | Creates second VTODO, strips `RRULE` from completed one | Due date |
| **Apple Reminders** | Dropped CalDAV entirely (iOS 13) — partly because CalDAV couldn't express "repeat from completion date" | N/A |

**Instance chain (`recur_prev`):**

RFC 5545's `RELATED-TO` supports `RELTYPE=PARENT|CHILD|SIBLING`. km's
`recur_prev` maps to `RELTYPE=SIBLING` — linking completed instances as
siblings in a chain.

```
# Active instance
BEGIN:VTODO
UID:clean-fridge-003@km
SUMMARY:Clean fridge
STATUS:NEEDS-ACTION
DUE:20260215
RRULE:FREQ=DAILY;INTERVAL=14
X-KM-RRULE-FROM:COMPLETED
RELATED-TO;RELTYPE=SIBLING:clean-fridge-002@km
END:VTODO

# Previous (completed) instance
BEGIN:VTODO
UID:clean-fridge-002@km
SUMMARY:Clean fridge
STATUS:COMPLETED
COMPLETED:20260201T143000Z
RELATED-TO;RELTYPE=SIBLING:clean-fridge-001@km
END:VTODO
```

---

## Implementation

### Key Files

| File                                              | Purpose                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `packages/km-core/src/types.ts`                   | `KNode.rrule` and `KNode.recur_prev`            |
| `packages/km-storage/src/recurrence.ts`           | `getNextOccurrence()`, `naturalToRRule()`        |
| `packages/km-storage/tests/recurrence.test.ts`    | Recurrence utility tests                         |
| `apps/km-cli/src/import/adapters/asana/task-transform.ts` | Asana → ImportItem conversion            |
| `apps/km-cli/src/import/types.ts`                 | `ImportItem.rrule`                               |

### TODO

- [ ] Rename `recurrence` field to `rrule` across codebase
- [ ] Add `FROM` parameter parsing to `getNextOccurrence()`
- [ ] Default to `FROM=COMPLETED` (use `completed_at`) unless `FROM=DUE`
- [ ] Add `on schedule` / `on due` parsing to `naturalToRRule()`
- [ ] Update markdown parser/serializer for `recur::` shorthand
- [ ] Update Asana importer to emit `FROM=DUE` for fixed-schedule types
- [ ] Re-import Asana data to capture recurrence fields

---

## See Also

- [docs/guides/tasks.md](../guides/tasks.md) — Task management guide
- [docs/ref/prior-art.md](../ref/prior-art.md) — Prior art and design choices
- [Asana Import README](../../apps/km-cli/src/import/adapters/asana/README.md) — Full Asana field mapping
