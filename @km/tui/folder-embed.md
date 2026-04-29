---
id: "@km/tui/folder-embed"
aliases:
  - km-tui.folder-embed
  - km-tui-folder-embed
created_at: 2026-02-04T11:27:21Z
closed_at: 2026-02-04T12:41:17Z
assignee: claude:a7826e85
---

# [x] Folder embed shows !inbox instead of transcluded content in zoom view @km/tui #bug #P2 @claude:a7826e85

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