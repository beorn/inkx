---
mdtest:
  plugin: ../km-repl.ts
  fixture: path-navigation
  memory: true
---

# km sh - Path Navigation Tests

Tests for path-based navigation commands using `km sh`.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
```

## Path Navigation Tests

### Initial state

```console
$ km sh board.md -c 'state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### Navigate to top-level index

```console
$ km sh board.md -c 'nav_to_path 1; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

### Navigate to nested path (0,1)

```console
$ km sh board.md -c 'nav_to_path 0,1; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

### Navigate to nested path (1,0)

```console
$ km sh board.md -c 'nav_to_path 1,0; state'
cursor: [1,0]
node: Task B1
topLevel: 2 nodes
```

### Error: nav_to_path without argument

```console
$ km sh board.md -c 'nav_to_path'
error: nav_to_path requires a path argument
```

### Error: nav_to_path with non-numeric indices

```console
$ km sh board.md -c 'nav_to_path a,b,c'
error: nav_to_path requires comma-separated numeric indices
```

### select_position command (no-op if out of bounds)

```console
$ km sh board.md -c 'select_position 0,2; state'
cursor: [0,2]
node: Task A3
topLevel: 2 nodes
```

### cursor_next moves to next sibling

```console
$ km sh board.md -c 'cursor_next; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

### cursor_next then cursor_prev returns to start

```console
$ km sh board.md -c 'cursor_next; cursor_prev; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### h then cursor_in enters children

```console
$ km sh board.md -c 'h; cursor_in; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### Navigate to index 1 then cursor_in enters children

```console
$ km sh board.md -c 'nav_to_path 1; cursor_in; state'
cursor: [1,0]
node: Task B1
topLevel: 2 nodes
```

### cursor_out moves to parent

```console
$ km sh board.md -c 'cursor_out; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### h at top level stays at top level

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### h then l enters children

```console
$ km sh board.md -c 'h; l; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### h twice at top level stays at top level

```console
$ km sh board.md -c 'h; h; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### l enters children from initial position

```console
$ km sh board.md -c 'l; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### h then cursor_next moves to next sibling at top level

```console
$ km sh board.md -c 'h; cursor_next; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```
