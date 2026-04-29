---
id: "@km/_orphan/7kzc"
aliases:
  - km-7kzc
created_at: 2026-01-15T14:55:21Z
closed_at: 2026-01-16T07:54:00Z
---

# [x] km sh: verbose mode outputs JSON action trace to stderr @km/_orphan #task #P2

Implement verbose mode (-v) for km sh that outputs JSON action events to stderr.

## Context
This work was started but blocked by the ongoing tree model refactoring (board → tree).

## What was done
- Added -v/--verbose flag to sh.ts CLI
- Added verbose and stdlog to ShellContext interface
- Updated shellExecutor to output JSON to stderr when verbose mode enabled
- Updated navigation.test.md with stderr expectations using ! prefix

## What remains
1. Fix export mismatches in @km/_orphan/tui-core/src/index.ts after tree refactoring completes
2. Verify tests pass with the simpler pattern format: `! ...ACTION_NAME...`
3. Run full test suite to confirm everything works

## Files modified (may need reconciliation after refactor)
- packages/@km/_orphan/tui-core/src/shellExecutor.ts (ShellContext interface, verbose/stdlog)
- packages/@km/_orphan/tui-core/src/index.ts (exports)
- apps/@km/_orphan/cli/src/commands/sh.ts (-v flag, verbose option)
- apps/@km/_orphan/cli/tests/sh/navigation.test.md (stderr expectations with ! prefix)

## Related
- Closed @km/_orphan/tf3r: mdtest already supports order-independent stdout/stderr matching