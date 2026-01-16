# km sh - Selection Tests

Tests for TUI selection and multi-select commands using `km sh`.

## Setup

```console
$ beforeAll() {
>   export TEST_ROOT="$(mktemp -d)"
>   cd "$TEST_ROOT"
>   km() { bun run "$ROOT/apps/km-cli/src/index.ts" "$@"; }
>   export -f km
>   mkdir -p .km
> }
$ afterAll() {
>   rm -rf "$TEST_ROOT"
> }
```

Create a test board with tasks:

```console
$ cat > board.md << 'EOF'
> # Test Board
> ## Tasks
> - [ ] Task A
> - [ ] Task B
> - [ ] Task C
> - [ ] Task D
> - [ ] Task E
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Navigation to Children

### Navigate into children then down

```console
$ km sh board.md -c 'key enter; j; state'
cursor: [0,1]
node: Task B
topLevel: 1 nodes
```

### Navigate to first child then back to top

```console
$ km sh board.md -c 'key enter; j; g; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Multi-select Mode

### A selects all siblings

```console
$ km sh board.md -c 'key enter; A; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
selected: 5 nodes
```

### Escape clears selection

```console
$ km sh board.md -c 'key enter; A; key esc; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
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
