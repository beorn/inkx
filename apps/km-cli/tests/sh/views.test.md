# km sh - View Mode Tests

Tests for TUI view modes and folding commands using `km sh`.

## Setup

```console
$ beforeAll() {
>   km() { bun run "$ROOT/apps/km-cli/src/index.ts" "$@"; }
>   export -f km
>   mkdir -p .km
> }
```

Create a test board with tasks:

```console
$ cat > board.md << 'EOF'
> # Test Board
> ## Tasks
> - [ ] Task 1
> - [ ] Task 2
> - [ ] Task 3
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## View Mode Commands

### set_view_mode cards

```console
$ km sh board.md -c 'set_view_mode cards; state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

### set_view_mode list

```console
$ km sh board.md -c 'set_view_mode list; state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

### set_view_mode columns

```console
$ km sh board.md -c 'set_view_mode columns; state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

### set_view_mode tabs

```console
$ km sh board.md -c 'set_view_mode tabs; state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

### Invalid view mode shows error

```console
$ km sh board.md -c 'set_view_mode invalid'
error: Invalid view mode: invalid. Valid: cards, list, columns, tabs
```

## Column Folding

### fold_column requires numeric index

```console
$ km sh board.md -c 'fold_column abc'
error: fold_column requires a numeric column index
```

### unfold_column requires numeric index

```console
$ km sh board.md -c 'unfold_column abc'
error: unfold_column requires a numeric column index
```

### toggle_collapse requires numeric index

```console
$ km sh board.md -c 'toggle_collapse abc'
error: toggle_collapse requires a numeric column index
```

### toggle_collapse 0 collapses first column

```console
$ km sh board.md -c 'toggle_collapse 0; state'
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
collapsed: 1 columns
```

### toggle_collapse twice uncollapses

```console
$ km sh board.md -c 'toggle_collapse 0; toggle_collapse 0; state'
state: col=0 card=0 "Tasks"
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

## Card Folding

### toggle_fold requires cardId

```console
$ km sh board.md -c 'toggle_fold'
error: toggle_fold requires a cardId argument
```

### toggle_fold with cardId

```console
$ km sh board.md -c 'toggle_fold test-card-id; state'
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
folded: 1 cards
```

## Mode Toggles

### toggle_search enters search mode

```console
$ km sh board.md -c 'toggle_search; state'
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
search: ""
```

### toggle_help enters help mode

```console
$ km sh board.md -c 'toggle_help; state'
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
```

### set_search_query sets search text

```console
$ km sh board.md -c 'toggle_search; set_search_query hello world; state'
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task 1
search: "hello world"
```
