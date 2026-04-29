---
id: "@km/tools/bd-cli-fields"
aliases:
  - km-tools.bd-cli-fields
  - km-tools-bd-cli-fields
created_by: claude:f8196c1c
created_at: 2026-03-27T23:22:14Z
closed_at: 2026-03-27T23:25:42Z
close_reason: "Done. Added to km bd: create --description/--notes, update
  --description/--notes/--type/--claim, rename subcommand with reference
  updates."
---

# [x] km bd: add --description, --notes, --claim, --labels, rename to create/update @km/tools #task #P2 @claude:f8196c1c

Most painful daily gaps in km bd. Every session hits 'can't set description on create' and falls back to standalone bd.

Scope:
1. create: add --description, --notes, --design, --acceptance flags
2. update: add --description, --notes, --type, --labels, --claim flags
3. rename: add rename subcommand (change issue IDs with reference updates)
4. close: add --suggest-next (show newly unblocked issues)

All changes in @km/beads package + apps/@km/_orphan/cli/src/commands/bd.ts.