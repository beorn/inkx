---
id: "@km/_orphan/b9mu"
aliases:
  - km-b9mu
created_at: 2026-01-19T14:51:16Z
closed_at: 2026-01-20T00:49:06Z
---

# [x] Remove command-bridge.ts state conversion @km/_orphan #task #P1

After TUI uses @km/board BoardState directly, command-bridge.ts becomes unnecessary.

Current command-bridge.ts does:
1. boardStateToCommandContext() - converts TUI state to command context
2. processKeyThroughCommands() - routes keys to commands

After migration:
- TUI's boardState IS the command context (no conversion)
- processInkKey() can be called directly
- Remove boardStateToCommandContext()
- Simplify to just key normalization

This eliminates the per-keypress state conversion overhead.