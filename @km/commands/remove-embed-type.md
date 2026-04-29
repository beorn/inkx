---
id: "@km/commands/remove-embed-type"
aliases:
  - km-commands.remove-embed-type
  - km-commands-remove-embed-type
created_by: claude:f8196c1c
created_at: 2026-03-28T06:04:40Z
closed_at: 2026-03-28T06:19:30Z
close_reason: Removed type:embed from BlockType. Embeds determined by
  embed_source field, orthogonal to type. isEmbed(node) checks embed_source. 34
  files changed.
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Remove type:'embed' from BlockType — embeds are orthogonal to types @km/commands #task #P1 @claude:f8196c1c

type:'embed' is redundant with embed_source. Transclusion is determined by embed_source \!= null, not by type. Remove 'embed' from BlockType union, delete isEmbed(), update link-resolution to not promote type, update serializer/tests/validation. After: nodes with embed_source are regular p/h nodes.