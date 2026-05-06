---
mentions:
  - km
id: "@km/tui/body-rework"
aliases:
  - km-tui.body-rework
  - km-tui-body-rework
created_by: claude:fcaad2fa
created_at: 2026-02-18T16:46:15Z
closed_at: 2026-02-18T21:06:57Z
owner: bjorn@stabell.org
---

# [x] Import: map Asana notes to .body nodes instead of blockquote @km/tui #task #P2

Currently Asana html_notes/notes are converted to markdown via Turndown, then stored as a single type='quote' child node under the task. This loses structural information (headers become flat text, lists become flat text in a blockquote). Should be parsed into proper body child nodes (h, p, li, code, quote, hr, etc.) — preserving the rich structure of Asana task descriptions. Need to analyze actual Asana task notes to decide: should headings be downgraded to bold (to keep body flat) or preserved as real heading nodes? The body should be stored as .body content, not a blockquote.

