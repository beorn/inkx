---
id: "@km/silvercode/slash-command-vault-discovery"
aliases:
  - km-silvercode.slash-command-vault-discovery
  - km-silvercode-slash-command-vault-discovery
created_by: claude:da9990c5
created_at: 2026-04-28T19:25:34Z
closed_at: 2026-04-28T19:36:59Z
close_reason: Closed
---

# [x] Slash-command auto-complete doesn't surface vault-local commands @km/silvercode #bug #P2 @claude:da9990c5

blocks:: [[@km/silvercode]]

Symptom: when silvercode runs in a vault containing .claude/commands/file.md, typing / in the chat input does not surface /file in the auto-complete dropdown. Only static silvercode-local + well-known Claude commands appear.