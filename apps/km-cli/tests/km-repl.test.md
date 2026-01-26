---
mdtest:
  plugin: ./km-repl.ts
  fixture: two-columns
---

# km-repl Plugin Test

Test in-process km command execution (8-15x faster than subprocess).

## Setup

```console
$ km sync
Syncing .km/state.db with files (repo ...)
[...]
✓ Synced ... change(s) in ... directories (...ms)
```

## List Command (in-process execution)

```console
$ km list
Test Board
## Tasks
[ ] Task A
[ ] Task B
[ ] Task C
## Done
[x] Task D
7 node(s)
```
