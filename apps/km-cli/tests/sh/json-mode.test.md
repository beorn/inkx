---
mdtest:
  plugin: ../mdtest-sh-plugin.ts
---

# km sh - JSON Mode Tests

Tests for `km sh --json` mode which outputs NDJSON for automation.

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

Create a test board with tasks.

```console
$ cat > board.md << 'EOF'
> # Test Board
> ## Tasks
> - [ ] Task 1
> - [ ] Task 2
> EOF
```

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## JSON Mode Output

### JSON mode outputs init event first

```console
$ km sh --json board.md -c 'state' 2>&1 | head -1
{"event":"init",[...]}
```

### JSON mode outputs final event last

```console
$ km sh --json board.md -c 'state' 2>&1 | tail -1
{"event":"final",[...]}
```

### JSON mode state includes cursor

```console
$ km sh --json board.md -c 'state' 2>&1 | grep '"cursor"' | head -1
[...]}
```

## Error Handling

### State command produces state event

```console
$ km sh --json board.md -c 'state' 2>&1 | grep -c '"event":"state"'
1
```
