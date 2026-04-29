---
id: "@km/storage/embed-child-function"
aliases:
  - km-storage.embed-child-function
  - km-storage-embed-child-function
created_by: claude:f8196c1c
created_at: 2026-03-28T06:25:26Z
closed_at: 2026-03-28T07:02:20Z
close_reason: "buildEmbedChild() in db-ops.ts unifies db-rules and CLI add embed
  creation. Raw SQL replaced with createDbOps().addNode(). Wikilink fallback
  removed. Task traits only on type:p (list items). Doc updated:
  design/km-ast/model.md reflects embed-as-trait."
---

# [x] Single 'add embedded child' function — unify db-rules, CLI, link-resolution @km/storage #task #P1 @claude:f8196c1c

Three different code paths create embedded children:
1. db-rules.ts (km.add:: rules) — creates type:'h', item:true, direct SQL INSERT
2. @km/_orphan/cli/commands/add.ts (km add CLI) — creates type:'p', item:true via repo.addNode
3. link-resolution.ts (parser ![[target]]) — sets embed_source on existing node via UPDATE

Each does something slightly different (type, item, content format, whether it goes through events).

Fix: One function in @km/storage that all three call. Handles type selection based on parent, sets embed_source, normalizes content. db-rules should go through the event system, not bypass it.

Also: content field is ambiguous — sometimes '![[path]]' (parser-created), sometimes display title (rule-created). Normalize to: content = display content, embed reference = embed_source.