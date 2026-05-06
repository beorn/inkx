---
mentions:
  - km
id: "@km/tui/omnibox-placeholder-styling"
aliases:
  - km-tui.omnibox-placeholder-styling
  - km-tui-omnibox-placeholder-styling
created_by: Bjørn Stabell
created_at: 2026-04-15T06:07:37Z
closed_at: 2026-04-15T06:18:15Z
close_reason: "Fixed in 504bf996b. InputBox placeholder rendering: removed the
  separate inverse-space cursor block, inlined the cursor ON the first
  placeholder character via <Text dimColor inverse>, rest uses plain <Text
  dimColor>. Fixes both the 'not left-aligned' and 'too white' complaints — the
  cursor IS the first ghost char, and dimColor renders more reliably dim than
  <Muted> across themes."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-placeholder-styling
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T23:07:38Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Omnibox placeholder: 'ghosted' text too white + not left-aligned (extra leading space) @km/tui #bug #P3

blocks:: [[@km/tui]]

User feedback: 'the ghosted text looks too white and isn't left-aligned (seems to have an extra space on the left)'.

## Root cause candidates

1. The InputBox's placeholder rendering (apps/@km/tui/src/views/shared-components.tsx) currently renders: [cursor-block] [Muted placeholder]. The inverse-space cursor block might be read as an extra leading space visually.
2. <Muted> may not be dim enough under the user's current theme. Some themes render Muted as a slightly-lighter-than-primary text which reads as 'too white'.
3. The prompt (e.g. 'omnibox ' or '> ') already includes a trailing space, and the cursor block adds another inverse-space character — so the layout is effectively: prompt + ␣ + ␣ + placeholder, producing visible leading whitespace.

## Fix

1. Remove the inverse-space cursor block when rendering placeholder — or inline the cursor INSIDE the placeholder's first character so there's no gap
2. Use a dimmer token than Muted (Small? H3? Faint?) to make 'ghosted' read as genuinely ghost
3. Verify prompt + placeholder concatenation doesn't introduce extra spacing

Fix site: apps/@km/tui/src/views/shared-components.tsx InputBox component.

Related: @km/tui/omnibox-quality-plateau, @km/silvery/popover (if ghost styling lands a shared Ghost component)

