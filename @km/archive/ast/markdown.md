---
mentions:
  - km
id: "@km/ast/markdown"
aliases:
  - km-ast.markdown
  - km-ast-markdown
created_by: claude:124bfbe5
created_at: 2026-02-14T00:10:32Z
closed_at: 2026-02-14T00:59:41Z
owner: bjorn@stabell.org
---

# [x] Update markdown parser and serializer for km-ast types @km/ast #task #P1

Update packages/@km/markdown/ to produce and consume @km/ast types.

Parser (ast2nodes.ts):

- createFileNode: type='file' → type='oi', fstype='mdfile'
- astToNodes headings: type='section' → type='oi', fstype='mdsection', add h block child for title
- convertListItem: type='task'/'ul'/'ol' → type='li', set list_marker and task_marker
- convertBlock: type='paragraph' → type='p', handle embedding → type='link'
- Add math block type support
- mergeH1IntoFileNode: update type checks

Serializer (nodes2md.ts):

- isListItemType: check type='li' instead of task/ul/ol
- serializeNode: switch on new types (oi/li/p/h/link/etc)
- serializeFile: check type='oi' && fstype in ['file','mdfile']
- serializeSection: use oi + mdsection
- serializeListItem/serializeTask: unified to li serialization
- serializeEmbedding: handle link type

Files: packages/@km/markdown/src/ast2nodes.ts, packages/@km/markdown/src/nodes2md.ts, packages/@km/markdown/src/parser.ts

