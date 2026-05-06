---
mentions:
  - km
  - claude-1769322905
id: "@km/inbox/t6mn"
aliases:
  - km-t6mn
  - "@km/_orphan/t6mn"
created_at: 2026-01-24T22:27:49Z
closed_at: 2026-01-24T22:53:53Z
assignee: claude-1769322905
---

# [x] km view creates unexpected .km file in vault root @km/_orphan #bug #P2 @claude-1769322905

ANALYSIS:

- The .km directory is only created by the `km init` command (see init.ts:184)
- The view command and vault loading code do NOT create .km directories
- km uses memory mode (ephemeral) by default when no .km directory exists
- km switches to disk mode when it finds a .km directory

Possible explanations:

1. User previously ran `km init` on that directory and forgot
2. The .km directory is corrupted/incomplete (missing events.jsonl)
3. The .km directory was created by another tool or process

RESOLUTION:
This is likely user error or corrupted state, not a km bug. If the .km directory is corrupted, user should delete it and let km use memory mode, or run `km init` to properly initialize the vault.

Closing as cannot reproduce. If this happens again, please create a new bead with:

- Directory listing of the .km directory
- Output from `ls -la /tmp/tst-vault3/.km/`
- Whether `km init` was ever run in that directory

