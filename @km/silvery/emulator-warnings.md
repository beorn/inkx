---
id: "@km/silvery/emulator-warnings"
aliases:
  - km-silvery.emulator-warnings
  - km-silvery-emulator-warnings
created_by: claude:c9beade3
created_at: 2026-03-14T15:21:32Z
closed_at: 2026-03-14T23:45:44Z
close_reason: Implemented and committed in silvery 5b25c8f + termless 3887c47
---

# [x] Route emulator warnings to test failures — unsupported OSC should fail @km/silvery #task #P2 @claude:c9beade3

Ghostty WASM logged 'unsupported OSC: 66' but it was suppressed by vitest. Capture diagnostics structurally (warning.code, warning.sequence, warning.backend). In tests: unexpected warnings fail, expected warnings require explicit allowlist. See docs/lessons/testing-escape-hatches.md.