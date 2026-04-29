---
id: "@km/rev-0203/3-document-tuievents-singleton-as-intentional-app-le"
aliases:
  - km-rev-0203.3
  - km-rev-0203-3
  - "@km/rev-0203/3"
created_at: 2026-02-03T15:13:25Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Document tuiEvents singleton as intentional app-level exception @km/rev-0203 #task #P3 @claude:da8e4a66

tuiEvents (EventEmitter) in apps/@km/tui/src/tui.tsx is a module-level singleton
used as an app-level event bus for React component refresh signaling.

This is intentional but contradicts the stated "no globals" principle.
Document it as an "App-level event bus exception" in docs/principles.md,
similar to the existing "Infrastructure Class Exception".

Alternatively, consider refactoring to pass via React context if feasible.