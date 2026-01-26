---
mdtest:
  plugin: ../mdtest-sh-plugin.ts
---

# mdtest cmd mode - Persistent subprocess testing

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
$ j
$ state
/board/tasks> cursor: [0]
node: Task Alpha
topLevel: 1 nodes
/board/tasks>
/board/tasks>
cursor: [0]
node: Task Alpha
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

Variables and state persist between commands:

```console cmd="bash" minWait=50 maxWait=500
$ export FOO=bar
$ echo "FOO is $FOO"
[...]
FOO is bar
[...]
```
