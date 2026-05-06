---
aliases:
  - km-storage.safe-write-conflict-noise
  - km-storage-safe-write-conflict-noise
created_at: 2026-05-06T22:00:17.743Z
---

# safe-write conflict warnings spam every CLI mutation #bug #P3

Every `km bd rename / close / drop / update` invocation emits one or more lines like:

```
WARN km:storage:watch:fs-writer safe-write conflict: /path/to/file.md (expected=<hash>, actual=<missing>)
```

Cause: the fs-writer hashes the file before writing; if a watcher sees the file change between hash and write (or the file is missing entirely on a fresh rename), the safe-write check trips. For routine CLI mutations the conflict isn't a real conflict — it's the writer racing its own watcher.

Encountered roughly 40 times during the @km/* scope-consolidation session. Drowns out actual signal in stderr; users learn to ignore it; real conflicts could be missed.

Acceptance:
- Routine `km bd rename / close / update` invocations emit zero safe-write conflict warnings on a clean working tree
- Genuine conflicts (file modified by another process between read and write) still warn — verified by an integration test that mocks an external mid-write change
- Optionally: warning gets a hint about how to reproduce so a real conflict is distinguishable from the self-race noise

Related: @km/storage/sync-roundtrip-completeness (parent epic)
