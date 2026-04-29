---
id: "@km/tui/embed-symlink-rename"
aliases:
  - km-tui.embed-symlink-rename
  - km-tui-embed-symlink-rename
created_by: Bjørn Stabell
created_at: 2026-04-06T20:13:30Z
closed_at: 2026-04-06T20:44:06Z
close_reason: Renamed embed→symlink across display layer in commit b78137bbc.
  KNode.isEmbed→isSymlink, resolveEmbed→resolveSymlink, EmbedRepo→SymlinkRepo,
  isEmbedded→isSymlinked, isBrokenEmbed→isBrokenSymlink,
  embed-display.ts→symlink-display.ts, TreeLens.resolvedEmbed→resolvedSymlink,
  buildEmbedChild→buildSymlinkChild, getEmbedPathsOnBoard→getSymlinkPathsOnBoard
  plus all comments and docstrings. Markdown wikilink syntax (![[target]]) and
  link.embedded field left as-is since they describe markdown spec, not the
  structural concept. 41 files changed, 442 insertions, 320 deletions. All 43
  symlink.test.ts tests pass; 2 unrelated 'clicking an embed sub-item' tests
  added by parallel agent are failing but not part of this rename.
---

# [x] Finish embed→symlink rename — display layer still uses 'embed' terminology @km/tui #task #P3 @Bjørn Stabell

Commit 923269cc2 renamed the data field embed_source → symlink_to, but the display layer still uses 'embed' everywhere:

- apps/@km/tui/src/views/embed-display.ts (file name)
- resolveEmbed(), isEmbedded, getDisplayContent (function names)
- 'embedded tasks', 'embed children' in comments
- isBrokenEmbed in TreeNode

Result: three names for the same concept:
- symlink_to (data field)
- embed (display layer + comments)
- isSymlink/isBrokenSymlink (ViewTree)

Fix: rename embed→symlink across the display layer to match the data model. Mechanical rename via bun tools/refactor.ts.