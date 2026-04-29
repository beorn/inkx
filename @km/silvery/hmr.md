---
id: "@km/silvery/hmr"
aliases:
  - km-silvery.hmr
  - km-silvery-hmr
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:06Z
owner: bjorn@stabell.org
---

# [ ] Hot module replacement for TUI development @km/silvery #feature #P3

HMR for terminal apps — the 'Vite moment' for TUI development. No competitor has this.

Approaches to explore:
- State snapshotting + process restart on file change (simplest)
- Dynamic import swapping for view components (medium)
- Full HMR preserving React state tree (hardest, most valuable)

Even basic state-preserving restart would be a breakthrough. Textual has CSS hot-reload but no code HMR.
This addresses everyday developer pain — the #1 DX improvement possible.