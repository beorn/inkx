# km sh - Selection Tests

Tests for TUI selection and multi-select commands using `km sh`.

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
> - [ ] Task A
> - [ ] Task B
> - [ ] Task C
> - [ ] Task D
> - [ ] Task E
> EOF
```

```console
$ km sync
Syncing: ...
[...]
```

## Card Selection by Index

### select_card moves to specific position

```console
$ km sh board.md -c 'select_card 0 2; state'
# SELECT_CARD
state: col=0 card=2 "Tasks"
position: col=0 card=2
column: Tasks (5 cards)
card: Task C
```

### select_card 0 0 moves to first card

```console
$ km sh board.md -c 'move_down; move_down; select_card 0 0; state'
# MOVE_DOWN
state: col=0 card=1 "Tasks"
# MOVE_DOWN
state: col=0 card=2 "Tasks"
# SELECT_CARD
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (5 cards)
card: Task A
```

## Multi-select Mode

### select_all_column selects all cards in current column

```console
$ km sh board.md -c 'select_all_column; state'
# SELECT_ALL_COLUMN
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (5 cards)
card: Task A
selected: 5 cards
```

### clear_selection clears all selected cards

```console
$ km sh board.md -c 'select_all_column; clear_selection; state'
# SELECT_ALL_COLUMN
state: col=0 card=0 "Tasks"
# CLEAR_SELECTION
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (5 cards)
card: Task A
```

## Error Handling

### select_card with invalid indices

```console
$ km sh board.md -c 'select_card abc def'
error: select_card requires two numeric arguments: col card
```

### select_card_add requires nodeId

```console
$ km sh board.md -c 'select_card_add'
error: select_card_add requires a nodeId argument
```

### select_card_remove requires nodeId

```console
$ km sh board.md -c 'select_card_remove'
error: select_card_remove requires a nodeId argument
```

### select_card_toggle requires nodeId

```console
$ km sh board.md -c 'select_card_toggle'
error: select_card_toggle requires a nodeId argument
```
