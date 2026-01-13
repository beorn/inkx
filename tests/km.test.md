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
[...]
```

### km list

List all nodes in the vault:

```console
$ km ls
[...]
```

## Task Management

### km new - Create a task

Create a task and sync to see it:

```console
$ km new "Test task from mdtest"
✓ Added to inbox: Test task from mdtest
[...]
```

```console
$ km sync
[...]
```

### km task - List tasks

```console
$ km task
[...]
 [ ] Test task from mdtest
[...]
```

### km task with query

```console
$ km task status:open
[...]
```

### km done - Complete a task

Get a task and mark it done:

```console
$ TASK_ID=$(km task --json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
$ km done "$TASK_ID"
✓ Marked done: ...
```

## Tree View

### km tree

Show node hierarchy:

```console
$ km tree
[...]
```

## Search

### km search

Full-text search:

```console
$ km search "inbox"
[...]
```

## Node Resolution

### Resolve by filename

Commands accept filenames like `@inbox`:

```console
$ km show @inbox
ID: ...
Type: file
Path: .../@inbox.md
[...]
```

### Resolve by path

Commands accept relative paths:

```console
$ km show ./@inbox.md
[...]
```

## Init Command

### km init in new directory

```console
$ mkdir -p /tmp/km-mdtest-init
$ cd /tmp/km-mdtest-init && km init .
Initialized km in ...
[...]
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
[...]
Node not found: nonexistent-id-12345
[1]
```
