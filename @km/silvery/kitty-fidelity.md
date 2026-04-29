---
id: "@km/silvery/kitty-fidelity"
aliases:
  - km-silvery.kitty-fidelity
  - km-silvery-kitty-fidelity
created_by: claude:656602a3
created_at: 2026-03-16T21:40:11Z
closed_at: 2026-03-16T21:40:12Z
close_reason: "Implemented: default flags changed, useInput filters releases,
  useModifierKeys tracks modifier state. Tests: 1839 pass."
owner: bjorn@stabell.org
---

# [x] Kitty protocol: DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS default @km/silvery #task #P2

Silvery now defaults to full-fidelity Kitty flags (11 = DISAMBIGUATE|REPORT_EVENTS|REPORT_ALL_KEYS). useInput filters release events. useModifierKeys tracks held state from all events including modifier-only presses/releases. This enables new features that depend on modifier tracking and key release detection.