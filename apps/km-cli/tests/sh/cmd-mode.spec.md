---
mdspec:
  plugin: ../mdspec-sh-plugin.ts
  # memory: true not feasible - test creates files, runs km sync, and tests
  # persistent REPL subprocess which all require real filesystem
---

# mdspec cmd mode - Persistent subprocess testing

Demonstrates the `cmd="..."` feature for testing REPLs where state persists between commands.

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
> - [ ] Task Alpha
> - [ ] Task Beta
> EOF
```

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## km sh with cmd mode

Using `cmd="km sh board.md"` - state persists between commands:

```console cmd="km sh board.md" minWait=50 maxWait=500
$ state
/board/tasks> cursor: [0]
node: Tasks
topLevel: 1 nodes
/board/tasks>
$ j
/board/tasks> /board/tasks>
$ state
/board/tasks> cursor: [0]
node: Tasks
topLevel: 1 nodes
/board/tasks>
```

## Simple REPL examples

### cat as echo REPL

Using `cat` as a simple persistent subprocess that echoes input:

```console cmd="cat" minWait=50 maxWait=500
$ hello
hello
$ world
world
```

### bash with persistent state

Commands execute in sequence:

```console cmd="bash" minWait=50 maxWait=500
$ echo "first"
first
$ echo "second"
second
```
