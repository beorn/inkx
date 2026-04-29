---
id: "@km/silvercode/prose-primitive"
aliases:
  - km-silvercode.prose-primitive
  - km-silvercode-prose-primitive
created_by: claude:0940ca20
created_at: 2026-04-24T21:47:53Z
closed_at: 2026-04-25T06:00:12Z
close_reason: "Shipped: vendor/silvery 773f5bbe (Prose component + tests +
  docs), km main 0da58709c (4 silvercode components migrated). Both commits +
  test files referenced in agent task report."
started_at: 2026-04-25T05:46:59Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.prose-primitive
    depends_on_id: km-silvercode.wrap-ergonomic
    type: parent-child
    created_at: 2026-04-24T14:51:12Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] <Prose>/<MessageBody> component: drop-in text-wrapping primitive that encapsulates flex/shrink/minWidth/overflow @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode/wrap-ergonomic]]

## Goal

A silvery primitive that wraps long-form text (markdown, user messages, assistant responses) without the consumer thinking about flex-grow / flex-shrink / min-width / overflow.

## Motivation

Silvercode hit the wrap bug three times in two months because the correct flex-chain for text wrapping is non-obvious AND contradicts CSS intuition. Every developer will trip on it until the framework gives them a single component to drop in.

## Proposed API

```tsx
import { Prose } from "silvery"

// Usage
<Prose>
  <MarkdownView source={text} />
</Prose>

// or for plain text
<Prose wrap="wrap">Long paragraph of text…</Prose>
```

Internally `<Prose>` is a Box with the known-good flex config for text wrapping:
- flexDirection="column"
- flexShrink={1}
- minWidth={0}
- whatever else flexily needs for correct measurement

And it tells flexily "my children wrap" so measurement takes the right path.

## Relationship to @km/silvery/wrap-measurement

`<Prose>` is the ergonomic surface. `km-silvery.wrap-measurement` is the root fix for the underlying flexily measurement bug. Ship `<Prose>` even if the root bug isn't fixed yet — it encapsulates the current workaround and gives consumers a stable API. When the flexily bug is fixed, the internals of `<Prose>` simplify but its API stays.

## Acceptance

- `<Prose>` exported from silvery barrel
- Docs entry in `vendor/silvery/docs/components/Prose.md`
- Silvercode's AssistantBlock + UserMessageBlock + MarkdownView use it instead of hand-rolling the flex chain
- Visual regression test in silvery's `tests/features/` showing a 1500-char paragraph wraps at container boundary
- Zero consumer-level flex-shrink/min-width props needed