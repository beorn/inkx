---
id: "@km/inbox/5zkz"
aliases:
  - km-5zkz
  - "@km/_orphan/5zkz"
created_at: 2026-01-16T23:47:42Z
closed_at: 2026-01-16T23:52:26Z
---

# [x] Assess OpenTUI bug severity and upstream timeline @km/_orphan #task #P2

## Summary

Evaluate whether OpenTUI bugs are fixable and what the timeline might be.

## Known OpenTUI Issues

1. **002 - Color rendering bug** (BLOCKING)
   - Text color prop ignored when backgroundColor is set
   - Selection text shows wrong color

2. **003 - Bracket/space rendering** (BLOCKING)  
   - `[P1] ` renders as `[P1` - missing `]` and space
   - JSX whitespace handling issue

3. **001 - borderStyle segfault** (worked around)
   - borderStyle="round" causes crash
   - Using borderStyle="single" as workaround

## Investigation Tasks

- [ ] Check OpenTUI GitHub issues for similar reports
- [ ] Review OpenTUI source for root cause of 002/003
- [ ] Assess if we could contribute fixes
- [ ] Check OpenTUI release cadence and responsiveness
- [ ] Estimate time to fix if we do it ourselves

## Output

Assessment with:
1. Root cause analysis for each bug
2. Upstream status (reported? acknowledged? timeline?)
3. Self-fix feasibility and effort estimate