---
id: "@km/all/codepath-collapse"
aliases:
  - km-all.codepath-collapse
  - km-all-codepath-collapse
created_by: claude:cc081a9a
created_at: 2026-04-27T06:18:05Z
---

# [ ] [epic] Codepath collapse — delete dead/dual paths @km/all #feature #P3

blocks:: [[@km/all]]

Reduce state-space across the codebase by collapsing dual implementations, deleting non-default paths, killing flags that are no longer used, and finishing partial migrations so only the new path remains.

Scope: post-migration cleanup work where the goal is reducing branches in the program rather than adding behavior. Each child should end with the old path's code physically deleted (not just gated off) and no flag toggles remaining.

Origin: @km/all/plateau-90 R1 split (2026-04-27). Source review pro/Kimi at /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt — "easy wins close while hard work stalls" was the failure mode of mixing this with structural hardening.