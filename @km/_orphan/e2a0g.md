---
id: "@km/_orphan/e2a0g"
aliases:
  - km-e2a0g
created_by: claude:b509d761
created_at: 2026-02-10T22:42:18Z
closed_at: 2026-02-12T14:10:35Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Span-instrument input event handling and investigate cursor performance @km/_orphan #feature #P2 @claude:586bad48

Add spans around the TUI input event processing pipeline so each keypress gets timed like a web request. Should capture: time since last keypress (inter-event gap), total processing time, and phase breakdown (dispatch, state mutation, render). Use this to investigate why cursor navigation (j/k/h/l) isn't faster — the inkx:pipeline content phase takes ~155ms per keypress which dominates.