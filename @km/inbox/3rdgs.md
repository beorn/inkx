---
id: "@km/inbox/3rdgs"
aliases:
  - km-3rdgs
  - "@km/_orphan/3rdgs"
created_by: claude:e7c823b8
created_at: 2026-02-26T14:54:29Z
closed_at: 2026-02-26T15:04:05Z
owner: bjorn@stabell.org
---

# [x] Fix heading depth >6 in nodes2md serializer (produces invalid markdown) @km/_orphan #bug #P1

nodes2md writes ####### for depth 7+ which is invalid markdown (only h1-h6 supported). Parser treats 7+ markers as paragraphs, losing heading semantics, task markers, and embed_source. Root cause: serializeSection() uses raw tree depth without capping. Also fix double space in empty-title headings with embed_source.