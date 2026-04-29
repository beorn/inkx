---
id: "@km/tui/omnibox-action-panel"
aliases:
  - km-tui.omnibox-action-panel
  - km-tui-omnibox-action-panel
created_by: Bjørn Stabell
created_at: 2026-04-15T00:09:30Z
closed_at: 2026-04-15T00:18:18Z
close_reason: "Redundant with ':' sigil + 'when' clause filtering. The
  Embark/Raycast 'action panel on selected candidate' pattern is already in our
  design: ':' opens the command field, and 'when' predicates filter the result
  list to commands valid for the current cursor (= selected argument row). User
  clarified: ':' works on current selection since it's selecting commands not
  objects; all other sigils select nodes. Cmd+K can be a keyboard alias for ':'
  when the combobox is open — not a new mechanism. Ctrl+{g,m,a,l,c}+Enter
  modifier chords stay as direct-verb shortcuts, covered in
  km-tui.omnibox-two-fields."
---

# [x] Action panel on selected candidate (Embark/Raycast pattern) @km/tui #feature #P2

blocks:: [[@km/tui/omnibox-dialog]], [[@km/tui/omnibox-unified]], [[@km/tui/omnibox-when]]

Explicit 'actions for this object' affordance. After the user selects an argument-field row, pressing Cmd+K (or a similar dedicated key) opens the command field with a visible header like 'Actions for @delei' and the command search pre-filtered to commands whose 'when' predicate evaluates true for the current cursor (the selected argument).

This is an ergonomic polish over the existing Tab-to-command-field flow — same mechanism, more discoverable presentation. /big research (GPT-5.4 + GPT-5.4 Pro, both independently) converged on this as the #1 addition for v1. It addresses the 'premature verb commitment' risk in the current design.

Concretely:
- Tab from argument → general command override (existing)
- Cmd+K from argument → action panel (new): command-field focused, header shows 'Actions for <object>', results filtered to when-valid commands for the cursor type
- The filter uses the same when-clause evaluation Phase 4 adds

Acceptance: (a) Cmd+K on a selected argument opens the command field with a visible 'Actions for <name>' header; (b) command results are pre-filtered by when(ctx) against the current cursor's node type; (c) Tab-to-command-field (general) and Cmd+K (candidate-filtered) coexist — user picks which flow suits their need; (d) journey test covers both paths landing on the same command dispatch.