---
mentions:
  - km
  - claude
id: "@km/tui/bare-ids-still"
aliases:
  - km-tui.bare-ids-still
  - km-tui-bare-ids-still
created_by: claude:d697f216
created_at: 2026-02-25T14:44:54Z
closed_at: 2026-02-25T17:19:01Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Bare blockref/wikilink IDs still showing instead of resolved titles @km/tui #bug #P1 @claude:d697f216

Screenshot shows raw IDs in card body text:

- `See ^1203783492981970` — bare blockref, no resolution
- `See <^1203717363310394>` — blockref in angle brackets, no resolution

These should display the target node's title instead of the raw ID.

Previous fix attempt: link-resolver agent (@km/tui/raw-id-tasks) added resolution in inline-parser.ts and InlineComponents.tsx. But these cases still show bare IDs.

Investigation needed:

1. Check if the inline parser handles `^` prefix blockrefs (not just `[[wikilinks]]`)
2. Check if the resolution lookup works for Asana-imported IDs (numeric)
3. The `<^id>` syntax may be a different parse path than `^id`

