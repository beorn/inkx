---
id: "@km/inbox/8jv1d"
aliases:
  - km-8jv1d
  - "@km/_orphan/8jv1d"
created_by: claude:891e3ce1
created_at: 2026-02-28T21:48:28Z
closed_at: 2026-03-02T22:50:19Z
owner: bjorn@stabell.org
assignee: claude:e039a9ca
---

# [x] Website: AI assistants example doesn't accept input @km/_orphan #bug #P2 @claude:e039a9ca

On beorn.github.io/inkx/use-cases/ai-assistants.html, the demo doesn't respond to keyboard input. The showcase uses a custom useInput event bus (emitInput in showcases.tsx) — the AI assistants demo may not be wired up to it, or the input parsing doesn't handle the keys it needs.