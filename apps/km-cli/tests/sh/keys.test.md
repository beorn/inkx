# km sh - Key Input Tests

Tests for TUI keyboard shortcuts using `km sh key` command.

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
> ## Done
> - [x] Task D
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Navigation Keys

### h moves left (to parent or prev column)

```console
$ km sh board.md -c 'move_down; key h; state'
state: cursor=[0,0] "Task A"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### l moves right (to child or next column)

```console
$ km sh board.md -c 'key l; state'
state: cursor=[0,0] "Task A"
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### u goes up to parent

```console
$ km sh board.md -c 'move_down; key u; state'
state: cursor=[0,0] "Task A"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### Backspace goes up to parent

```console
$ km sh board.md -c 'move_down; key Backspace; state'
state: cursor=[0,0] "Task A"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### Enter drills into child

```console
$ km sh board.md -c 'key Enter; state'
state: cursor=[0,0] "Task A"
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## History Navigation Keys

### [ navigates back in history

```console
$ km sh board.md -c 'nav_back; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### ] navigates forward in history

```console
$ km sh board.md -c 'nav_forward; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

## Selection Keys

### A selects all siblings

```console
$ km sh board.md -c 'move_down; key A; state'
state: cursor=[0,0] "Task A"
state: cursor=[0,0] "Task A"
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 3 nodes
```

### Escape clears selection

```console
$ km sh board.md -c 'move_down; key A; key Escape; state'
state: cursor=[0,0] "Task A"
state: cursor=[0,0] "Task A"
state: cursor=[0,0] "Task A"
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## View Control Keys

### z folds at level 1

```console
$ km sh board.md -c 'key z; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
folded: 2 nodes
```

### Z unfolds at level 1

```console
$ km sh board.md -c 'key z; key Z; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### < decreases outline depth

```console
$ km sh board.md -c 'key <; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### > increases outline depth

```console
$ km sh board.md -c 'key <; key >; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### + increases content lines

```console
$ km sh board.md -c 'key +; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### - decreases content lines

```console
$ km sh board.md -c 'key +; key -; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

## Modal Keys

### / toggles search mode

```console
$ km sh board.md -c 'key /; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
search: ""
```

### ? toggles help mode

```console
$ km sh board.md -c 'key ?; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### n toggles new item mode

```console
$ km sh board.md -c 'key n; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### p toggles project picker

```console
$ km sh board.md -c 'key p; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### i toggles detail pane

```console
$ km sh board.md -c 'key i; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

## Unknown Key

### Unknown key shows error

```console
$ km sh board.md -c 'key Q'
error: Unknown key: Q
```
