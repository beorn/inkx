---
id: "@km/all/kb-rebind"
aliases:
  - km-all.kb-rebind
  - km-all-kb-rebind
created_by: claude:536645b5
created_at: 2026-02-20T15:44:26Z
closed_at: 2026-02-20T17:03:47Z
---

# [x] Keybinding v2: rebind existing keys to match spec @km/all #task #P2 @claude:d3a7049b

Reassign ~20 keys that are bound to different actions than the v2 spec requires. This is the foundation — everything else depends on correct key assignments.

Key reassignments needed:
- i → edit title (currently zoom_inwards; move zoom to z)
- o/O → new below/above (currently insert is n/p)
- d → cut forward (currently duplicate_node; move duplicate to Cmd+d)
- y → copy/yank (currently unbound)
- p → paste (currently insert_above)
- u/U → undo/redo (currently zoom_outwards; move zoom to z/Z)
- e → archive (currently zoom_in)
- c/C → capture new (currently collapse/ignore)
- z/Z → zoom in/out per press (currently fold_all/unfold_all; move fold to H/L)
- H/L → fold/unfold subtree (currently extend_select)
- J/K → block-by-block nav (currently extend_select; move extend to S-arrows only)
- x → toggle done only (currently cycles all statuses)
- X → cycle all statuses (currently unbound)
- Space → toggle select (currently toggle_detail_pane)
- P → smart pane toggle (currently follow_link)
- {/} → history back/forward (currently [/])
- n/N → search next/prev (currently insert_below)
- </> → fold/unfold all (currently outline depth)
- : → omnibox stub (currently unbound)

Spec: docs/keybindings-v2.md