---
id: "@km/silvery/copy-on-select"
aliases:
  - km-silvery.copy-on-select
  - km-silvery-copy-on-select
created_by: Bjørn Stabell
created_at: 2026-04-02T16:51:02Z
---

# [ ] Copy-on-select: auto-copy to clipboard on mouse release (OSC 52 + tmux paste buffer) @km/silvery #feature #P1

Claude Code NO_FLICKER has this: selected text copies to clipboard automatically on mouse release. Inside tmux, writes to tmux paste buffer. Over SSH, falls back to OSC 52. Silvery has selection state machine + copy effect but needs the clipboard integration layer (OSC 52 write, tmux detection, configurable on/off).