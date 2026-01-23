# km sh - History Navigation Tests

Tests for history back/forward navigation using `[` and `]` keys.

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

Create a test board:

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

## History Commands

### nav_back at start does nothing

```console
$ km sh board.md -c 'nav_back; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### nav_forward at start does nothing

```console
$ km sh board.md -c 'nav_forward; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### [ key is same as nav_back

```console
$ km sh board.md -c '[; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### ] key is same as nav_forward

```console
$ km sh board.md -c ']; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Parent Navigation

### u goes up to parent

```console
$ km sh board.md -c 'key enter; u; state'
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### h at depth goes to parent

```console
$ km sh board.md -c 'key enter; h; state'
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### cursor_out command

```console
$ km sh board.md -c 'key enter; cursor_out; state'
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### cursor_in command

```console
$ km sh board.md -c 'cursor_in; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```
