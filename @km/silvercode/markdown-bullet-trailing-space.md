---
mentions:
  - km
id: "@km/silvercode/markdown-bullet-trailing-space"
aliases:
  - km-silvercode.markdown-bullet-trailing-space
  - km-silvercode-markdown-bullet-trailing-space
created_by: claude:cd034ca4
created_at: 2026-04-26T15:38:47Z
closed_at: 2026-04-28T02:30:21Z
close_reason: Test passes — apps/silvercode/tests/visual/markdown-bugs.test.tsx
  (3 tests) all green. Bug resolved by prior fixes; no offending lines detected.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.markdown-bullet-trailing-space
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T08:38:47Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] [bug] markdown bullets render without trailing space — visual test fails @km/silvercode #bug #P2

blocks:: [[@km/silvercode]]

apps/silvercode/tests/visual/markdown-bugs.test.tsx:71 fails: bullets render without a trailing space after the bullet glyph.

## Repro

```
bun vitest run apps/silvercode/tests/visual/markdown-bugs.test.tsx
```

## Failure

`offendingLines` array is non-empty — bullet glyphs (•/●/-) render without a trailing space, breaking the expected '◦ text' shape.

## Suspected cause

Likely related to recent autolink trailing-space work (commit daa743b51) — that fix preserved trailing space after autolinks in *user messages*; bullet rendering may share or analogously violate the same invariant in *assistant markdown*.

## Acceptance

- bun vitest run apps/silvercode/tests/visual/markdown-bugs.test.tsx → all passing
- No regression in autolink trailing-space test (apps/silvercode/tests/visual/autolinks.test.tsx)

