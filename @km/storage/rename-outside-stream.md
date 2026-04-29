---
id: "@km/storage/rename-outside-stream"
aliases:
  - km-storage.rename-outside-stream
  - km-storage-rename-outside-stream
created_by: Bjørn Stabell
created_at: 2026-04-01T06:11:49Z
closed_at: 2026-04-02T21:18:13Z
close_reason: "Fixed: Rename handlers now record WriteTokens (file + folder
  recursive). Journal entries appended to events.jsonl for rename DB mutations.
  Direct DB mutations kept for FS/DB atomicity. markInFlight kept as
  defense-in-depth. 5 new tests. Commits 84964dcf..61cc1031."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Rename handlers mutate DB directly outside the event stream @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/event-handlers.ts:380-534
Classification: P1

handleFolderRename() and handleFileRename() perform db.run() side effects for fs_path, name, and title that are not emitted/journaled/broadcast. Breaks event-sourcing assumptions and can leave rebuild/subscriber behavior inconsistent.

Suggested fix: Represent path changes as first-class committed state transitions: either explicit events (node_path_updated) or part of the mutation transaction. Let the file projector perform the actual FS rename.