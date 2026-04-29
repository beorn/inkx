---
id: "@km/_orphan/ux86i"
aliases:
  - km-ux86i
created_by: claude:b509d761
created_at: 2026-02-10T12:11:04Z
closed_at: 2026-02-18T08:14:06Z
---

# [x] Instrumented layout mode: debug flag for fingerprint/cache tracing @km/_orphan #task #P3 @claude:5f0aee02

Add a debug mode to layout-zero.ts that records every fingerprint check (hit/miss), cache lookup (hit/miss/eviction), parent override (original vs overridden size), and measureNode save/restore. When enabled, two consecutive layout passes can be diffed to find where they diverge — the key diagnostic for incremental layout bugs. Chrome's LayoutNG has similar internal tracing. Should be zero-cost when disabled (compile out or dead-code-eliminate). See docs/incremental-layout-bugs.md Debugging Methodology section.