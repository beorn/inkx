---
mdtest:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true
---

# km sh - History Navigation Tests

Tests for history back/forward navigation using `[` and `]` keys.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
```

## History Commands

### nav_back at start does nothing

At initial cursor [0] on Tasks section, nav_back has no effect.

```console
$ km sh board.md -c 'nav_back; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### nav_forward at start does nothing

```console
$ km sh board.md -c 'nav_forward; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### [ key is same as nav_back

```console
$ km sh board.md -c '[; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### ] key is same as nav_forward

```console
$ km sh board.md -c ']; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

## Parent Navigation

### u goes up to parent

Enter into Tasks, then u goes back up to Tasks section level.

```console
$ km sh board.md -c 'key enter; u; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### h at depth goes to parent

```console
$ km sh board.md -c 'key enter; h; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### cursor_out command

```console
$ km sh board.md -c 'key enter; cursor_out; state'
cursor: [0]
node: Task A
topLevel: 2 nodes
```

### cursor_in command

```console
$ km sh board.md -c 'cursor_in; state'
cursor: [0,0]
node: Tasks
topLevel: 2 nodes
```
