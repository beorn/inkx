---
propsRaw:
  key: "value) in TUI @km/tui #feature #P2 @claude:50d15db6"
props:
  key:
    type: text
    value: "value) in TUI @km/tui #feature #P2 @claude:50d15db6"
id: "@km/tui/prop-highlight"
aliases:
  - km-tui.prop-highlight
  - km-tui-prop-highlight
created_by: claude:50d15db6
created_at: 2026-02-17T22:40:48Z
closed_at: 2026-02-17T22:45:25Z
owner: bjorn@stabell.org
assignee: claude:50d15db6
---

# [x] Syntax-highlight inline properties ( ^prop-highlight

Inline properties (key:: value) are currently shown as raw text. Highlight them:

- Keys: dim/cyan
- Values: colored by type (links blue, numbers yellow, dates green)
- Separator (::): dim

Compatible with Logseq/Dataview/Tana/Roam key:: value syntax.
See docs/ref/markdown.md § Inline Properties for syntax reference.

