---
mdspec:
  plugin: ../km-repl.ts
  fixture: path-navigation
  memory: true
---

# km sh - Selection Tests

Tests for TUI selection and multi-select commands using `km sh`.

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Navigation to Children

### Navigate into children then down

```console
$ km sh board.md -c 'key enter; j; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

### Navigate to first child then back to top

```console
$ km sh board.md -c 'key enter; j; g; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

## Multi-select Mode

### A selects all siblings at top level

```console
$ km sh board.md -c 'A; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
selected: 2 nodes
```

### A selects all siblings inside section

```console
$ km sh board.md -c 'key enter; A; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
selected: 3 nodes
```

### Escape clears selection

```console
$ km sh board.md -c 'A; key esc; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

## Error Handling

### select_node_add requires nodeId

```console
$ km sh board.md -c 'select_node_add'
error: select_node_add requires a nodeId argument
```

### select_node_remove requires nodeId

```console
$ km sh board.md -c 'select_node_remove'
error: select_node_remove requires a nodeId argument
```

### select_node_toggle requires nodeId

```console
$ km sh board.md -c 'select_node_toggle'
error: select_node_toggle requires a nodeId argument
```
