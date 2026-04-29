---
id: "@km/_orphan/iviwx"
aliases:
  - km-iviwx
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:20Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 3: Consistency fixes — Canvas/DOM, first-render zeros, text wrapping claims @km/_orphan #task #P1

Fix factual inconsistencies across docs.

## 1. Canvas/DOM render targets
- README line 117: "Canvas 2D and DOM available now" 
- Homepage line 39: "Canvas and DOM tomorrow"
- Roadmap: "experimental, not yet published on npm"
- FIX: Align all to "Canvas 2D and DOM adapters are implemented (experimental). Terminal is the primary, production-ready target."
- Files: README.md, docs/index.md, docs/guide/silvery-vs-ink.md, docs/guide/comparison.md

## 2. First-render zeros
- README/homepage: imply "no width:0 on first render" 
- Migration guide: lists "First Render Shows Zeros" as a known difference
- FIX: Be precise everywhere. useContentRect() returns 0 on the very first render pass, then actual dimensions on the second (both happen before first paint). This is different from Ink's useBoxMetrics which requires a useEffect cycle. Clarify in:
  - README: "Components know their dimensions during render (after the initial layout pass)"
  - Migration guide: expand explanation of when/why zeros appear and that it's invisible in practice
  - why-silvery.md: don't claim "no zeros", say "synchronous dimensions during render"

## 3. Text wrapping claim
- Migration guide says Ink overflows by default, Silvery wraps
- Verify against current Ink behavior (Ink v5+ may wrap by default now)
- FIX: If Ink now wraps, update migration guide and silvery-vs-ink.md. If Ink still overflows, keep claim but add version note.

## 4. Component count
- All docs say "30+" — verify actual count is ≥30
- If it's 23+ (as the earlier homepage said), update all to match