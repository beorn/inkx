# km sh - Navigation Tests

Tests for TUI state navigation commands using `km sh`.

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

### Initial state starts at col=0 card=0

```console
$ km sh board.md -c 'state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### move_down moves cursor down

```console
$ km sh board.md -v -c 'move_down; state'
! ...MOVE_DOWN...
state: col=0 card=1 "Tasks"
position: col=0 card=1
column: Tasks (3 cards)
card: Task Beta
```

### Multiple move_down commands

```console
$ km sh board.md -v -c 'move_down; move_down; state'
! ...MOVE_DOWN...
! ...MOVE_DOWN...
state: col=0 card=1 "Tasks"
state: col=0 card=2 "Tasks"
position: col=0 card=2
column: Tasks (3 cards)
card: Task Gamma
```

### move_up moves cursor up

```console
$ km sh board.md -v -c 'move_down; move_down; move_up; state'
! ...MOVE_DOWN...
! ...MOVE_DOWN...
! ...MOVE_UP...
state: col=0 card=1 "Tasks"
state: col=0 card=2 "Tasks"
state: col=0 card=1 "Tasks"
position: col=0 card=1
column: Tasks (3 cards)
card: Task Beta
```

### move_up at top stays at top

```console
$ km sh board.md -v -c 'move_up; state'
! ...MOVE_UP...
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### move_down at bottom stays at bottom

```console
$ km sh board.md -c 'move_down; move_down; move_down; move_down; state'
state: col=0 card=1 "Tasks"
state: col=0 card=2 "Tasks"
position: col=0 card=2
column: Tasks (3 cards)
card: Task Gamma
```

## Jump Commands

### jump_top moves to first card

```console
$ km sh board.md -v -c 'move_down; move_down; jump_top; state'
! ...MOVE_DOWN...
! ...MOVE_DOWN...
! ...JUMP_TOP...
state: col=0 card=1 "Tasks"
state: col=0 card=2 "Tasks"
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### jump_bottom moves to last card

```console
$ km sh board.md -v -c 'jump_bottom; state'
! ...JUMP_BOTTOM...
state: col=0 card=2 "Tasks"
position: col=0 card=2
column: Tasks (3 cards)
card: Task Gamma
```

## Key Commands (Vim-style)

### key j is same as move_down

```console
$ km sh board.md -v -c 'key j; state'
! ...MOVE_DOWN...
state: col=0 card=1 "Tasks"
position: col=0 card=1
column: Tasks (3 cards)
card: Task Beta
```

### key k is same as move_up

```console
$ km sh board.md -c 'key j; key k; state'
state: col=0 card=1 "Tasks"
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### key g is same as jump_top

```console
$ km sh board.md -c 'jump_bottom; key g; state'
state: col=0 card=2 "Tasks"
state: col=0 card=0 "Tasks"
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### key G is same as jump_bottom

```console
$ km sh board.md -c 'key G; state'
state: col=0 card=2 "Tasks"
position: col=0 card=2
column: Tasks (3 cards)
card: Task Gamma
```

## Shell Commands

### help shows available commands

```console
$ km sh board.md -c 'help'
km-sh commands:

Navigation:
  move_up, move_down, move_left, move_right
  jump_top, jump_bottom
[...]
```

### help <command> shows specific help

```console
$ km sh board.md -c 'help move_up'
Move cursor up one card
```

### quit exits the shell

```console
$ km sh board.md -v -c 'move_down; quit; move_down; state'
! ...MOVE_DOWN...
state: col=0 card=1 "Tasks"
```

## View Command

### view renders ASCII board

```console
$ km sh board.md -c 'view'
Path: [...]

▶ [0] Tasks (3)
  →  ○ Task Alpha
     ○ Task Beta
     ○ Task Gamma
```

## Error Handling

### Unknown command shows error

```console
$ km sh board.md -c 'unknown_command'
error: Unknown command: unknown_command
```

### Empty command is ignored

```console
$ km sh board.md -c '; ; state'
position: col=0 card=0
column: Tasks (3 cards)
card: Task Alpha
```

### Comment lines are ignored

```console
$ echo -e "# this is a comment\nmove_down\nstate" | km sh board.md
state: col=0 card=1 "Tasks"
position: col=0 card=1
column: Tasks (3 cards)
card: Task Beta
```
