---
mentions:
  - km
id: "@km/inbox/dl7q8"
aliases:
  - km-dl7q8
  - "@km/_orphan/dl7q8"
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:22Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 8: Migration guide — expand code examples, clarify first-render zeros @km/_orphan #task #P3

Expand migration.md with concrete code examples for each difference.

## Specific improvements

### "First Render Shows Zeros" — needs clarification

Current: confusing because other docs say Silvery solves the width:0 problem.
Add clear explanation:
"On initial mount, useContentRect() returns {width: 0, height: 0} during the very first render pass. Silvery immediately runs layout and triggers a second render with actual dimensions — both happen before the first paint reaches the terminal. This is different from Ink's useBoxMetrics, which requires a full useEffect cycle and visible re-render. In practice, the zeros are invisible. If you need to guard: `if (width === 0) return null`."

### Each difference needs Ink→Silvery code comparison

Add side-by-side code blocks for:

1. Layout feedback: Ink width prop threading → Silvery useContentRect()
2. Text wrapping: Ink overflow → Silvery auto-wrap + truncation modes
3. Scrolling: Ink manual virtualization → Silvery overflow="scroll"
4. measureElement → useContentRect one-liner
5. Hook naming: useLayout → useContentRect

### Community package mapping

Expand the table with more entries if available. Add note: "Missing a package? File an issue or contribute."

### Testing migration

Add section: "If you used ink-testing-library, switch to @silvery/test. The API is similar — createRenderer() + locators instead of render() + lastFrame()."

