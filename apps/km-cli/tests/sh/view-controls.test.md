# km sh - View Controls Tests

Tests for TUI view controls (fold, collapse, depth, content lines) using `km sh`.

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

Create a test board with flat tasks:

```console
$ cat > board.md << 'EOF'
> # Test Board
> ## Tasks
> - [ ] Task A
> - [ ] Task B
> - [ ] Task C
> EOF
```

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Fold Commands

### z folds current level

```console
$ km sh board.md -c 'z; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
folded: 3 nodes
```

### Z unfolds all

```console
$ km sh board.md -c 'z; Z; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### fold_level command folds specific depth

```console
$ km sh board.md -c 'fold_level 1; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
folded: 3 nodes
```

### unfold_level command unfolds specific depth

```console
$ km sh board.md -c 'fold_level 1; unfold_level 1; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Outline Depth Commands

### < decreases outline depth

```console
$ km sh board.md -c 'decrease_outline_depth; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### > increases outline depth

```console
$ km sh board.md -c 'increase_outline_depth; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### key < decreases outline depth

```console
$ km sh board.md -c '<; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### key > increases outline depth

```console
$ km sh board.md -c '<; >; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Content Lines Commands

### + increases content lines

```console
$ km sh board.md -c 'increase_content_lines; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### - decreases content lines

```console
$ km sh board.md -c 'decrease_content_lines; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### key + increases content lines

```console
$ km sh board.md -c '+; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### key - decreases content lines

```console
$ km sh board.md -c '+; -; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Toggle Fold Commands

### toggle_fold requires nodeId

```console
$ km sh board.md -c 'toggle_fold'
error: toggle_fold requires a nodeId argument
```

### toggle_fold with nodeId folds node

```console
$ km sh board.md -c 'toggle_fold test-id; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
folded: 1 nodes
```

### toggle_fold twice unfolds node

```console
$ km sh board.md -c 'toggle_fold test-id; toggle_fold test-id; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Toggle Collapse Commands

### toggle_collapse requires nodeId

```console
$ km sh board.md -c 'toggle_collapse'
error: toggle_collapse requires a nodeId argument
```

### toggle_collapse with nodeId collapses node

```console
$ km sh board.md -c 'toggle_collapse test-id; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
collapsed: 1 nodes
```

### toggle_collapse twice expands node

```console
$ km sh board.md -c 'toggle_collapse test-id; toggle_collapse test-id; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```
