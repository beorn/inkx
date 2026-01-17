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

Create a test board with tasks:

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
Syncing: ...
[...]
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

### JSON mode action outputs action event

```console
$ km sh --json board.md -c 'move_down; state' 2>&1 | grep '"event":"action"'
{"event":"action","action":{"type":"CURSOR_NEXT"},[...]}
```

### JSON mode state changes output state event

The `state` command outputs its own state event.

```console
$ km sh --json board.md -c 'state' 2>&1 | grep -c '"event":"state"'
1
```

## JSON Input Mode

### JSON actions can be used as input

```console
$ echo '{"type":"CURSOR_NEXT"}' | km sh --json board.md 2>&1 | grep '"event":"action"'
{"event":"action","action":{"type":"CURSOR_NEXT"},[...]}
```

### Multiple JSON actions work

```console
$ echo -e '{"type":"CURSOR_NEXT"}\n{"type":"CURSOR_PREV"}' | km sh --json board.md 2>&1 | grep -c '"event":"action"'
2
```

### Invalid JSON shows error event

```console
$ echo '{invalid json' | km sh --json board.md 2>&1 | grep '"event":"error"'
{"event":"error","error":"Invalid JSON: [...]",[...]}
```

### JSON without type field shows error

```console
$ echo '{"foo":"bar"}' | km sh --json board.md 2>&1 | grep '"event":"error"'
{"event":"error","error":"JSON action missing 'type' field",[...]}
```

## Final State Structure

### Final state includes cursor

```console
$ km sh --json board.md -c 'state' 2>&1 | tail -1 | grep '"cursor"'
[...]"cursor":[0,0][...]
```

### Final state includes node count

```console
$ km sh --json board.md -c 'state' 2>&1 | tail -1 | grep '"nodeCount"'
[...]"nodeCount":3[...]
```

### Final state includes top level count

```console
$ km sh --json board.md -c 'state' 2>&1 | tail -1 | grep '"topLevelCount"'
[...]"topLevelCount":1[...]
```

## Mixed Mode (Line Commands with JSON Output)

### Line commands work with --json flag

```console
$ km sh --json board.md -c 'move_down; state' 2>&1 | grep '"event":"action"'
{"event":"action","action":{"type":"CURSOR_NEXT"},[...]}
```

### State command outputs state event in JSON mode

```console
$ km sh --json board.md -c 'state' 2>&1 | grep -c '"event":"state"'
1
```

### View command outputs output event in JSON mode

```console
$ km sh --json board.md -c 'view' 2>&1 | grep '"event":"output"'
{"event":"output","text":"[...]",[...]}
```

### Help command outputs output event in JSON mode

```console
$ km sh --json board.md -c 'help' 2>&1 | grep '"event":"output"'
{"event":"output","text":"km-sh commands:[...]",[...]}
```
