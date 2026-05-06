---
mentions:
  - km
id: "@km/silvery/focus-hidden"
aliases:
  - km-silvery.focus-hidden
  - km-silvery-focus-hidden
created_by: claude:c9beade3
created_at: 2026-03-13T07:13:17Z
closed_at: 2026-03-13T07:24:58Z
close_reason: "Fixed: isFocusable() now checks node.hidden — Suspense hidden
  nodes not focusable. Test in focus-manager-unit.test.ts."
owner: bjorn@stabell.org
---

# [x] Hidden nodes remain focusable — isFocusable ignores node.hidden @km/silvery #bug #P1

isFocusable only checks props.focusable and display \!== 'none', ignoring node.hidden (Suspense). Hidden nodes appear in getTabOrder, spatial navigation, and focus restoration. GPT 5.4 review finding.

