---
mentions:
  - km
id: "@km/silvery/cc-limitations-blog"
aliases:
  - km-silvery.cc-limitations-blog
  - km-silvery-cc-limitations-blog
created_by: Bjørn Stabell
created_at: 2026-04-16T19:06:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.cc-limitations-blog
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-16T12:06:38Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Track Claude Code limitations for silvery blog post @km/silvery #task #P3

blocks:: [[@km/silvery]]

Running log of Claude Code TUI limitations to contrast against silvery's capabilities in an upcoming blog post.

Angle: silvery as a better foundation for interactive terminal apps — correctness, robustness, input handling, rendering.

Limitations observed:

1. Shift+letter breaks when Ghostty's Kitty keyboard protocol is active
- Trigger: running Claude Code's /terminal-setup adds 'keybind = shift+enter=text:\n' to ghostty config, which flips Ghostty into CSI u encoding mode
- Symptom: typed uppercase letters collapse to lowercase in the input prompt
- Root cause: Claude Code's input handler mis-decodes Shift+letter under Kitty keyboard protocol
- Reference: https://github.com/anthropics/claude-code/issues/49359 (opened 2026-04-16)
- Silvery contrast: silvery's input layer handles CSI u / Kitty keyboard protocol correctly (see @silvery/ag-term input pipeline)

Add future findings as they surface.

