---
id: "@km/silvery/key-release"
aliases:
  - km-silvery.key-release
  - km-silvery-key-release
created_by: claude:656602a3
created_at: 2026-03-16T21:40:22Z
closed_at: 2026-03-16T22:00:25Z
close_reason: onRelease callback added to useInput. Release events dispatched to
  onRelease handler. 6 tests. Docs updated.
---

# [x] Key release events: hold-to-reveal, key-up handlers, modifier-gated UI @km/silvery #feature #P2

With REPORT_EVENTS, silvery now receives key release events. useInput filters them (backward compat), but useModifierKeys sees them. This enables: hold-to-reveal panels (hold ? to show shortcuts overlay, release to dismiss), key-up handlers for games/animations, modifier-gated UI (Cmd+hover underline on links — already implemented). **How to apply:** Add useInputRaw() or onRelease option to useInput for components that want release events.