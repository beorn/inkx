---
mdtest:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true
---

# km sh - Mutation Tests

Tests for card mutation commands using `km sh`.

NOTE: The set_status command updates state.db but does NOT write to filesystem
in the current implementation (requires fsSync to be set up). Tests for
filesystem verification are commented out pending that integration.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## set_status command

### set_status changes task status to done

The cursor starts at the first top-level item (the first task).

```console
$ km sh board.md -c 'state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'set_status done; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### set_status requires valid status argument

```console
$ km sh board.md -c 'set_status invalid'
error: set_status requires a status: todo, wip, blocked, done, dropped
```

## delete command (not yet implemented)

### delete returns not implemented error

```console
$ km sh board.md -c 'delete'
error: delete command not yet implemented
```

## shift commands (not yet implemented)

### shift_up returns not implemented error

```console
$ km sh board.md -c 'shift_up'
error: shift_up/shift_down commands not yet implemented
```

### shift_down returns not implemented error

```console
$ km sh board.md -c 'shift_down'
error: shift_up/shift_down commands not yet implemented
```
