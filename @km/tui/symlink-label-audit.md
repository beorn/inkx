---
mentions:
  - km
id: "@km/tui/symlink-label-audit"
aliases:
  - km-tui.symlink-label-audit
  - km-tui-symlink-label-audit
created_by: Bjørn Stabell
created_at: 2026-04-06T21:08:32Z
owner: bjorn@stabell.org
---

# [ ] Audit TUI for stale 'embed' labels (should be 'symlink') @km/tui #task #P3

After b78137bbc renamed embed→symlink in display layer, 321 'embed' occurrences remain across 50 files. Most are correct (markdown parser, storage links, db schema keep 'embed' because ![[...]] is literally an embed in markdown). But TUI user-facing strings may still say 'embed' when they should say 'symlink'. Audit: toasts, tooltips, error messages, detail pane labels, keybinding help, command palette. Rule: symlink = TUI runtime concept, embed = markdown source syntax.

