# km sh - Mutation Tests

Tests for card mutation commands using `km sh`.

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

## set_status command

### set_status changes task status to done

```console
$ km sh board.md -c 'set_status done; state'
cursor: [0,0]
node: Task A
topLevel: 2 nodes
```

Verify status changed in file:

```console
$ grep "Task A" board.md
- [x] Task A
```

### set_status changes task status to wip

```console
$ km sh board.md -c 'j; set_status wip; state'
cursor: [0,1]
node: Task B
topLevel: 2 nodes
```

```console
$ grep "Task B" board.md
- [/] Task B
```

### set_status changes task status to blocked

```console
$ km sh board.md -c 'j; j; set_status blocked; state'
cursor: [0,2]
node: Task C
topLevel: 2 nodes
```

```console
$ grep "Task C" board.md
- [!] Task C
```

### set_status requires valid status argument

```console
$ km sh board.md -c 'set_status invalid'
error: set_status requires a status: todo, wip, blocked, done, dropped
```

### set_status changes done to todo

```console
$ km sh board.md -c 'L; set_status todo; state'
cursor: [1,0]
node: Task D
topLevel: 2 nodes
```

```console
$ grep "Task D" board.md
- [ ] Task D
```

## delete command (not yet implemented)

### delete returns not implemented error

```console
$ cat > delete-test.md << 'EOF'
> # Delete Test
> ## Items
> - [ ] Item 1
> - [ ] Item 2
> EOF
```

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

```console
$ km sh delete-test.md -c 'delete'
error: delete command not yet implemented
```

## shift commands (not yet implemented)

### shift_up returns not implemented error

```console
$ km sh delete-test.md -c 'shift_up'
error: shift_up/shift_down commands not yet implemented
```

### shift_down returns not implemented error

```console
$ km sh delete-test.md -c 'shift_down'
error: shift_up/shift_down commands not yet implemented
```
