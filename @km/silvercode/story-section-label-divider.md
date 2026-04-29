---
id: "@km/silvercode/story-section-label-divider"
aliases:
  - km-silvercode.story-section-label-divider
  - km-silvercode-story-section-label-divider
created_by: claude:2405c72e
created_at: 2026-04-28T22:17:43Z
---

# [ ] SectionLabel in All.story uses literal '──' padding — replace with <Divider title> @km/silvercode #task #P4 #design #storybook

blocks:: [[@km/silvercode]]

All.story.tsx defines a local SectionLabel component (lines 111-117) that renders:\n  <Box paddingTop={1} paddingBottom={0}>\n    <Muted>── {children} ──────────────────────────────────────────</Muted>\n  </Box>\n\nThis is a hand-rolled divider with a left-aligned title and a hardcoded 50-char trailing dash run. silvery's <Divider title='...'> renders the same shape correctly using semantic tokens, the right glyph for the terminal palette, and proper width via flexbox. The Silvery Way principle 1: use built-in components.\n\nThe story is a development surface (not shipped to users) so priority is P4 — but the All story is also where 'design judgment' happens, so a clean storybook reads better and won't propagate the antipattern by example. Acceptance: storybook stories use <Divider title=...> for section labels; SectionLabel local helper deleted. Discovered during @km/silvercode/design-review walkthrough.