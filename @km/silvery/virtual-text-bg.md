---
id: "@km/silvery/virtual-text-bg"
aliases:
  - km-silvery.virtual-text-bg
  - km-silvery-virtual-text-bg
created_by: claude:ceb7c9cb
created_at: 2026-03-30T06:56:09Z
closed_at: 2026-03-30T07:32:44Z
close_reason: "Not a bug. The bgSegments pipeline works correctly end-to-end
  (buffer cells, ANSI output 48;2;R;G;B confirmed via termless test). The
  original #333333 was too low contrast against dark terminal backgrounds.
  Changed to #404050 — visible on all dark themes."
owner: bjorn@stabell.org
---

# [x] backgroundColor on nested <Text> inside <Text> is lost (virtual text flattening) @km/silvery #bug #P2

## Updated: May NOT be a bug

Investigation found that silvery DOES support backgroundColor on nested <Text>:
- render-text.ts line 353: pushes BgSegment when childContext.backgroundColor is set
- render-text.ts line 1264: applyBgSegmentsToLine applies bg to buffer cells
- The code path exists and is documented in CLAUDE.md

## Possible issues
1. Theme token $mutedbg resolves to a very subtle color (4% foreground blend) — may be invisible
2. parseColor() might not resolve theme tokens at the bgSegments stage
3. The bg might render correctly but be too faint to see on the user's terminal

## Next steps
- Test with a hard-coded hex color instead of $mutedbg to verify the pipeline works
- If hex works, the issue is $mutedbg being too subtle — use a stronger token
- If hex doesn't work, debug parseColor in the bgSegments path