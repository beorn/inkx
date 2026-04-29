---
id: "@km/storage/watcher-misses-changes"
aliases:
  - km-storage.watcher-misses-changes
  - km-storage-watcher-misses-changes
created_by: Bjørn Stabell
created_at: 2026-04-06T20:49:01Z
closed_at: 2026-04-16T00:37:04Z
close_reason: >-
  Fixed in commit b997a6482 — shared root cause with
  km-storage.frontmatter-wipe.


  Investigation confirmed the user's hypothesis that these two bugs share

  a root cause. The watcher does occasionally miss external edits (macOS

  FSEvents coalescing is the most common culprit, per prior recall

  sessions on "watcher event loss during folder refresh") — heartbeat

  reconciliation at 60s is the designed recovery window, but users see

  stale state well before that. The data-loss symptom (bug 1) kicks in

  when the in-app write races the watcher and overwrites the external

  edit with a stale DB snapshot.


  Fix approach (see km-storage.frontmatter-wipe close reason for detail):

  ChangeHandlers.save() now merges external drift into the in-memory

  subtree before writing. This turns every in-app save into an implicit

  watcher-missed-edit recovery point. Externally-appended nodes get

  re-parented to the file and written back in the same save, and the

  file's content_hash + tracker baseline are refreshed so the WriteQueue

  no longer flags the write as a spurious conflict.


  Note: this is not a replacement for fixing watcher reliability — it is

  the safety net that keeps data from being silently lost during the

  narrow window between an external edit and the watcher noticing it. The

  watcher itself still needs investigation for the macOS FSEvents

  coalescing case; that belongs in a separate follow-up bead.


  Test: the third scenario in

  packages/km-storage/tests/watch/frontmatter-preserve.slow.test.ts

  ("external task addition is reconciled into the DB on the next in-app

  write (missed-watcher recovery)") exercises this case — watcher event

  deliberately not awaited, disk has an appended task, in-app mutation

  triggers save(), both edits land in the final file. Failing before fix,

  passing after.


  Verification: bun vitest run packages/km-storage packages/km-markdown

  (1783 + 51 fast) + --project slow (52) + apps/km-tui (2259) all green.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] File watcher doesn't detect external changes in-session @km/storage #bug #P1 @Bjørn Stabell

External edits don't show up in km until restart. Watcher debounce is 2000ms but waited 10+s and changes never appeared. Restart picks them up via startup reconciliation.

Likely: worker-bridge issue or macOS file-watcher edge case for shell-append writes.