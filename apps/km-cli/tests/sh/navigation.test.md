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

Using persistent subprocess mode to test state across commands:

```console cmd="km sh board.md"
$ state
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
$ j
$ state
cursor: [0,1]
node: Task Beta
topLevel: 1 nodes
$ k
$ state
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### Boundary: k at top stays at top

```console cmd="km sh board.md"
$ k
$ state
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```

### Boundary: j at bottom stays at bottom

```console cmd="km sh board.md"
$ j
$ j
$ j
$ state
cursor: [0,2]
node: Task Gamma
topLevel: 1 nodes
```

## Jump Commands

```console cmd="km sh board.md"
$ j
$ j
$ g
$ state
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
$ G
$ state
cursor: [0,2]
node: Task Gamma
topLevel: 1 nodes
```

## Log Command

```console cmd="km sh board.md"
$ j
$ k
$ log
CURSOR_NEXT → cursor=[0,1]
CURSOR_PREV → cursor=[0,0]
$ log 1
CURSOR_PREV → cursor=[0,0]
```

## Shell Commands

### help shows available commands

```console
$ km sh board.md -c 'help'
km-sh commands:
[...]
```

### quit exits the shell immediately

```console cmd="km sh board.md"
$ q
```

## View Command

```console cmd="km sh board.md"
$ view
Path: [...]

     Tasks (+3)
  →  ○ Task Alpha
[...]
```

## Error Handling

```console cmd="km sh board.md"
$ unknown_command
error: Unknown command: unknown_command
$ state
cursor: [0,0]
node: Task Alpha
topLevel: 1 nodes
```
