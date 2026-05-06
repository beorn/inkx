---
mentions:
  - next
  - me
  - agent
  - km
id: "@km/infra/vault-next-me-rename"
aliases:
  - km-infra.vault-next-me-rename
  - km-infra-vault-next-me-rename
created_by: Bjørn Stabell
created_at: 2026-04-07T21:31:53Z
owner: bjorn@stabell.org
---

# [ ] vault: rename @next.md → @me.md for symmetry with @agent.md (discuss) @km/infra #task #P3

Discussion bead — do not patch yet, design first.

Background: ~/Bear/Vault uses an @-sigil convention for GTD context files at vault root:

- @next.md — user's GTD next-actions board (the human's queue)
- @agent.md — agent's task board (created 2026-04-07)
- @someday.md — someday/maybe parking lot

Question: should @next.md be renamed to @me.md?

Arguments for @me:

- Symmetry with @agent — both files name an audience (me vs agent)
- Removes implicit ownership assumption in 'next' (whose next?)
- Reads more naturally now that @agent exists
- Reflects the dual-board model (me/agent) more cleanly

Arguments for keeping @next:

- @next is classic GTD vocabulary (next actions context)
- Adopted before @agent existed; fits the @-sigil = 'context' rule
- The 'next actions' concept is preserved in section names (## Next)
  inside whichever file we use, so the GTD semantics aren't lost

If we rename, scope of changes:

1. git mv @next.md @me.md
2. Sweep ~30-50 references in CLAUDE.md, RUNBOOK.md, AGENTS.md,
   .claude/commands/bl.md, .claude/commands/do.md, +ObsidianPKM,
   +Taxes, etc. (every place that mentions @next as the canonical
   user-backlog name)
3. Update memories at ~/.claude/projects/-Users-beorn-Bear-Vault/memory/
4. Verify no broken wikilinks via 'bun km doctor links'

If we don't rename, document why and stop revisiting.

Need to discuss before any work happens.

