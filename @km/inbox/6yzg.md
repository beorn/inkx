---
id: "@km/_orphan/6yzg"
aliases:
  - km-6yzg
created_at: 2026-01-20T07:44:06Z
closed_at: 2026-01-20T07:47:08Z
---

# [x] Fix select_toggle shortcut documentation mismatch @km/_orphan #task #P4

## Problem
- packages/@km/_orphan/commands/src/commands/selection.ts:8 defines shortcuts: ["v"]
- packages/@km/_orphan/commands/src/keybindings.ts:157 binds 'v' to cycle_view_mode instead

The command definition is misleading.

## Fix
Either:
1. Remove "v" from select_toggle shortcuts array (since it's overridden)
2. Or document in comment that keybindings.ts overrides this