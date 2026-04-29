---
id: "@km/tui/tab-undo-corruption"
aliases:
  - km-tui.tab-undo-corruption
  - km-tui-tab-undo-corruption
created_by: Bjørn Stabell
created_at: 2026-03-31T21:13:03Z
closed_at: 2026-03-31T21:59:51Z
close_reason: "Already fixed by km-storage.cross-file-move fix: handleNodeMoved
  now regenerates both source and destination files. old_parent_id snapshoted in
  moveNodeImpl. Verified in TTY + 4 regression tests added."
---

# [x] Tab indent in normal mode + undo causes data corruption and content loss @km/tui #bug #P0

CRITICAL DATA LOSS BUG.

Steps to reproduce:
1. km view (on ROADMAP.md or similar document)
2. Navigate to a heading card (e.g. 'Horizon 1: TUI Polish')
3. Press Tab in NORMAL mode (not edit mode)
4. Card disappears from column (indented under previous sibling) - this part works
5. Press 'u' to undo

Result after undo:
- The indented card ('Horizon 1: TUI Polish') is PERMANENTLY LOST - it does not reappear
- Card contents are SHUFFLED between remaining cards (e.g. 'Current State' card shows 'Horizon 2' content)
- The underlying markdown file (ROADMAP.md) is corrupted: the entire section is deleted
- Even after git checkout to restore the file, km events persist the corrupt state
- Full recovery requires deleting both .km/events.jsonl AND .km/state.db

Impact: Tab+undo in normal mode causes irrecoverable data corruption. The undo operation does not properly reverse the indent, and the file-system sync propagates the corrupt state.

Evidence:
- ROADMAP.md lost 26 lines (entire Horizon 1 section + Horizon 4 body content)
- git diff showed the file was modified on disk during the session
- Screenshots: /tmp/@km/edit-explore-09-before-tab/png through /tmp/@km/edit-explore-11-after-undo/png

Workaround: Do not use Tab in normal mode. If accidentally triggered, do NOT press undo - instead exit km and git checkout the affected file, then delete .km/events.jsonl and .km/state.db.