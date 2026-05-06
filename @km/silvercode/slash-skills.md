---
mentions:
  - km
  - claude
id: "@km/silvercode/slash-skills"
aliases:
  - km-silvercode.slash-skills
  - km-silvercode-slash-skills
created_by: claude:acc2e8e3
created_at: 2026-04-26T06:09:58Z
started_at: 2026-04-26T06:10:41Z
owner: bjorn@stabell.org
assignee: claude:acc2e8e3
---

# [/] Slash palette: merge skills array alongside slash_commands @km/silvercode #feature #P2 @claude:acc2e8e3

The session-init event already exposes a skills[] array (sdk-adapter.ts:112, session-store.ts:52). Currently SlashCommandPalette only merges slashCommands[]. Skills are invocable via /<skill-name> in Claude Code — palette should surface them too.

