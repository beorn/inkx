---
mentions:
  - km
id: "@km/inbox/nfqz"
aliases:
  - km-nfqz
  - "@km/_orphan/nfqz"
created_at: 2026-01-15T16:32:19Z
closed_at: 2026-01-15T22:46:24Z
---

# [x] TUI2: Raw inline fields and wikilinks shown instead of parsed @km/_orphan #bug #P2

TUI2 shows raw Obsidian/Dataview syntax instead of parsing it:

- Shows '[due:: 2024-12-31]' instead of hiding or formatting the due date
- Shows '[[wikilink]]' raw syntax
- Shows '[priority:: 1]' raw syntax
- Shows '@1' as a separate line instead of inline

TUI1 properly hides or formats these inline fields.

