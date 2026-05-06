---
mentions:
  - km
id: "@km/terminfo/vue-template-linkify"
aliases:
  - km-terminfo.vue-template-linkify
  - km-terminfo-vue-template-linkify
created_by: claude:f8196c1c
created_at: 2026-03-26T07:04:54Z
closed_at: 2026-04-01T19:15:27Z
close_reason: "Mostly covered by linkifyContent() in paths.ts +
  @bearly/vitepress-enrich glossary plugin. All body/description/probe content
  is linkified. Remaining: minor labels in v-for category listings — low impact,
  not worth a dedicated effort."
owner: bjorn@stabell.org
---

# [x] Linkify entity names in Vue template table content (SGR in tables, etc.) @km/terminfo #task #P3

Category labels and metadata in Vue v-for loops on static pages bypass both the markdown-it plugin and linkify-content.ts. Need to linkify at the Vue layer.

