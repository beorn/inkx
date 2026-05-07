---
mentions:
  - km
id: "@km/tui2/3-implement-renderrich-for-inline-fields-wiki-links-"
aliases:
  - km-tui2.3
  - km-tui2-3
  - "@km/tui2/3"
created_at: 2026-01-16T22:08:13Z
closed_at: 2026-01-16T22:32:39Z
---

# [x] Implement renderRich() for inline fields, wiki links, markdown @km/tui2 #task #P2

TUI1 has rich text rendering that TUI2 is missing:

**Inline field stripping**: `[due:: 2024-01-15]` → hidden
**Wiki link styling**: `[[note]]` → dim underlined
**Markdown**: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`

**Reference**: apps/@km/tui/packages/@km/_orphan/ink/src/text/
**Target**: apps/@km/tui/packages/@km/_orphan/opentui/src/text/ (new)

