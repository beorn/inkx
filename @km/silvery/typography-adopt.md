---
id: "@km/silvery/typography-adopt"
aliases:
  - km-silvery.typography-adopt
  - km-silvery-typography-adopt
created_by: claude:73d7a332
created_at: 2026-03-12T07:28:04Z
closed_at: 2026-03-12T23:36:13Z
close_reason: Adopted Small typography preset across 11 km-tui view files.
  Replaced <Text dimColor> with <Small> for muted/secondary text. Committed and
  pushed.
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Adopt typography presets across km, examples, and docs @km/silvery #task #P2 @claude:73d7a332

Replace manual typography patterns (<Text bold color="$primary">, <Text color="$muted">, etc.) with Typography preset components (H1, H2, H3, Muted, Lead, P, Code, etc.) across:

1. **km app** (apps/@km/tui/): headings, muted text, status text
2. **Examples** (examples/): all demos should showcase typography presets
3. **Docs** (docs/): component docs page, guide updates
4. **Silvery internal**: any silvery components using manual patterns

Also:
- Add Small component (dim + $muted, for fine print)
- Update styling.md with any new patterns
- Add docs/components/typography.md with API reference