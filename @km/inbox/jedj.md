---
id: "@km/_orphan/jedj"
aliases:
  - km-jedj
created_at: 2026-01-21T22:45:54Z
closed_at: 2026-01-22T00:13:01Z
---

# [x] Doc/code mismatch: enter_node/go_up_path commands don't exist @km/_orphan #bug #P1

docs/09-commands.md lines 299-300 document:
- `i → enter_node`
- `u → go_up_path`

But actual commands are:
- `i → zoom_inwards`
- `u → zoom_outwards`

The commands `enter_node` and `go_up_path` don't exist in the codebase. The navigation table at lines 151-152 also references these non-existent commands.

Fix: Update docs to use correct command names.