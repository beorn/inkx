---
id: "@km/_orphan/t8pw"
aliases:
  - km-t8pw
created_at: 2026-01-15T15:50:23Z
closed_at: 2026-01-15T23:52:57Z
---

# [x] mdtest: Add custom command/shell support (cmd= attribute) @km/_orphan #feature #P2

Allow mdtest console blocks to specify a custom command interpreter instead of bash via cmd="..." attribute.

This enables interactive testing of REPLs like km sh where state persists between commands:

```console cmd="km sh board.md --prompt='> '"
$ key j
$ state
cursor: [0,1]
```

Implementation:
1. Add --prompt flag to km sh (outputs prompt when ready for input)
2. Add cmd= and prompt= parsing to mdtest fence info
3. Create CmdSession class in mdtest for persistent subprocess management
4. Integrate CmdSession into mdtest execution flow

See plan: ~/.claude/plans/robust-hopping-moler.md