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
$ km sh board.md -c 'key /; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
search: ""
```

### / twice toggles search mode off

```console
$ km sh board.md -c 'key /; key /; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### toggle_search command

```console
$ km sh board.md -c 'toggle_search; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
search: ""
```

### set_search_query sets query

```console
$ km sh board.md -c 'toggle_search; set_search_query hello; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
search: "hello"
```

## Help Mode

### ? toggles help mode on

```console
$ km sh board.md -c 'key ?; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### ? twice toggles help mode off

```console
$ km sh board.md -c 'key ?; key ?; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### toggle_help command

```console
$ km sh board.md -c 'toggle_help; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

## New Item Mode

### n toggles new item mode on

```console
$ km sh board.md -c 'key n; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### n twice toggles new item mode off

```console
$ km sh board.md -c 'key n; key n; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### toggle_new_item command

```console
$ km sh board.md -c 'toggle_new_item; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### set_new_item_text sets text

```console
$ km sh board.md -c 'toggle_new_item; set_new_item_text new task; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### clear_new_item clears text and closes

```console
$ km sh board.md -c 'toggle_new_item; set_new_item_text test; clear_new_item; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

## Project Picker

### p toggles project picker

```console
$ km sh board.md -c 'key p; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### p twice closes project picker

```console
$ km sh board.md -c 'key p; key p; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### set_project_picker_query sets query

```console
$ km sh board.md -c 'key p; set_project_picker_query inbox; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

## Detail Pane

### i toggles detail pane

```console
$ km sh board.md -c 'key i; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### i twice closes detail pane

```console
$ km sh board.md -c 'key i; key i; state'
state: cursor=[0] "Tasks"
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```

### toggle_detail_pane command

```console
$ km sh board.md -c 'toggle_detail_pane; state'
state: cursor=[0] "Tasks"
cursor: [0]
node: Tasks
topLevel: 1 nodes
```
