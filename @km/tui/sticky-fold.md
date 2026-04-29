---
id: "@km/tui/sticky-fold"
aliases:
  - km-tui.sticky-fold
  - km-tui-sticky-fold
created_by: Bjørn Stabell
created_at: 2026-04-06T20:47:56Z
closed_at: 2026-04-07T06:10:31Z
close_reason: "Phase 2 fixed via dfae78e99 (skip in fold-all/unfold-all) +
  64de3d944 (vs keybinding + toggle_sticky_fold ViewOp; v | for
  pane_split_vertical) + cd21be909 (count alignment) + 3fe831dc3 (inverse fold
  marker getFoldMarker(sticky)) + a25aa8a39 (cycle + fold-all immunity tests).
  Phase 1 scaffolding from 27fa68552 (state plumbing). Three-state cycle: pin →
  flip-and-collapse → clear. Sticky marker: inverse on the fold glyph across
  regular/workflowy/nerdfont/task icon styles. 539/539 km-commands tests pass;
  2136/2137 km-tui tests pass (1 pre-existing symlink failure unrelated)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Sticky fold — persistent fold state immune to fold-all/unfold-all @km/tui #feature #P2 @Bjørn Stabell

Generalize 'collapse' into 'sticky fold' — a fold (or unfold) state that persists in preferences and is NOT affected by global fold/unfold commands.

## Concept

Today: 
- Regular fold (H/L) — transient, affected by fold-all/unfold-all
- Collapse (vc) — only on columns, distinct visual

Proposed:
- Regular fold (H/L) — unchanged, transient
- Sticky fold (vs) — persists per-node, immune to fold-all/unfold-all
- Sticky unfold — same mechanism, opposite state
- Works at all levels: columns, cards, sub-items

## Behavior

- vs on a folded item → makes the fold sticky (persists)
- vs on an unfolded item → makes the unfold sticky (persists, prevents fold-all)
- vs on already-sticky item → toggles between sticky-folded and sticky-unfolded
- L on a sticky-folded item → temporarily unfolds, but stickiness preserved (sticky state restored on next fold-all)
- Or: L on sticky-folded → removes stickiness AND unfolds (cleaner mental model)

## Visual Design

- Regular fold: ▸ (right triangle, current)
- Regular unfold: ▾ (down triangle, current)
- Sticky folded: ▸ in inverse (background highlight) — looks like a 'pinned' fold
- Sticky unfolded: ▾ in inverse — looks like a 'pinned' unfold
- Folded column gets the same icon as cards (today columns use a different visual)

## Persistence

- Stored in preferences/config (e.g., .km/sticky-folds.json) keyed by node ID
- Survives restart
- Survives cursor movement, navigation, fold-all/unfold-all
- Cleared when node is deleted

## Naming

- 'collapse' → 'sticky' (more accurate)
- vc → vs (s for sticky)
- v c keybinding deprecated but redirects to vs for muscle memory

## Prior Art

Researched: only Emacs org-mode has true sticky folding (VISIBILITY property per heading). VS Code, Notion, Obsidian, Workflowy, Logseq all conflate persistence with immunity to bulk ops. km would be the second system to implement it correctly, with better visual design.

## Implementation

1. Add stickyFoldDepths Map<nodeId, fold-state> to per-pane state
2. Persist to .km/sticky-folds.json on change
3. Load on startup
4. Modify fold-all/unfold-all to skip sticky nodes
5. Modify fold marker rendering to show inverse icon for sticky state
6. Add vs keybinding (toggle sticky)
7. Apply to columns (replace 'collapse' mechanism)
8. Migration: existing collapsed columns become sticky-folded