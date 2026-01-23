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
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## Cursor-Select Keys (hjkl)

### Initial state starts at first card

```console
$ km sh board.md -c 'state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### j cursors down within column

```console
$ km sh board.md -c 'j; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
```

### k cursors up within column

```console
$ km sh board.md -c 'j; k; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### h at card level navigates to parent column

```console
$ km sh board.md -c 'h; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### l at column level navigates to first card (CURSOR_IN)

```console
$ km sh board.md -c 'h; l; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### Enter at column level navigates to first card

```console
$ km sh board.md -c 'h; key enter; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### u navigates up to parent

```console
$ km sh board.md -c 'u; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

### Backspace navigates up to parent

```console
$ km sh board.md -c 'key backspace; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
```

## Column-Level Cursor-Select

### At column level j cursors to next column

```console
$ km sh board.md -c 'h; j; state'
cursor: [1]
node: Done
topLevel: 2 nodes
```

### At column level l navigates to first card

```console
$ km sh board.md -c 'h; j; l; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

## Cross-Column Cursor-Select (H/L)

Cross-column cursor-select moves between columns while preserving the vertical position.

### L cursors right to adjacent column preserving Y position

```console
$ km sh board.md -c 'j; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

### H cursors left to adjacent column preserving Y position

```console
$ km sh board.md -c 'j; L; H; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
```

### L cursors with Y clamped when target column is shorter

```console
$ km sh board.md -c 'j; j; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

### nav_cross_column_right command works like L key

```console
$ km sh board.md -c 'nav_cross_column_right; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

### nav_cross_column_left command works like H key

```console
$ km sh board.md -c 'L; nav_cross_column_left; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### H at first column is no-op

```console
$ km sh board.md -c 'H; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### L at last column is no-op

```console
$ km sh board.md -c 'L; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

### L to empty column cursors to column level

Create a board with an empty column:

```console
$ cat > empty-col.md << 'EOF'
> # Board
> ## Tasks
> - [ ] Task A
> - [ ] Task B
> ## Empty
> EOF
```

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

```console
$ km sh empty-col.md -c 'L; state'
cursor: [1]
node: Empty
topLevel: 2 nodes
```

## Jump Commands (Cursor-Select)

### g jumps to first sibling

```console
$ km sh board.md -c 'j; j; g; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### G jumps to last sibling

```console
$ km sh board.md -c 'G; state'
cursor: [0,2]
node: Task C
topLevel: 2 nodes
```

## Navigating Keys (History)

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

### [ key navigates back (same as nav_back)

```console
$ km sh board.md -c 'key [; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### ] key navigates forward (same as nav_forward)

```console
$ km sh board.md -c 'key ]; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

## Command-Select Keys

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

## Extend-Select Keys (Shift+jk)

### J (Shift+j) extends selection down

```console
$ km sh board.md -c 'J; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
selected: 2 nodes
```

### K (Shift+k) extends selection up

```console
$ km sh board.md -c 'j; K; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
```

### extend_select_down command adds to selection

```console
$ km sh board.md -c 'extend_select_down; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
selected: 2 nodes
```

### extend_select_up command adds to selection

```console
$ km sh board.md -c 'j; extend_select_up; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
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

## Move Mode Keys

### m enters move mode

```console
$ km sh board.md -c 'm; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### enter_move_mode command enters move mode

```console
$ km sh board.md -c 'enter_move_mode; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

### cancel_move command exits move mode

```console
$ km sh board.md -c 'enter_move_mode; cancel_move; state'
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
