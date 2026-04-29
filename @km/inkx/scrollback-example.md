---
id: "@km/inkx/scrollback-example"
aliases:
  - km-inkx.scrollback-example
  - km-inkx-scrollback-example
created_by: claude:fa5431cd
created_at: 2026-03-03T13:15:24Z
closed_at: 2026-03-03T14:38:21Z
owner: bjorn@stabell.org
assignee: claude:fa5431cd
---

# [x] ScrollbackView example: input overwrites border + resize corruption @km/inkx #bug #P2 @claude:fa5431cd

Two bugs in the scrollback example/demo:

1. **Input box overwrites bottom border** — when the input box grows to 2 lines, it overwrites the bottom border of the containing Box. Should use fully dynamic inkx flex layout (no hardcoded heights).

2. **Resize corruption** — resizing the terminal leaves the scrollback area visually corrupted/messed up. Content doesn't reflow correctly.

Both are long-standing issues that keep recurring. The fundamental problem may be that the scrollback example uses hardcoded heights instead of letting flexbox handle the layout.