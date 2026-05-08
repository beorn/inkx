---
aliases:
  - km-tui.explore-km-view-invariants
  - km-tui-explore-km-view-invariants
created_at: 2026-05-08T22:41:02.816Z
---

# Explore km view cursor navigation to exercise runtime invariants #task #P0 @agent/4

Use `$explore` / exploratory TUI testing to cursor around `km view` and actively exercise runtime invariants after the stale cursor / stale column crash fixes.

Acceptance:

- Run `km view` against real backlog/agent boards, including `@agent`, `@agent/3`, and `@agent/4`.
- Move across columns/cards, collapse/expand, toggle task markers, and follow/edit enough nodes to trigger selection and projection refresh paths.
- Capture any invariant failure dump paths, exact command, and minimal navigation sequence.
- If no crash reproduces, record the exercised paths and terminal/session details.
