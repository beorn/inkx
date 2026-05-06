---
mentions:
  - km
  - claude
id: "@km/silvery/sip3-docs"
aliases:
  - km-silvery.sip3-docs
  - km-silvery-sip3-docs
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:33:07Z
closed_at: 2026-03-11T07:41:31Z
close_reason: Expanded sip 2→3 transition in state-management.md with compelling
  pain moment story (sidebar+detail+palette growth, undo/AI/keybindings all need
  data-as-ops), zero-rewrite guarantee.
owner: bjorn@stabell.org
assignee: claude:e4e70c9a
---

# [x] Polish sip 3 docs: the useState → createModel transition @km/silvery #task #P2 @claude:e4e70c9a

Sip 3 (createModel with updates-as-data) is the critical adoption jump. React devs will ask 'why not just lift state?'

The docs need:

1. **Pain moment story**: Show exact scenario where useState breaks down (shared state across 5 components, need undo, need to serialize actions for AI)
2. **Before/after comparison**: Same app with useState vs createModel — show what you gain
3. **Zero-rewrite guarantee**: Emphasize that sip 1-2 code stays unchanged
4. **Naming clarification**: 'updates' vs React's setState 'updates' — disambiguate clearly

This is the make-or-break moment for advanced adoption. If this transition feels natural, devs will continue to sip 4+. If it feels heavy, they stop at sip 2.

