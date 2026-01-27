---
mdtest:
  plugin: ../km-repl.ts
  fixture: two-columns
---

# km sh - Key Input Tests

Tests for TUI keyboard shortcuts using `km sh key` command.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Key Tests - Basic Navigation

Initial state shows cursor at first task, with 2 top-level nodes (first task from each column).

```console
$ km sh board.md -c 'state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

j/k navigate between top-level tasks.

```console
$ km sh board.md -c 'j; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'j; k; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

h at top level stays put (no parent to go to).

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

l drills into the node's context (parent section).

```console
$ km sh board.md -c 'l; state'
cursor: [0,0]
node: Tasks
topLevel: 2 nodes
```

u (zoom up) goes up a level.

```console
$ km sh board.md -c 'u; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

Backspace goes up (same as u).

```console
$ km sh board.md -c 'key backspace; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

## Key Tests - Cross Column Navigation

L (shift-L) moves to next column's first task.

```console
$ km sh board.md -c 'L; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
```

L then H returns to previous column.

```console
$ km sh board.md -c 'L; H; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

Named commands for cross-column navigation.

```console
$ km sh board.md -c 'nav_cross_column_right; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'L; nav_cross_column_left; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

H at leftmost column stays put.

```console
$ km sh board.md -c 'H; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

L at rightmost column stays put.

```console
$ km sh board.md -c 'L; L; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
```

## Empty Column Tests

```console fixture=empty-column reset=true
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

L into empty column shows the column header.

```console fixture=empty-column
$ km sh empty-col.md -c 'L; state'
cursor: [1]
node: Empty
topLevel: 2 nodes
```

## Jump, History, Select, View, and Move Tests

```console fixture=two-columns reset=true
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

g (jump to top) from any position.

```console
$ km sh board.md -c 'j; g; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

G (jump to bottom) goes to last item.

```console
$ km sh board.md -c 'G; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
```

nav_back and nav_forward for history navigation.

```console
$ km sh board.md -c 'nav_back; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'nav_forward; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

[ and ] for sibling navigation.

```console
$ km sh board.md -c 'key [; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'key ]; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

A selects all siblings.

```console
$ km sh board.md -c 'A; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
```

Escape clears selection.

```console
$ km sh board.md -c 'A; key esc; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

J extends selection down.

```console
$ km sh board.md -c 'J; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
selected: 2 nodes
```

K extends selection up.

```console
$ km sh board.md -c 'j; K; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
```

Named selection commands.

```console
$ km sh board.md -c 'extend_select_down; state'
cursor: [1]
node: Task D
topLevel: 2 nodes
selected: 2 nodes
```

```console
$ km sh board.md -c 'j; extend_select_up; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
```

z toggles fold (no-op on leaf nodes).

```console
$ km sh board.md -c 'z; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

Z unfolds all.

```console
$ km sh board.md -c 'z; Z; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

< and > for view width adjustment.

```console
$ km sh board.md -c '<; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c '<; >; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

- and - for zoom level adjustment.

```console
$ km sh board.md -c '+; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c '+; -; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

m enters move mode.

```console
$ km sh board.md -c 'm; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

Named move mode commands.

```console
$ km sh board.md -c 'enter_move_mode; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'enter_move_mode; cancel_move; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

## Error Handling

Unknown key generates an error.

```console
$ km sh board.md -c 'key Q'
error: Unknown key: Q
```
