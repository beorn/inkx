# km sh - View Mode Tests

Tests for TUI view modes and folding commands using `km sh`.

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
> - [ ] Task 1
> - [ ] Task 2
> - [ ] Task 3
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Folding Commands

### toggle_fold requires nodeId

```console
$ km sh board.md -c 'toggle_fold'
error: toggle_fold requires a nodeId argument
```

### toggle_fold with nodeId

```console
$ km sh board.md -c 'toggle_fold test-id; state'
cursor: [0,0]
node: Task 1
topLevel: 1 nodes
folded: 1 nodes
```

### toggle_collapse requires nodeId

```console
$ km sh board.md -c 'toggle_collapse'
error: toggle_collapse requires a nodeId argument
```

### toggle_collapse with nodeId

```console
$ km sh board.md -c 'toggle_collapse test-id; state'
cursor: [0,0]
node: Task 1
topLevel: 1 nodes
collapsed: 1 nodes
```
