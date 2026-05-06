---
mentions:
  - km
id: "@km/silvery/proto-rich-clipboard"
aliases:
  - km-silvery.proto-rich-clipboard
  - km-silvery-proto-rich-clipboard
created_by: Bjørn Stabell
created_at: 2026-04-06T09:09:54Z
closed_at: 2026-04-06T09:24:17Z
close_reason: "Rich clipboard: SelectionFeature.copy() sends text/plain +
  text/html via OSC 5522 when available, falls back to OSC 52. extractHtml()
  converts buffer cells to styled HTML. 13 tests. Silvery commit d5b8bbc."
owner: bjorn@stabell.org
---

# [x] OSC 5522 → rich copy (text/plain + text/html from selection) @km/silvery #feature #P3

When user copies text from km via selection, provide both text/plain and text/html (markdown rendered) via OSC 5522. Paste in Notion/Slack/docs gets formatted text. Falls back to plain OSC 52.

## Why

km stores markdown. When you select and copy board content, the clipboard should contain both plain text and HTML. This makes km a first-class citizen in copy/paste workflows.

## Depends on

@km/silvery/interactions-runtime (selection), @km/silvery/clipboard-paste-cleanup

