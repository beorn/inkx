# km sh - Modal Tests

Tests for TUI modal/overlay toggles using `km sh`.

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
> - [ ] Task A
> - [ ] Task B
> - [ ] Task C
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Search Mode

### / toggles search mode on

```console
$ km sh board.md -c '/; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
search: ""
```

### / twice toggles search mode off

```console
$ km sh board.md -c '/; /; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### toggle_search command

```console
$ km sh board.md -c 'toggle_search; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
search: ""
```

### set_search_query sets query

```console
$ km sh board.md -c 'toggle_search; set_search_query hello; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
search: "hello"
```

## Help Mode

### ? toggles help mode on

```console
$ km sh board.md -c '?; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### ? twice toggles help mode off

```console
$ km sh board.md -c '?; ?; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### toggle_help command

```console
$ km sh board.md -c 'toggle_help; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## New Item Mode

### n toggles new item mode on

```console
$ km sh board.md -c 'n; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### n twice toggles new item mode off

```console
$ km sh board.md -c 'n; n; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### toggle_new_item command

```console
$ km sh board.md -c 'toggle_new_item; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### set_new_item_text sets text

```console
$ km sh board.md -c 'toggle_new_item; set_new_item_text new task; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### clear_new_item clears text and closes

```console
$ km sh board.md -c 'toggle_new_item; set_new_item_text test; clear_new_item; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Project Picker

### p toggles project picker

```console
$ km sh board.md -c 'p; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### p twice closes project picker

```console
$ km sh board.md -c 'p; p; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### set_project_picker_query sets query

```console
$ km sh board.md -c 'p; set_project_picker_query inbox; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

## Detail Pane

### i toggles detail pane

```console
$ km sh board.md -c 'i; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### i twice closes detail pane

```console
$ km sh board.md -c 'i; i; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```

### toggle_detail_pane command

```console
$ km sh board.md -c 'toggle_detail_pane; state'
cursor: [0,0]
node: Task A
topLevel: 1 nodes
```
