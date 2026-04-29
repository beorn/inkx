---
id: "@km/bearly/gpt-5-5"
aliases:
  - km-bearly.gpt-5-5
  - km-bearly-gpt-5-5
created_by: claude:a7145ca5
created_at: 2026-04-23T18:48:54Z
closed_at: 2026-04-23T18:51:50Z
close_reason: Added gpt-5.5 ($5/$30) + gpt-5.5-pro ($30/$180) to bearly model
  registry. Updated .claude/skills/pro, ask, deep docs with API-rollout note.
  Kept runtime defaults on gpt-5.4-pro (dispatch.ts, cli.ts) until OpenAI API
  exposes 5.5. All existing tests pass (pricing-sanity, pro-fire-and-forget,
  cli-argv, dual-pro-failure-modes).
---

# [x] Add GPT-5.5 model + update llm skills @km/bearly #task #P2 @claude:a7145ca5

blocks:: [[@km/bearly]]

GPT-5.5 'Spud' announced 2026-04-23. Add gpt-5.5 ($5/$30) and gpt-5.5-pro ($30/$180) to bearly model registry. Update .claude/skills/ docs (pro, ask, deep, fresh). Keep runtime defaults on 5.4 until API is live.