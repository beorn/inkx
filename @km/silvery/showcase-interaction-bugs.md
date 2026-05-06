---
mentions:
  - km
id: "@km/silvery/showcase-interaction-bugs"
aliases:
  - km-silvery.showcase-interaction-bugs
  - km-silvery-showcase-interaction-bugs
created_by: claude:491faf6c
created_at: 2026-03-25T20:32:04Z
owner: bjorn@stabell.org
---

# [ ] Showcase demos: rendering corruption, broken interaction, scrolling @km/silvery #bug #P3

Issues found in silvery.dev live demos (showcase.html via xterm.js):

1. **Uneven padding** — more space on right than left/top/bottom (xterm grid doesn't pixel-fill container, leftover pixels on right) [P3]
2. **Bottom border missing** — content cropped, can't see keyboard hints at bottom [P3]
3. **Content cropped** — demo height too small for some apps (dashboard cuts off at Core 5) [P3]
4. ~~Clicking tabs doesn't work~~ — FIXED (Tab.tsx mouseDown handler) ✓
5. ~~Left/right navigation corrupts output~~ — CANNOT REPRODUCE. Tested with SILVERY_STRICT (all modes), adapter pipeline path, Playwright automation. All pass. Original report likely a page-scroll visual artifact. Downgraded from P1 to P3. [P3]
6. **Scrolling doesn't work** — wheel events not reaching terminal in iframe. FIXED: replaced private `_core._onData` API with public `term.input()` (xterm.js v6 API). [DONE]

Root cause for 1-3: xterm FitAddon leaves pixel remainders, demo heights are hardcoded per demo in ShowcaseGallery.vue.

