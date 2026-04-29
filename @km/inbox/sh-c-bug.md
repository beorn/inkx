---
id: "@km/_orphan/sh-c-bug"
aliases:
  - km-sh-c-bug
created_at: 2026-01-25T23:44:04Z
closed_at: 2026-01-27T08:38:41Z
assignee: beorn
---

# [x] km sh -c doesn't preserve state between semicolon-separated commands @km/_orphan #bug #P1 @beorn

Bug discovered while fixing test expectations in @km/_orphan/fix-sh-tests.

## Issue

`km sh board.md -c 'command1; command2'` doesn't preserve state between commands.

Example:
```bash
km sh board.md -c 'j; state'
# Expected: cursor moves from [0] to [0,1]
# Actual: cursor stays at [0]
```

## Root Cause

The -c mode parses semicolon-separated commands correctly but doesn't persist state between them. Each command executes with fresh state.

## Working Workaround

REPL mode DOES work correctly:
```markdown
\`\`\`console cmd="km sh board.md"
$ j
$ state
# Shows cursor correctly moved
\`\`\`
```

## Code Location

apps/@km/_orphan/cli/src/commands/sh.ts:
- parseCommandString() splits on semicolons correctly
- runShell() executes all commands but state doesn't persist

## Impact

10 test files currently disabled because they use -c mode:
- cursor-navigation.test.md-disabled
- history.test.md-disabled  
- json-mode.test.md-disabled
- key-sequences.test.md-disabled
- keys.test.md-disabled
- mutations.test.md-disabled
- path-navigation.test.md-disabled
- selection.test.md-disabled
- view-controls.test.md-disabled
- views.test.md-disabled

## Fix Approach

Investigate runShell() in @km/repl to ensure state is threaded through all command executions.