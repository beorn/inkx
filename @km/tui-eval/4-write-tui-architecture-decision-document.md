---
id: "@km/tui-eval/4-write-tui-architecture-decision-document"
aliases:
  - km-tui-eval.4
  - km-tui-eval-4
  - "@km/tui-eval/4"
created_at: 2026-01-16T23:53:13Z
closed_at: 2026-01-17T00:03:11Z
---

# [x] Write TUI architecture decision document @km/tui-eval #task #P2

## Summary

Document the final recommendation on TUI1 vs TUI2 with rationale.

## Document Structure

1. **Executive Summary** - Which TUI and why (1 paragraph)
2. **Context** - Why we explored alternatives
3. **Options Evaluated**
   - TUI1 (Ink) - pros, cons, required improvements
   - TUI2 (OpenTUI) - pros, cons, blocking issues
4. **Decision** - Which to proceed with
5. **Consequences** - What this means for @km/tui2 work
6. **Action Items** - Next steps

## Depends On

- @km/tui-eval/1-analyze-tui1-layout-pain-points (TUI1 analysis)
- @km/tui-eval/2 (OpenTUI assessment)
- @km/tui-eval/3-prototype-tui1-layout-abstraction-layer (TUI1 prototype) - optional, if we proceed with TUI1

## Output

- docs/adr/NNN-tui-architecture.md (Architecture Decision Record)