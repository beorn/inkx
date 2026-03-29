# Tree Globs

Tree globs select nodes in the km tree using zsh-style path patterns with qualifiers. Same syntax everywhere: `km.add::` rules, CLI commands, search, view filters.

## Path Patterns

```
./inbox             recursive (all descendants)
./inbox/*           direct children only
./inbox/**          recursive (explicit, same as bare)
./projects/web/**   nested path, recursive
```

## Qualifiers

Append `(...)` after the glob to filter by node properties.

```
./inbox/**(.)       files only
./inbox/**(/)       folders only
./inbox/**(./)      files or folders (not sections)
./inbox/**(pw)      overdue OR due this week
./inbox/**(.pw)     files AND (overdue OR this week)
```

### Rules

- **Within a dimension**: qualifiers OR together. `(./)` = files or folders.
- **Across dimensions**: qualifiers AND together. `(.p)` = files AND past-due.
- **Negation**: `^` negates the next qualifier. `(^.)` = not files.

### Qualifier Reference

#### Filesystem type

| Char | Matches | fstype values |
|------|---------|---------------|
| `.` | files (md + non-md) | `file`, `mdfile` |
| `/` | folders | `folder` |

No section qualifier — bare globs match everything including sections. Use `(.)` to get files only.

#### Node type

| Char | Matches |
|------|---------|
| `i` | outline items (headings) |
| `l` | list items |

#### Task

| Char | Matches | Equivalent query |
|------|---------|------------------|
| `t` | any task (has task marker) | `task_marker IS NOT NULL` |
| `p` | past due (overdue, not done) | `due:past -status:done` |
| `w` | due this week (includes today, not done) | `due:week -status:done` |
| `d` | has any due date | `due_at IS NOT NULL` |
| `s` | started (start date passed, not done) | `start:past -status:done` |
| `x` | done or dropped | `status:done,dropped` |

Task date qualifiers (`p`, `w`, `s`) implicitly exclude done/dropped tasks.

#### Content type (reserved, not yet implemented)

| Char | Will match |
|------|-----------|
| `n` | notes |
| `c` | contacts |
| `e` | calendar events |
| `m` | messages/mail |

### Sigils — Use Path Patterns

For `@mentions`, `#tags`, and `+projects`, use path glob patterns instead of qualifiers:

```
./**/@*             @ nodes (people/owners)
./**/#*             # nodes (tags)
./**/+*             + nodes (projects)
```

## Examples

### Board rules (`km.add::`)

```markdown
## Inbox km.add:: ./inbox/**(.) km.add:: ./**(pw) km.add:: ./**(s)
```

Three rules:
1. All files in inbox (recursive)
2. Overdue or due this week tasks (anywhere)
3. Started tasks (anywhere)

### CLI

```bash
km tasks ./**(p)              # overdue tasks
km tasks ./projects/**(w)     # due this week in projects/
km list ./inbox/**(.)         # files in inbox
```

### Common patterns

| Pattern | Meaning |
|---------|---------|
| `./inbox/**(.)` | all files in inbox |
| `./**(t)` | all tasks |
| `./**(pw)` | overdue or due this week |
| `./**(pws)` | overdue, this week, or started |
| `./archive/**(x)` | done tasks in archive |
| `./**(i.)` | outline items that are files |
| `./inbox/*(.)` | direct children of inbox, files only |

## Keyboard Chord Correspondence

The task qualifier letters match keyboard chords — same mnemonics everywhere:

| Qualifier | Board chord | Action |
|-----------|------------|--------|
| `p` | `t p` | set/view past due |
| `w` | `t w` | set/view this week |
| `d` | `t d` | set/view due date |
| `s` | `t s` | set/view started |
| `x` | `t x` | view done |

Additional chords (no glob equivalent):

| Chord | Action |
|-------|--------|
| `t .` | cycle task status |
| `t @` | set assignee |
| `t -` | clear task marker |
| `t 0-4` | set priority |
| `v x` | toggle done/not-done view |

## Implementation

`parseTreeGlob(pattern)` in `@km/core` parses the pattern into structured data:

```typescript
import { parseTreeGlob } from "@km/core"

parseTreeGlob("./inbox/**(.)")
// → {
//   path: "inbox",
//   recursive: true,
//   qualifiers: [{ type: "fstype", values: ["file", "mdfile"], negated: false }],
//   negated: false
// }
```

Consumers translate qualifiers to their context (SQL WHERE, filter functions, etc). The glob parser is pure — no database dependency.
