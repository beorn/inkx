# KM CLI - Happy Path Tests

End-to-end tests for the km (Knowledge Machine) CLI.

## Setup

```console
$ beforeAll() {
>   # Set up km function to run from source tree
>   km() { bun run "$ROOT/apps/km-cli/src/index.ts" "$@"; }
>   export -f km
>   # Create a test vault with GTD structure in temp dir
>   km init . >/dev/null
> }
```

## Basic Commands

### km --help

```console
$ km --help
Usage: km [options] [command]
[...]
```

### km sync

Sync filesystem to database:

```console
$ km sync
Syncing: ...
Syncing filesystem → database...
✓ Processed 5 change(s)
```

### km list

List all nodes in the vault:

```console
$ km ls
# Someday/Maybe
[...]
# Inbox
[...]
16 node(s)
```

## Task Management

### km new - Create a task

Create a task and sync to see it:

```console
$ km new "Test task from mdtest"
✓ Added to inbox: Test task from mdtest
```

```console
$ km sync
Syncing: ...
Syncing filesystem → database...
✓ Processed 2 change(s)
```

### km task - List tasks

```console
$ km task
inbox / .md
 [ ] Test task from mdtest

1 task(s)
```

### km task with query

```console
$ km task status:open
inbox / .md
 [ ] Test task from mdtest

1 task(s)
```

### km done - Complete a task

Get a task and mark it done:

```console
$ TASK_ID=$(km task --json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
$ km done "$TASK_ID"
✓ Marked done: Test task from mdtest
```

## Tree View

### km tree

Show node hierarchy (IDs hidden by default):

```console
$ km tree
├── 📁 inbox
│   └── 📄 inbox.md
│       └── ✓ [x] Test task from mdtest
├── 📁 archive
├── 📄 @inbox.md
[...]
└── 📄 @someday.md
[...]
```

## Search

### km search

Full-text search (IDs hidden by default):

```console
$ km search "inbox"
[...]
3 result(s)
```

## Node Resolution

### Resolve by filename

Commands accept filenames like `@inbox`:

```console
$ km show @inbox
ID: ...
Type: file
Path: .../@inbox.md
Created: ...
Updated: ...
```

### Resolve by path

Commands accept relative paths:

```console
$ km show ./@inbox.md
ID: ...
Type: file
Path: .../@inbox.md
Created: ...
Updated: ...
```

## Init Command

### km init in new directory

```console
$ mkdir -p /tmp/km-mdtest-init
$ cd /tmp/km-mdtest-init && km init .
Initialized km in ...
  Created: .../.km/
  Created: inbox/
  Created: archive/
  Created: @inbox.md
  Created: @next.md
  Created: @someday.md

Next steps:
  km sync    # Scan and import .md files
  km tasks   # List tasks
  km board   # Open kanban board
```

```console
$ ls /tmp/km-mdtest-init/.km
events.jsonl
```

```console
$ rm -rf /tmp/km-mdtest-init
```

## Error Handling

### Invalid node ID

```console
$ km show nonexistent-id-12345 2>&1
Node not found: nonexistent-id-12345
[1]
```
