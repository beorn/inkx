---
mentions:
  - km
  - claude
id: "@km/silvery/auto-signals"
aliases:
  - km-silvery.auto-signals
  - km-silvery-auto-signals
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:37Z
closed_at: 2026-03-11T07:38:12Z
close_reason: "Deferred to P4. Decision: explicit signal() is clearer and more
  predictable for now. Valtio-style proxy wrapping can be explored after API
  stabilizes. Documented in design doc decisions section."
owner: bjorn@stabell.org
assignee: claude:e4e70c9a
---

# [x] Auto-signaling: Valtio-style proxy wrapping for model state @km/silvery #feature #P4 @claude:e4e70c9a

Explore whether `state: { count: 0 }` should auto-wrap values in signals (Valtio-style proxy), removing the need for explicit `signal()` calls in createModel.

Pros:

- Reduces boilerplate — `state: { count: 0 }` vs `state: () => ({ count: signal(0) })`
- More intuitive for newcomers (plain JS objects)
- Vue 3's reactive() does this successfully

Cons:

- Less transparent — magic proxy behavior
- Potential surprising behavior with nested objects
- Debugging proxy state is harder

Decision needed before API ships. Open question #6 in design doc.

