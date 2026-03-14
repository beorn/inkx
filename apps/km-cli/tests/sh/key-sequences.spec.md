---
mdspec:
  plugin: ../km-repl.ts
  fixture: path-navigation
  memory: true
---

# km sh - Key Sequence Tests

Tests for quoted key sequences and special key handling.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Quoted Key Sequences

### Double-quoted key sequence sends multiple keys

Move down twice using "jj" (j moves between top-level nodes):

```console
$ km sh board.md -c '"jj"; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

### Single-quoted key sequence works too

Move down twice then back up with 'jjk':

```console
$ km sh board.md -c "'jjk'; state"
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### Multiple keys then jump to top

Move down twice then jump to top with "jjg":

```console
$ km sh board.md -c '"jjg"; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### key command with quoted sequence

The key command also accepts quoted sequences:

```console
$ km sh board.md -c 'key "jjk"; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

## Special Key Names

### key enter navigates to parent section

```console
$ km sh board.md -c 'key enter; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### key esc clears selection

```console
$ km sh board.md -c 'A; key esc; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### key backspace at initial state stays at same position

```console
$ km sh board.md -c 'key backspace; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### key tab is unsupported (unknown)

```console
$ km sh board.md -c 'key tab'
error: Unknown key: Tab
```

### key space is unsupported (unknown)

```console
$ km sh board.md -c 'key space'
error: Unknown key:
```

## Error Cases

### Empty quoted string is rejected

```console
$ km sh board.md -c '""'
error: Invalid key sequence: ""
```

### Unmatched quotes fail

```console
$ km sh board.md -c '"jj'
error: Unknown command: "jj
```

### Unknown key shows error

```console
$ km sh board.md -c 'key X'
error: Unknown key: X
```
