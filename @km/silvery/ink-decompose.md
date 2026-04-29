---
id: "@km/silvery/ink-decompose"
aliases:
  - km-silvery.ink-decompose
  - km-silvery-ink-decompose
created_by: claude:474834b0
created_at: 2026-03-10T19:37:03Z
closed_at: 2026-03-10T19:49:20Z
close_reason: "Rewrote withInk() to compose withInkCursor() + withInkFocus().
  Removed InkErrorBoundary (now in silvery core), removed createInkWrapRoot.
  File: 435 → 322 lines, withInk() body: ~10 lines."
---

# [x] Decompose withInk() into pipe(withInkCursor(), withInkFocus()) + default ErrorBoundary @km/silvery #task #P2 @claude:474834b0

Final step: withInk() becomes pure composition of the adapter plugins. ErrorBoundary moves to silvery's default Root. WithInkOptions reduces to zero-config. The 435-line with-ink.ts shrinks to ~80 lines of adapters. Clean incremental migration path: users can drop individual Ink adapters as they adopt silvery-native APIs.