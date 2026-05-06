---
_stub: true
id: "@km/silvery/use-deferred-box-rect-and-post-commit-observers"
aliases:
  - km-59vb
---


## Update 2026-05-06 — recommendation: deferred-only, deprecate the synchronous form

User pushback: "why not ONLY have deferred useBoxRect?" — and on reflection that's the right call.

The synchronous reactive form (`useBoxRect()` returning the *in-flight* measurement during render) has no use case the deferred form doesn't cover:

1. **Layout decisions** — broken by the synchronous form (the bug class this whole bead is about). Deferred form: idempotent across passes, one-frame-late, convergence completes in 1 pass.
2. **Observation** — already idempotent under deferred semantics. "Previous committed rect" is exactly what observers want.

Web's native model is post-commit (ResizeObserver). silvery's multi-target ambition means matching that contract. The escape hatch for "I really want sync" is already the callback form (`useBoxRect((rect) => ...)`), which is itself idempotent.

**Revised plan**:

1. New canonical reactive form: `useBoxRect()` returns the last-committed rect (deferred). Idempotent across all passes in one batch. After commit, next render sees the new value.
2. Callback form unchanged: `useBoxRect((rect) => void)` — observer pattern, zero re-renders.
3. Renderer phase split: Layout → Commit → Observers. Observers fire AFTER commit, never during.
4. Migration: existing `useBoxRect()` reactive form gets a one-frame-later semantic by default. Some components (Image, Divider, ProgressBar) may show a "best-effort fallback" on first paint, then the correct value one frame later — same total number of renders, no cascading.
5. SILVERY_STRICT runtime check: a render that READS useBoxRect AND WRITES layout-affecting props within the same commit is no longer possible to construct (the read returns a stable value across the entire commit's pass batch). The check is unnecessary — eliminated by construction.

**Breaking change scope**: silvery internal — Image, Divider, ProgressBar, MeasuredBox each need a pass to confirm the one-frame-late paint is acceptable. silvercode: Content.tsx benefits directly. Test/prod parity: `createFixedSize` and `createSize` behave identically because observers fire post-commit either way.

**Why this beats "add a separate useDeferredBoxRect"**: two hooks with subtle different semantics is the worst of both worlds — call sites pick the wrong one and we get the same class of bug. One hook with the right semantics + a callback escape hatch is the canonical answer.
