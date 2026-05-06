---
mentions:
  - km
id: "@km/storage/parser-greedy-after-props"
aliases:
  - km-storage.parser-greedy-after-props
  - km-storage-parser-greedy-after-props
created_by: claude:adeac868
created_at: 2026-04-25T06:00:10Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] Sigil placed after inline props gets absorbed into prop value (greedy scan to EOL) @km/storage #bug #P2

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

@sigil placed **after** inline props gets absorbed as text into the previous prop's value.

## Example

`- [ ] Task description due:: 2026-04-30 priority:: P1 @heisann`
yields priority='P1 @heisann' and no @heisann mention is registered.

## Workaround documented

'Place sigils before props.'

## Real fix

Prop-value parser should recognize @sigil and +project boundaries inside its scan, not greedy-eat to EOL.

