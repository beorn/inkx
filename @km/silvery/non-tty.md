---
id: "@km/silvery/non-tty"
aliases:
  - km-silvery.non-tty
  - km-silvery-non-tty
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:26Z
owner: bjorn@stabell.org
---

# [ ] Non-TTY story: renderStatic, plain mode, capability detection @km/silvery #feature #P2

Many CLIs run in CI, pipes, redirected output, IDE terminals. Need: renderStatic() for non-interactive, automatic non-TTY fallback, capability detection, plain mode rendering. This is adoption insurance.