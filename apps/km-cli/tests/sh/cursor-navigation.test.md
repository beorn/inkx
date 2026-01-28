---
mdtest:
  plugin: ../km-repl.ts
  fixture: path-navigation
  memory: true
---

# km sh - Cursor Navigation Tests

Tests for cursor movement commands (j/k/g/G) using `km sh`.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Basic Navigation (j/k)

Initial state shows cursor at first top-level section.

```console
$ km sh board.md -c 'state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

j moves to next sibling.

```console
$ km sh board.md -c 'j; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

k moves to previous sibling.

```console
$ km sh board.md -c 'j; k; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### Boundary: k at top stays at top

```console
$ km sh board.md -c 'k; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### Boundary: j at bottom stays at bottom

```console
$ km sh board.md -c 'j; j; j; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

## Jump Commands (g/G)

g jumps to top from any position.

```console
$ km sh board.md -c 'j; g; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

G jumps to bottom.

```console
$ km sh board.md -c 'G; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

## Nested Navigation

Enter a section first, then navigate within it.

```console
$ km sh board.md -c 'l; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

j/k work within a section.

```console
$ km sh board.md -c 'l; j; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'l; j; k; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

g/G work within a section.

```console
$ km sh board.md -c 'l; G; state'
cursor: [0,2]
node: Task A3
topLevel: 2 nodes
```

```console
$ km sh board.md -c 'l; G; g; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

## Shell Commands

### help shows available commands

```console
$ km sh board.md -c 'help'
km-sh commands:
[...]
```

## Error Handling

Unknown command shows error.

```console
$ km sh board.md -c 'unknown_command'
error: Unknown command: unknown_command
```

State is preserved after error.

```console
$ km sh board.md -c 'state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```
