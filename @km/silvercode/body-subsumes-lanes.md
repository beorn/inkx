---
aliases:
  - km-silvercode.body-subsumes-lanes
  - km-silvercode-body-subsumes-lanes
created_at: 2026-05-06T23:58:31.541Z
---

# Silvercode: Body becomes public Content surface; demote Prose/Wide/Full/Right to internal #feature #P3

Make `Content.Body` (with `width="prose|wide|full|auto"`) the canonical public surface. Demote `Content.Prose`, `Content.Wide`, `Content.Full`, `Content.Right` to internal lane primitives that Body composes. Drop Body's `expanded` boolean (width covers it). Drop Row's public `gap` prop (already `void gap` internally — disabled).

## Why

Audit of apps/silvercode (2026-05-06) shows two parallel APIs in active use:

- `<Content.Body width="prose">` — 8+ uses (Chat, NotificationBlock, ChatMessageSummary, SessionUpdateList, MarkdownView indirectly)
- `<Content.Prose>`, `<Content.Wide>`, `<Content.Full>`, `<Content.Right>` — 4+ direct uses (MarkdownView, NotificationEventRow, SessionUpdateList, storybook)

Both express the same idea: "render this content at width X." Body is the more ergonomic form (one component, one prop) and dominant in usage. Direct lane components are mostly used inside Content.tsx itself for auto-pick logic.

Two parallel APIs = two AGENTS.md doc entries, two mental models, double the surface to evolve.

## Approach

1. Internalize ProseLane/Wide/Full/Right (drop from `Content.*` namespace export at Content.tsx:756).
2. Update apps/silvercode call sites to use Body:
   - `<Content.Prose>{x}</Content.Prose>` → `<Content.Body width="prose">{x}</Content.Body>`
   - `<Content.Right>{x}</Content.Right>` → consider Aside pattern (see `@km/silvercode/delete-aside-layout`)
3. Drop Body's `expanded` boolean — `width="wide"|"full"` covers the cases.
4. Drop Row's public `gap` prop (currently `void gap` internally at Content.tsx:213).
5. Update `apps/silvercode/AGENTS.md:17` to remove the parallel-API line.

## Files in scope

- apps/silvercode/src/components/Content.tsx (export changes, drop `expanded`, drop `gap`)
- apps/silvercode/src/components/MarkdownView.tsx
- apps/silvercode/src/components/NotificationEventRow.tsx
- apps/silvercode/src/components/SessionUpdateList.tsx
- apps/silvercode/src/components/Chat.tsx (uses Body but verify gap/expanded usage)
- apps/silvercode/storybook/stories/Content.layout.story.tsx
- apps/silvercode/AGENTS.md

## Acceptance

- `Content.Prose`, `Content.Wide`, `Content.Full`, `Content.Right` not in public namespace export
- No `expanded` prop on Body type
- No `gap` prop on Row type
- `bun vitest run apps/silvercode` green
- AGENTS.md reflects single API

## Tracks

This bundles G (drop expanded), H (drop gap), and D (Body-subsumes-lanes) from /big session 2026-05-06. Recommended sequencing: ship after `@km/silvercode/measurement-ceremony-collapse` to avoid touching Content.tsx twice.
