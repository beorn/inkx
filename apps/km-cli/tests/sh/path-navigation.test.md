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

### select_position navigates to specific position (alias for nav_to_path)

```console
$ km sh board.md -c 'select_position 0,2; state'
cursor: [0,2]
node: Task A3
topLevel: 2 nodes
```

## Sibling Navigation

### cursor_next moves to next within column

Starting at [0,0], moves to [0,1].

```console
$ km sh board.md -c 'cursor_next; state'
cursor: [0,1]
node: Task A2
topLevel: 2 nodes
```

### cursor_prev moves to previous

```console
$ km sh board.md -c 'cursor_next; cursor_prev; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### cursor_in from column level enters first child

First go to column level with h, then cursor_in.

```console
$ km sh board.md -c 'h; cursor_in; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### cursor_in on second section

```console
$ km sh board.md -c 'nav_to_path 1; cursor_in; state'
cursor: [1,0]
node: Task B1
topLevel: 2 nodes
```

### cursor_out goes up one level

```console
$ km sh board.md -c 'cursor_out; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

## Structural Navigation with l/h

In km-sh, l/h use purely structural navigation (in/out, not spatial).
For spatial cross-column navigation, use `nav_to_path`.

### h at card level moves to parent (column level)

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Section A
topLevel: 2 nodes
```

### l at column level moves into first child

```console
$ km sh board.md -c 'h; l; state'
cursor: [0,0]
node: Task A1
topLevel: 2 nodes
```

### h at column level stays in place (already at root)

```console
$ km sh board.md -c 'h; h; state'
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

### cursor_next at column level moves to next column

```console
$ km sh board.md -c 'h; cursor_next; state'
cursor: [1]
node: Section B
topLevel: 2 nodes
```
