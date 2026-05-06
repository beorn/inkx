---
mentions:
  - km
  - claude
id: "@km/inbox/jy8nl"
aliases:
  - km-jy8nl
  - "@km/_orphan/jy8nl"
created_by: claude:b92140a2
created_at: 2026-03-17T08:32:39Z
closed_at: 2026-03-17T15:04:29Z
close_reason: Shared extractSlotTargets() in km-tree. TUI now scans all index
  children for slots, not just sections.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P0: TUI slot resolution disagrees with writer — sections vs paragraphs @km/_orphan #bug #P0 @claude:b92140a2

expandIndexFileColumns() scans indexSections for slot targets, but generateIndexFileContent() emits \![[./child]] as plain paragraph lines. Parsed result is type:p, not mdsection. TUI ignores actual slots and shows raw embed lines in body column. Fix: shared extractIndexLayout() helper used by both storage and TUI.

