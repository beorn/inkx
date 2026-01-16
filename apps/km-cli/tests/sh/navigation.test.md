# km sh - Navigation Tests

Tests for TUI state navigation commands using `km sh`.

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
> - [ ] Task Alpha
> - [ ] Task Beta
> - [ ] Task Gamma
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Basic Navigation

### Initial state starts at first card

With single-column boards, cursor starts at first card [0,0].

```console
$ km sh board.md -c 'state'
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### j moves to next sibling

```console
$ km sh board.md -c 'j; state'
cursor: [0,1]
node: Task Beta
topLevel: 1 nodes
```

### k moves to previous sibling

```console
$ km sh board.md -c 'j; k; state'
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### k at top stays at top

```console
$ km sh board.md -c 'k; state'
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### j at bottom stays at bottom

```console
$ km sh board.md -c 'j; j; j; state'
cursor: [0,2]
node: Task Gamma
topLevel: 1 nodes
```

## Jump Commands

### g moves to first sibling

```console
$ km sh board.md -c 'j; j; g; state'
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### G moves to last sibling

```console
$ km sh board.md -c 'G; state'
cursor: [0,2]
node: Task Gamma
topLevel: 1 nodes
```

## Log Command

### log shows action trace

```console
$ km sh board.md -c 'j; k; log'
MOVE_DOWN → cursor=[0,1]
MOVE_UP → cursor=[0,0]
```

### log 1 shows last action only

```console
$ km sh board.md -c 'j; k; log 1'
MOVE_UP → cursor=[0,0]
```

## Shell Commands

### help shows available commands

```console
$ km sh board.md -c 'help'
km-sh commands:
[...]
```

### quit exits the shell immediately

The `q` shorthand exits the shell.

```console
$ km sh board.md -c 'q; state' && echo "exited"
exited
```

## View Command

### view renders ASCII tree

```console
$ km sh board.md -c 'view'
Path: [...]

     Tasks (+3)
  →  ○ Task Alpha
[...]
```

## Error Handling

### Unknown command shows error

```console
$ km sh board.md -c 'unknown_command'
error: Unknown command: unknown_command
```

### Empty command is ignored

```console
$ km sh board.md -c '; ; state'
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```
