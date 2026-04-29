---
id: "@km/tui/no-keyboard-follow-wikilink"
aliases:
  - km-tui.no-keyboard-follow-wikilink
  - km-tui-no-keyboard-follow-wikilink
created_by: Bjørn Stabell
created_at: 2026-04-06T20:44:40Z
closed_at: 2026-04-07T01:16:19Z
close_reason: "Fixed in 19ec66794: follow_wikilink command bound to 'g f' /
  'Ctrl+g f'. Walks current card subtree BFS, picks first [[target]], resolves
  via repo.resolveByName + id fallback, zooms via shared zoomToTargetInContext.
  Unresolved targets show warning toast."
---

# [x] [bug] No keyboard way to follow a wikilink in a card @km/tui #bug #P2 @Bjørn Stabell

handleFollowLink only fires when card has symlink_to set. Pressing Ctrl+Enter on card with [[wikilink]] toasts 'not a symlink'. TTY users with no mouse have no way to follow wikilinks.

Fix: gf (go follow) binding that picks first wikilink InlineNode from card content and zooms to its target.