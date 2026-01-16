# km sh - Path Navigation Tests

Tests for path-based navigation commands using `km sh`.

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

Create a test board with multiple sections and tasks:

```console
$ cat > board.md << 'EOF'
> # Test Board
> ## Section A
> - [ ] Task A1
> - [ ] Task A2
> - [ ] Task A3
> ## Section B
> - [ ] Task B1
> - [ ] Task B2
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Path-based Commands

### Initial cursor at first card [0,0]

```console
$ km sh board.md -c 'state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### nav_to_path navigates to specific column

```console
$ km sh board.md -c 'nav_to_path 1; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

### nav_to_path to nested path

```console
$ km sh board.md -c 'nav_to_path 0,1; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

### nav_to_path to different section's task

```console
$ km sh board.md -c 'nav_to_path 1,0; state'
cursor: [1,0]
node: Task B1
topLevel: 2 nodes
```

### nav_to_path requires valid path

```console
$ km sh board.md -c 'nav_to_path'
error: nav_to_path requires a path argument
```

### nav_to_path requires numeric indices

```console
$ km sh board.md -c 'nav_to_path a,b,c'
error: nav_to_path requires comma-separated numeric indices
```

### select_position is not implemented yet

The SELECT_POSITION action is defined but not handled in the reducer.
This test documents the current behavior (no-op).

```console
$ km sh board.md -c 'select_position 0,2; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

## Sibling Navigation

### nav_next_sibling moves to next within column

Starting at [0,0], moves to [0,1].

```console
$ km sh board.md -c 'nav_next_sibling; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

### nav_prev_sibling moves to previous

```console
$ km sh board.md -c 'nav_next_sibling; nav_prev_sibling; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### nav_child from column level enters first child

First go to column level with h, then nav_child.

```console
$ km sh board.md -c 'h; nav_child; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### nav_child on second section

```console
$ km sh board.md -c 'nav_to_path 1; nav_child; state'
cursor: [1,0]
node: Task B1
topLevel: 2 nodes
```

### nav_parent goes up one level

```console
$ km sh board.md -c 'nav_parent; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

## Column Navigation with l/h

### h at card level moves to parent column

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### l at column level moves to next column

```console
$ km sh board.md -c 'h; l; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```

### h at column level moves to previous column

```console
$ km sh board.md -c 'h; l; h; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### l at card level without children stays in place

At [0,0] (Task A1 with no children), l has no effect.

```console
$ km sh board.md -c 'l; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```
