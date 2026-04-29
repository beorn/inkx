---
id: "@km/bearly/pro-55-sprint"
aliases:
  - km-bearly.pro-55-sprint
  - km-bearly-pro-55-sprint
created_by: claude:a7145ca5
created_at: 2026-04-23T19:04:05Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.pro-55-sprint
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-23T12:04:24Z
    created_by: claude:a7145ca5
    metadata: "{}"
---

# [ ] A/B sprint: gpt-5.4-pro vs gpt-5.5-pro (1-2 days) @km/bearly #task #P2

blocks:: [[@km/bearly]]

Once gpt-5.5-pro lights up on the OpenAI API, flip LLM_DUAL_PRO_B=gpt-5.5-pro for 1-2 days. Review ~/.claude/projects/<project>/memory/ab-pro.jsonl; pick the winner. If 5.5-pro wins, update hard-coded default in vendor/bearly/plugins/llm/src/lib/dispatch.ts (getModel('gpt-5.5-pro')) and BEST_MODELS.pro preset. Revert LLM_DUAL_PRO_B after sprint.