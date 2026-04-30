---
id: "@km/inbox/gx5r"
aliases:
  - km-gx5r
  - "@km/_orphan/gx5r"
created_at: 2026-01-15T22:34:44Z
closed_at: 2026-01-16T08:00:01Z
---

# [x] Systematic TUI2 Parity Methodology @km/_orphan #epic #P3

After fixing individual TUI2 bugs, implement a systematic methodology to achieve and maintain TUI1/TUI2 parity:

1. Extract TUI1 specification (keybindings.json, visual baselines)
2. Create TUI-agnostic textTransform.ts for shared rich text parsing
3. Expand visual e2e tests to cover ALL component states
4. Add @km/_orphan/sh tests for every keybinding
5. Create parity checklist to track progress feature-by-feature

This addresses why TUI2 progress has been slow: no spec, architectural mismatch (Ink ANSI vs OpenTUI JSX), and ad-hoc fixing without systematic coverage.

See plan file: inherited-humming-panda.md section 'BEAD: Systematic TUI2 Parity Methodology'