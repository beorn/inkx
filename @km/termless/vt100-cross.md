---
id: "@km/termless/vt100-cross"
aliases:
  - km-termless.vt100-cross
  - km-termless-vt100-cross
created_by: claude:4929065a
created_at: 2026-03-22T16:40:15Z
closed_at: 2026-03-22T16:50:38Z
close_reason: "21 cross-comparison tests (TS vs Rust vt100): text rendering, SGR
  styles, cursor, modes, reset. Gracefully skips when native module not built."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Cross-compare vt100-ts vs vt100-rust conformance @km/termless #task #P2 @claude:4929065a

Add cross-comparison tests between our TypeScript vt100 backend and the Rust vt100 crate. Find disagreements — each one is a bug in one or the other. Extend cross-backend.test.ts to include both vt100 variants.