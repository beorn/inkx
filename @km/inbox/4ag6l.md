---
id: "@km/_orphan/4ag6l"
aliases:
  - km-4ag6l
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:23Z
closed_at: 2026-03-23T22:32:10Z
close_reason: "Done: createApp moved to @silvery/tea/create-app, ag-term
  re-exports for backwards compat"
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Move createApp from term to tea @km/_orphan #task #P1 @claude:fed8de9e

createApp() creates stores and embodies TEA conventions. It belongs in @silvery/tea, not @silvery/term. term should only expose run() and render(). createApp naming also makes it feel like the default path, pulling beginners toward TEA.