---
id: "@km/term-2/5-remove-cross-dependencies-tui-term-must-not-depend"
aliases:
  - km-term-2.5
  - km-term-2-5
  - "@km/term-2/5"
created_at: 2026-01-28T13:49:50Z
closed_at: 2026-01-28T14:33:00Z
---

# [x] Remove cross-dependencies: tui/term must not depend on inkx/chalkx @km/term-2 #task #P1 @claude:df8d3459

@beorn/tui currently depends on inkx (see vendor/beorn-tui/package.json).
@beorn/term and @beorn/tui should be completely standalone packages with no dependencies on inkx or chalkx.

Current problematic dependencies:
- vendor/beorn-tui/package.json: "inkx": "file:../beorn-inkx"

Fix: tui should have its own render implementation, not wrap inkx.