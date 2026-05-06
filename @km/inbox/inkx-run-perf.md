---
mentions:
  - km
id: "@km/inbox/inkx-run-perf"
aliases:
  - km-inkx-run-perf
  - "@km/_orphan/inkx-run-perf"
created_at: 2026-02-03T22:43:30Z
closed_at: 2026-02-04T09:49:02Z
---

# [x] inkx: run() should not pay overhead for testing/debugging concerns @km/_orphan #task #P2

run() and createApp().run() currently compute ansi (bufferToStyledText) on every render even though it's only used for debugging. The Buffer type returned from doRender() eagerly computes both text and ansi representations.

Proposed: make ansi a lazy getter so production rendering only pays for bufferToText(). Similarly, review what RunHandle exposes — the handle should be lightweight in production, with testing/debugging fields computed on demand.

Areas to review:

- Buffer.ansi: should be lazy (getter that calls bufferToStyledText on first access)
- Buffer.nodes: expose only when needed
- RunHandle.text: currently re-computed on every render — consider lazy
- doRender() in both run.tsx and create-app.tsx

