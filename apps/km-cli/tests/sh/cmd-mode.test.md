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
! 26 |  * Returns true for paths starting with / or ./  or ../
! 27 |  * Note: ~ is handled by the shell before reaching the program
! 28 |  */
! 29 | export function isExplicitPath(query: string): boolean {
! 30 |   return (
! 31 |     query.startsWith("/") || query.startsWith("./") || query.startsWith("../")
!          ^
! TypeError: undefined is not an object (evaluating 'query.startsWith')
!       at isExplicitPath (/Users/beorn/Code/pim/km/packages/km-storage/src/path-utils.ts:31:5)
!       at resolveNode (/Users/beorn/Code/pim/km/packages/km-storage/src/db-queries/smart-resolver.ts:80:7)
!       at <anonymous> (/Users/beorn/Code/pim/km/apps/km-cli/src/commands/sh.ts:316:20)
!       at <anonymous> (/Users/beorn/Code/pim/km/apps/km-cli/src/commands/sh.ts:306:18)
! Bun v1.3.6 (macOS arm64)
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
