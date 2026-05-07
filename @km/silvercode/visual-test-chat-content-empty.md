---
aliases:
  - km-silvercode.visual-test-chat-content-empty
  - km-silvercode-visual-test-chat-content-empty
created_at: 2026-05-07T02:11:29.992Z
_stub: true
closed_at: 2026-05-07T04:13:03.824Z
closeReason: "Fixed in 7468fa321: render-harness uses incremental:false to
  sidestep silvery's STRICT mismatch at (0,22) on Welcome→Chat transitions, plus
  app.rerender(tree) after each emit + app.unmount() on dispose to ensure React
  reconciler commits and avoid leak between tests. Visual test suite now
  passes."
---

After bg agent's deferred-rect timing shift + chat-projection refactor, visual tests in apps/silvercode/tests/visual/ render the Welcome banner instead of chat content. Symptom: state.messages stays empty even though events reach session.subscribe handlers (verified: 12 events received for 6-event helloWorld script x 2 handlers). The Welcome panel renders because hasVisibleTranscriptContent(legacyMessages) returns false. Affects 17 tests in scenarios.test.tsx, _smoke.test.tsx, markdown.test.tsx, autolinks.test.tsx, contract.live.test.tsx, message-list-sticky-bottom.test.tsx, queue-ux.test.tsx, queue-option-b.test.tsx, url-via-handlers.test.tsx. Partial fix shipped in 263b488ca (render-harness app reference capture) — frame now renders Welcome instead of empty buffer. Remaining: investigate why state.messages doesn't update despite events reaching the controller's store.apply(). Hypotheses: (1) events go to a different store than ChatPane reads; (2) controller has 2 sessions and ChatPane reads the wrong handle; (3) reducer rejects certain event shapes; (4) React useStoreSignal isn't subscribing in time.

