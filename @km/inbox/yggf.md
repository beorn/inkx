---
id: "@km/inbox/yggf"
aliases:
  - km-yggf
  - "@km/_orphan/yggf"
created_at: 2026-01-19T15:14:12Z
closed_at: 2026-01-21T09:23:14Z
---

# [x] Implement Decker-inspired improvements @km/_orphan #epic #P3

Architectural improvements inspired by Decker webapp patterns. See docs/vs-decker.md for full comparison.

## Status Summary

| Opportunity | Status | Verdict |
|-------------|--------|---------|
| O1: Command Context | ✅ Done | Good adoption |
| O2: ID Lookup Map | ✅ Done | Good adoption, needs optimization |
| O3: Visual Navigation | ❌ Closed | Never - fights terminal paradigm |
| O4: Plugin Composition | ❌ Closed | Never - premature abstraction |
| O5: Node/Text Mode | 🔒 Blocked | Wait for inline editing feature |

## Strategic Conclusion

**Stop looking for patterns to adopt from Decker.**

KM's architecture is already better for its domain. The five-layer architecture (storage → tree → board → UI) with explicit action types is more maintainable than Decker's tightly-coupled Slate/Yjs integration.

## Follow-up Work

See child issues for:
- @km/_orphan/aojy: Fix nodeMap O(n) per-keypress rebuild
- @km/_orphan/amzv: Eliminate dual-state technical debt
- @km/_orphan/rk5q: Invest in TUI testing DX (real opportunity)