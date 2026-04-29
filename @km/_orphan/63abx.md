---
id: "@km/_orphan/63abx"
aliases:
  - km-63abx
created_by: claude:891e3ce1
created_at: 2026-02-28T21:48:25Z
closed_at: 2026-03-02T22:50:16Z
---

# [x] Website: system dashboard doesn't clean up when switching examples @km/_orphan #bug #P2 @claude:e039a9ca

On beorn.github.io/inkx, the system dashboard example's timers/intervals keep running when navigating to other examples. Likely VitePress SPA navigation doesn't properly destroy the iframe or the React app inside it. LiveDemo.vue at docs/site/.vitepress/components/LiveDemo.vue.