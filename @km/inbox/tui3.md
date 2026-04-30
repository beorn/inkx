---
id: "@km/inbox/tui3"
aliases:
  - km-tui3
  - "@km/_orphan/tui3"
created_at: 2026-01-30T13:09:03Z
closed_at: 2026-02-04T11:27:21Z
---

# [x] Folder embed shows !inbox instead of transcluded content in zoom view @km/_orphan #bug #P2

When viewing a board with a folder embed (`![[inbox]]`):

1. In column view: shows both 'inbox/' and '!inbox' (should only show transcluded content)
2. When zooming into Unprocessed: shows '!inbox' instead of 'inbox/' with children
3. Cannot zoom into the Inbox column itself

Expected: Embedded folders should display as folder name with '/' suffix and show their children (transclusion).

Test case: `km view /tmp/tst-vault2` - @inbox.md has `![[inbox]]` embed pointing to inbox folder.

Root cause investigation:
- Embed node has link_to correctly pointing to inbox folder (type=folder)
- TreeNode resolves the target but rendering differs between column and zoom views
- Possibly related to how board state is rebuilt on zoom vs initial render