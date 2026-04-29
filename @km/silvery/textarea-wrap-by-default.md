---
id: "@km/silvery/textarea-wrap-by-default"
aliases:
  - km-silvery.textarea-wrap-by-default
  - km-silvery-textarea-wrap-by-default
created_by: claude:1eb07bba
created_at: 2026-04-26T05:44:58Z
closed_at: 2026-04-26T06:38:34Z
close_reason: "Shipped: 156f71a4 (silvery). Soft-wrap default with wrap='off'
  opt-out. 4 tests. Session: km-session.0425-evening"
---

# [x] TextArea: long single-line input scrolls horizontally instead of soft-wrapping @km/silvery #bug #P2 @claude:2405c72e

blocks:: [[@km/silvery]]

Repro: in silvercode, type a long sentence (no manual newlines) into the command box — it stays on a single visual row and the box scrolls horizontally with overflow indicator. Expected: soft-wrap to next visual row inside the same logical line; height grows up to max (CommandBox uses Math.min(8, inputValue.split(\n).length) — that doesnt account for visual wrap). Likely root: silvery TextArea wrap policy + CommandBox.tsx:202 height computation. Fix: enable soft-wrap by default in TextArea (or expose wrap=soft prop); CommandBox computes height from wrapped visual lines. Check existing TextArea wrap behaviour first — may already exist behind a prop.