---
id: "@km/silvery/listview-sticky-bottom"
aliases:
  - km-silvery.listview-sticky-bottom
  - km-silvery-listview-sticky-bottom
created_by: claude:2405c72e
created_at: 2026-04-26T06:00:55Z
closed_at: 2026-04-26T06:38:53Z
close_reason: "Shipped: 0f50ced5 (silvery API) + e00a5f63d (silvercode wiring).
  stickyBottom + onAtBottomChange. 5 + 1 tests. Session:
  km-session.0425-evening"
---

# [x] ListView sticky-bottom auto-follow when at end of list @km/silvery #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

Chat-style sticky scroll behavior. When user is scrolled to the end of a ListView (overscroll indicator showing), auto-follow new items added at the tail. When user scrolls away from the end, disable auto-follow. Re-enable when user returns to the bottom. silvercode's MessageList relies on cursorKey={lastKey} to pin cursor + ensure-visible — but ListView's scrollRow can drift when user scrolls up, and the sticky-vs-not state isn't tracked. Plan: add ListView prop stickyBottom?: boolean (default true for chat-like usage); listview tracks user-scroll-vs-tail-scroll via scroll position vs maxRow; when sticky AND items added: auto-scroll to maxRow. Or simpler: add onAtBottomChange?: (atBottom: boolean) => void callback so consumer can manage sticky state externally. Affects vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx.