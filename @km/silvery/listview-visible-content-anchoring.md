---
tags:
  - feature
  - P0
mentions:
  - km
id: "@km/silvery/listview-visible-content-anchoring"
aliases:
  - km-silvery.listview-visible-content-anchoring
  - km-silvery-listview-visible-content-anchoring
created_at: 2026-05-03T00:00:00.000Z
type: feature
priority: P0
status: done
closed_at: 2026-05-04T00:00:00.000Z
close_reason: "Shipped in silvery 79f7359f. ListView has default-on maintainVisibleContentPosition backed by useScrollAnchoring and HeightModel row/index APIs. Tests: vendor/silvery focused strict ListView/HeightModel suite, 10 files / 61 tests; vendor/silvery typecheck passed."
---

# [x] [feature] ListView visible-content scroll anchoring @km/silvery #feature #P0

blocks:: [[@km/silvery]]
related:: [[@km/silvercode/chat-layout-quality-plateau]]
related:: [[@km/silvercode/chat-component-hierarchy]]
related:: [[@km/silvery/listview-followpolicy-split]]

## Problem

Expanding a disclosure row or receiving content above the viewport can move the line the user is looking at. Silvercode needs a browser-like scroll anchoring primitive at the Silvery list layer so chat/activity transcripts preserve visible position by default.

The primitive should not be a Silvercode workaround. It belongs in `ListView`/scroll infrastructure and should compose with `follow="end"` tail pinning and explicit user/programmatic scrolls.

## Design

`ListView` gets `maintainVisibleContentPosition`, defaulting to enabled. It preserves the top visible logical item and its row offset across item height/content changes.

The escape hatch exists for intentional scroll surfaces:

- raw log replay where inserted history should move the viewport exactly as modeled;
- animation/timeline surfaces where visual movement is the point;
- tests and custom virtualizers that need to observe unanchored scroll math.

Precedence:

1. User and imperative scroll operations establish a new anchor and are never undone by automatic preservation.
2. `follow="end"` remains the tail-pinning policy when the viewport is at the end.
3. `maintainVisibleContentPosition` preserves the current visible item when content above it changes.

## Acceptance Criteria

- [x] `ListView` exposes `maintainVisibleContentPosition?: boolean`, default enabled.
- [x] Content inserted above the viewport preserves the top visible item and row position.
- [x] Height changes above the viewport preserve the top visible item and row position.
- [x] `maintainVisibleContentPosition={false}` leaves the viewport unanchored for callers that need raw scroll behavior.
- [x] User/imperative scroll updates establish a new anchor; auto anchoring does not snap back to the previous view.
- [x] `follow="end"` still pins the tail while at end and still pauses when the user scrolls away.
- [x] Focused Silvery tests cover the behavior at the owning layer.

## Implementation Notes

- Use logical item keys when available, falling back to index keys consistently with `ListView`.
- Preserve row offsets in `HeightModel` row space so variable-height items and wrapping work.
- Keep this separate from the existing Box `scrollTo` same-intent guard. That guard prevents repeated `scrollTo` from yanking a visible target; this bead preserves the visible viewport when rows before it change.

## Verification

- `SILVERY_STRICT=1 bun vitest run --dir vendor/silvery tests/features/height-model.test.ts tests/ui/list-view-visible-content-anchoring.test.tsx tests/ui/list-view-imperative-scroll.test.tsx tests/features/listview-follow-end.test.tsx tests/features/listview-sticky-bottom.test.tsx tests/features/listview-height-independent-scrollbar.test.tsx tests/features/listview-scroll-overshoot.test.tsx tests/features/listview-scrollcap-tall-items.test.tsx tests/features/listview-flex-scrollbar.test.tsx tests/features/box-scroll-stable-on-growth.test.tsx` — 10 files, 61 tests passed.
- `cd vendor/silvery && bun run typecheck` — passed.
