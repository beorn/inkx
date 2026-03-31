---
name: Always verify renders after refactoring
description: After any code change to a visual component, re-render in TTY and verify output. Never assume a refactor is safe.
type: feedback
---

After any code change to a visual component (dashboard, popover, etc.), always re-render in TTY and compare against the approved mockup or previous state. Never assume a "safe" refactor preserved the visual output.

**Why:** User caught me committing a refactor (LV helper extraction) without re-verifying the render output. The refactor was safe, but I had no proof — I checked the old screenshot instead of taking a fresh one.

**How to apply:** After every edit to a visual component:
1. Start TTY at the correct dimensions
2. Capture text output
3. Compare against the approved mockup (or previous capture)
4. Only then commit

For dashboard specifically: the live data jitters, so compare STRUCTURE (borders, labels, layout) not values.
