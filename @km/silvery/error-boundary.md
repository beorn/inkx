---
id: "@km/silvery/error-boundary"
aliases:
  - km-silvery.error-boundary
  - km-silvery-error-boundary
created_by: claude:474834b0
created_at: 2026-03-10T19:36:55Z
closed_at: 2026-03-10T19:49:19Z
close_reason: Created SilveryErrorBoundary in @silvery/react as default Root
  wrapper. createApp() wraps all apps with it as outermost element — catches
  render errors gracefully with red ERROR + message + file location.
---

# [x] Built-in ErrorBoundary as default Root component @km/silvery #task #P2 @claude:474834b0

Move ErrorBoundary out of Ink compat into silvery's default Root. Every silvery app gets error boundaries automatically — catches render errors, displays error + message + file location. Not Ink-specific.