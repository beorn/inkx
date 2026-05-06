---
mentions:
  - km
  - claude
id: "@km/tui/md-prefix-convert"
aliases:
  - km-tui.md-prefix-convert
  - km-tui-md-prefix-convert
created_by: claude:97217d5d
created_at: 2026-02-16T10:45:09Z
closed_at: 2026-02-16T11:06:49Z
owner: bjorn@stabell.org
assignee: claude:22727d86
---

# [x] Markdown prefix conversion: type '- ', '# ', '1. ', '[] ' to convert node type; backspace to strip @km/tui #feature #P2 @claude:22727d86

Roam/Notion-style markdown prefix conversion during inline editing. Two behaviors:

## 1. Prefix Conversion (typing)

When the user types a recognized markdown prefix at the START of a node's content in edit mode, convert the node type and strip the prefix from content:

| Prefix typed        | Resulting type | Notes                                             |
| ------------------- | -------------- | ------------------------------------------------- |
| -                   | li (bulleted)  | Unordered list item, marker='-'                   |
| *                   | li (bulleted)  | Unordered list item, marker='*'                   |
| 1.                  | li (numbered)  | Ordered list item                                 |
| #                   | oi (section)   | h1 depth heading/section                          |
| ##                  | oi (section)   | h2 depth                                          |
| ###                 | oi (section)   | h3 depth                                          |
| []  or [ ]          | task trait     | Add task_marker '[ ]', keep type                  |
| [x]                 | task trait     | Add task_marker '[x]' (done)                      |
| >                   | quote          | Block quote                                       |
| ---  or ***  or ___ | hr             | Horizontal rule (integrates with @km/tui/hr-edit) |
| `                   | code           | Code block (fenced)                               |

Detection: trigger when user types the space (or newline for code fence) after the prefix. Strip the prefix from displayed content.

### HR Integration

The `---` prefix conversion integrates with @km/tui/hr-edit: typing '---' + space converts the node to type=hr with content='---'. The HR edit spec handles subsequent editing, display (centered), and type reversion (backspace strips hr back to p).

## 2. Backspace Stripping (at beginning of line)

When user presses backspace at position 0 (beginning of content), strip features in priority order BEFORE merging with previous node:

1. **First**: If node has task trait → remove task_marker (keep type)
2. **Then**: If node type is non-paragraph (li, h, hr, quote, code, etc.) → convert to p
3. **Finally**: If already a plain p with no traits → merge with previous node (existing behavior)

This creates a progressive 'undo' of the node's special formatting before destructive merge.

## Node Types Reference (@km/_orphan/core)

Block types: p, h, code, quote, table, hr, html, math
Item types: oi (outline item), li (list item)
Link type: link

Not all types make sense for prefix conversion (table, html, math are complex structures). The prefixes above cover the common markdown shortcuts.

## Reference

Inspired by Decker's block editing model and Roam/Notion's markdown shortcuts.

