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

Create a test board with two columns:

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

### Initial state starts at first card

```console
$ km sh board.md -c 'state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### j moves down within column

```console
$ km sh board.md -c 'j; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
```

### k moves up within column

```console
$ km sh board.md -c 'j; k; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### h at card level moves to parent column

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### l at column level moves to next column

```console
$ km sh board.md -c 'h; l; state'
cursor: [1]
node: Done
topLevel: 2 nodes
```

### Enter at column level enters first card

```console
$ km sh board.md -c 'h; key enter; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### u goes up to parent

```console
$ km sh board.md -c 'u; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### Backspace goes up to parent

```console
$ km sh board.md -c 'key backspace; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

## Column Navigation

### At column level j moves to next column

```console
$ km sh board.md -c 'h; j; state'
cursor: [1]
node: Done
topLevel: 2 nodes
```

### At column level l enters first card

```console
$ km sh board.md -c 'h; j; l; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

## Jump Commands

### g moves to first sibling

```console
$ km sh board.md -c 'j; j; g; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### G moves to last sibling

```console
$ km sh board.md -c 'G; state'
cursor: [0,2]
node: Task C
topLevel: 2 nodes
```

## History Navigation Keys

### nav_back at start does nothing

```console
$ km sh board.md -c 'nav_back; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### nav_forward at start does nothing

```console
$ km sh board.md -c 'nav_forward; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## Selection Keys

### A selects all siblings

```console
$ km sh board.md -c 'A; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 3 nodes
```

### Escape clears selection

```console
$ km sh board.md -c 'A; key esc; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## View Control Keys

### z folds current depth

```console
$ km sh board.md -c 'z; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
folded: 4 nodes
```

### Z unfolds all

```console
$ km sh board.md -c 'z; Z; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### < decreases outline depth

```console
$ km sh board.md -c '<; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### > increases outline depth

```console
$ km sh board.md -c '<; >; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### + increases content lines

```console
$ km sh board.md -c '+; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### - decreases content lines

```console
$ km sh board.md -c '+; -; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## Modal Keys

### / toggles search mode

```console
$ km sh board.md -c '/; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
search: ""
```

### ? toggles help mode

```console
$ km sh board.md -c '?; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### n toggles new item mode

```console
$ km sh board.md -c 'n; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### p toggles project picker

```console
$ km sh board.md -c 'p; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### i toggles detail pane

```console
$ km sh board.md -c 'i; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## Unknown Key

### Unknown key shows error

```console
$ km sh board.md -c 'key Q'
error: Unknown key: Q
```
