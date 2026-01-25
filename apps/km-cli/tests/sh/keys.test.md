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

## Key Tests

All keyboard navigation tests using persistent bash subprocess:

```console cmd="bash --norc --noprofile" minWait=50 maxWait=1000
$ PS1='' PS2=''
$ stty -echo
$ km sh board.md -c 'state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'j; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
$ km sh board.md -c 'j; k; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'h; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
$ km sh board.md -c 'h; l; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'h; key enter; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'u; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
$ km sh board.md -c 'key backspace; state'
cursor: [0]
node: Tasks
topLevel: 2 nodes
$ km sh board.md -c 'h; j; state'
cursor: [1]
node: Done
topLevel: 2 nodes
$ km sh board.md -c 'h; j; l; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
$ km sh board.md -c 'j; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
$ km sh board.md -c 'j; L; H; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
$ km sh board.md -c 'j; j; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
$ km sh board.md -c 'nav_cross_column_right; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
$ km sh board.md -c 'L; nav_cross_column_left; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'H; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'L; L; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

## Empty Column Tests

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

```console cmd="bash --norc --noprofile" minWait=50 maxWait=500
$ PS1='' PS2=''
$ stty -echo
$ km sh empty-col.md -c 'L; state'
cursor: [1]
node: Empty
topLevel: 2 nodes
```

## Jump, History, Select, View, and Move Tests

```console cmd="bash --norc --noprofile" minWait=50 maxWait=1000
$ PS1='' PS2=''
$ stty -echo
$ km sh board.md -c 'j; j; g; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'G; state'
cursor: [0,2]
node: Task C
topLevel: 2 nodes
$ km sh board.md -c 'nav_back; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'nav_forward; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'key [; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'key ]; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'A; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 3 nodes
$ km sh board.md -c 'A; key esc; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'J; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
selected: 2 nodes
$ km sh board.md -c 'j; K; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
$ km sh board.md -c 'extend_select_down; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
selected: 2 nodes
$ km sh board.md -c 'j; extend_select_up; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
selected: 2 nodes
$ km sh board.md -c 'z; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
folded: 4 nodes
$ km sh board.md -c 'z; Z; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c '<; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c '<; >; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c '+; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c '+; -; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'm; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'enter_move_mode; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'enter_move_mode; cancel_move; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
$ km sh board.md -c 'key Q'
error: Unknown key: Q
```
