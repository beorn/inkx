# Query Language

Unified query syntax for selecting nodes in km.

---

## Overview

Node queries are space-separated terms that filter nodes. Used by:

- `km task` — filter task list
- `km @board add` — add matching nodes to board
- Automation rules — `match:` conditions

All terms are AND-ed together (intersection).

---

## Term Types

| Pattern     | Name      | Description                          |
| ----------- | --------- | ------------------------------------ |
| `@ref`      | Reference | Node has this reference (contains)   |
| `#tag`      | Reference | Node has this tag (contains)         |
| `+proj`     | Reference | Node has this project ref (contains) |
| `./path`    | Path      | Node is under this relative path     |
| `/path`     | Path      | Node is under this absolute path     |
| `path/`     | Path      | Node path contains this string       |
| `key:value` | Field     | Field matches value                  |
| `-TERM`     | Negation  | Exclude nodes matching TERM          |
| `"text"`    | Search    | Full-text search                     |

---

## Modifiers

| Suffix | Effect                            |
| ------ | --------------------------------- |
| `$`    | Exact match (default is contains) |
| `**`   | Recursive (for paths)             |
| `*`    | Wildcard (for values)             |

---

## Reference Terms

Match nodes by their references:

```bash
@bjorn              # Has reference containing "bjorn"
@bjorn$             # Has exactly @bjorn reference
+website            # Has +website project ref
#urgent             # Has #urgent tag
-@bjorn             # Does NOT have @bjorn reference
@*                  # Has any @ reference
```

---

## Path Terms

Match nodes by location:

```bash
./inbox             # Under ./inbox (relative to cwd, recursive)
./inbox/*           # Direct children of ./inbox only
./inbox/**          # Under ./inbox, recursive (same as ./inbox)
/projects/web       # Under /projects/web (absolute)
projects/           # Path contains "projects/"
projects/**         # Contains "projects/", recursive
./tasks/budget$     # Exactly this path
```

---

## Field Terms

Match field values with `key:value`:

| Field      | Values                              | Example           |
| ---------- | ----------------------------------- | ----------------- |
| `status`   | todo, wip, blocked, done, dropped   | `status:todo`     |
| `due`      | today, past, week, none, YYYY-MM-DD | `due:past`        |
| `start`    | past, today, YYYY-MM-DD             | `start:past`      |
| `assigned` | name                                | `assigned:bjorn$` |
| `priority` | P0-P4                               | `priority:P1`     |

### Date Values

| Value           | Meaning                 |
| --------------- | ----------------------- |
| `today`         | Due/start date is today |
| `past`          | Date is before today    |
| `week`          | Within next 7 days      |
| `none`          | Field is not set        |
| `YYYY-MM-DD`    | Specific date           |
| `older_than_Nd` | More than N days ago    |

---

## Property Terms

Match inline properties using `prop::value` syntax (double colon):

| Pattern        | Description                    | Example            |
| -------------- | ------------------------------ | ------------------ |
| `prop::*`      | Property exists                | `rating::*`        |
| `prop::value`  | Property equals value          | `author::alice`    |
| `prop::N`      | Property equals number         | `rating::5`        |
| `prop::>N`     | Property greater than          | `rating::>3`       |
| `prop::<N`     | Property less than             | `priority::<5`     |
| `prop::>=N`    | Property greater than or equal | `rating::>=4`      |
| `prop::<=N`    | Property less than or equal    | `rating::<=2`      |
| `-prop::*`     | Property does not exist        | `-blocked-by::*`   |
| `-prop::value` | Property does not equal value  | `-status::blocked` |

### Special: Blocked Query

| Pattern         | Description                                    |
| --------------- | ---------------------------------------------- |
| `blocked:true`  | Has `blocked-by::` with unresolved blockers    |
| `blocked:false` | No `blocked-by::` or all blockers done/dropped |

```bash
# Find tasks ready to work on
status:todo blocked:false

# Find tasks waiting on dependencies
blocked:true

# Find highly-rated items
rating::>=4

# Find tasks blocking a specific issue
blocks::km-auth
```

---

## Negation

Prefix any term with `-` to exclude:

```bash
-@bjorn             # Not assigned to bjorn
-status:done        # Not done
-./archive/         # Not in archive
```

---

## Combining Terms

Terms are AND-ed (all must match):

```bash
status:todo due:week              # Open AND due this week
+website status:todo              # Has +website AND is open
./inbox/** -status:done           # In inbox AND not done
@bjorn$ status:todo priority:P1   # Exactly bjorn, open, priority P1
```

---

## Examples

```bash
# Find unorganized tasks
status:todo -@next -@someday

# Find project tasks not scheduled
+website status:todo due:none

# Find blocked items
status:blocked

# Find tasks in inbox folder
./inbox/**

# Find tasks mentioning budget
"budget"

# All person references except system boards
@* -@next -@someday
```

---

## SQL Translation

| Query          | SQL                                                                      |
| -------------- | ------------------------------------------------------------------------ |
| `status:todo`  | `WHERE status = 'todo'`                                                  |
| `@bjorn`       | `WHERE id IN (SELECT node_id FROM refs WHERE ref LIKE '%bjorn%')`        |
| `@bjorn$`      | `WHERE id IN (SELECT node_id FROM refs WHERE ref = '@bjorn')`            |
| `-status:done` | `WHERE status != 'done' OR status IS NULL`                               |
| `./inbox/**`   | `WHERE path LIKE './inbox/%'`                                            |
| `"budget"`     | `WHERE id IN (SELECT rowid FROM nodes_fts WHERE content MATCH 'budget')` |
| `due:past`     | `WHERE due < date('now')`                                                |
| `due:week`     | `WHERE due BETWEEN date('now') AND date('now', '+7 days')`               |

---

## Automation Usage

In automation rules, queries appear in `match:`, `was:`, and `now:` fields:

```yaml
- name: surface-overdue
  trigger: due.passed
  match: "status:todo"
  actions:
    - board.add: "@next"

- name: inbox-processed
  trigger: field.changed
  field: path
  was: "./inbox/**"
  now: "-./inbox/**"
  # No action needed: @next/inbox column uses km.add:: ./inbox/*
  # which auto-populates from the inbox/ folder. When a file
  # leaves inbox/, it naturally drops out of the column query.
```

---

## See Also

- [storage.md](storage.md) — SQLite schema
- [guides/tasks.md](guides/tasks.md) — Task management, GTD workflow
