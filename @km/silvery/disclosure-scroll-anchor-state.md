---
id: "@km/silvery/disclosure-scroll-anchor-state"
aliases:
  - km-silvery.disclosure-scroll-anchor-state
  - km-silvery-disclosure-scroll-anchor-state
created_at: 2026-04-30T23:17:24.669Z
type: bug
priority: P0
closeReason: "Completed: ListView visible-content anchoring and Silvercode
  disclosure rows preserve clicked-row position during expansion; Content.Layout
  no longer remounts by width-key, preserving disclosure state across resize.
  Verification: vendor ListView anchoring/image slice passed 4 files, 28 tests;
  Silvercode turn-activity-summary and content-layout were included in the
  12-file/187-test run."
---

# [x] Disclosure expansion should preserve scroll anchor and expanded state across resize

## Problem

Silvercode transcript disclosure rows currently have two related UI-state failures:

- Click-to-expand on activity summaries/tool rows changes the scroll position, so the line the user clicked moves upward instead of staying on the same screen row.
- Expanded/collapsed state is lost when the terminal or pane resizes. This is likely caused by layout-key/remount paths resetting component-local React state.

## Desired System

Disclosure operations should be able to declare a screen anchor: the line/cell the user clicked. `ListView` and scroll containers should preserve that anchor through content height changes caused by expansion.

Expanded/collapsed state should be keyed by stable semantic ids outside layout-remounted component instances, not by transient local state under width-dependent keys.

## Acceptance

- A regression test expands a row inside a scrolled `ListView` and verifies the clicked line remains at the same screen row after expansion.
- A regression test expands a row, resizes the pane/terminal, and verifies it remains expanded.
- Silvercode activity summaries and tool rows use the shared mechanism rather than local one-off scroll correction.

