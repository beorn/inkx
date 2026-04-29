---
id: "@km/infra/npm-cleanup"
aliases:
  - km-infra.npm-cleanup
  - km-infra-npm-cleanup
created_by: claude:fbad9cb1
created_at: 2026-03-05T08:10:25Z
---

# [ ] Unpublish unused npm placeholder packages (May 2026) @km/infra #task #P4

## What
Review and unpublish unused npm placeholder packages by end of May 2026.

## Placeholders published (all at 0.0.2)
- **finetea** — candidate name for hightea replacement
- **royaltea** — candidate name for hightea replacement
- **claritea** — candidate name for hightea replacement
- **puritea** — candidate name for hightea replacement
- **termless** — confirmed keeper (already published)

## Action
1. Decide final name (finetea is current favorite)
2. `npm unpublish <name> --force` for names NOT chosen (within 72h of publish, or use automation token)
3. For the chosen name: publish real package content
4. Note: npm has a 24h unpublish window for packages with no dependents. After that, need to contact npm support.

## Token
Uses automation token (Classic). Token should be revoked after this work is done.