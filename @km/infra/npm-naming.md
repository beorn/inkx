---
id: "@km/infra/npm-naming"
aliases:
  - km-infra.npm-naming
  - km-infra-npm-naming
created_by: claude:fbad9cb1
created_at: 2026-03-04T22:27:49Z
closed_at: 2026-03-07T02:12:24Z
close_reason: "Grooming: merged into km-infra.npm-hightea — fallback rename is
  part of the same npm acquisition decision"
owner: bjorn@stabell.org
---

# [x] Consider renaming hightea — npm name blocked by high-tea similarity @km/infra #task #P2

## Decision Status
**Leading candidate: finetea** (fine tea — craftsmanship, precision, attention to detail)
- Backup: royaltea (royalty — regal, premium)

## What's Done
- npm: finetea, royaltea, claritea, puritea, termless all published (0.0.2 placeholders, May 2026 expiry)
- Domains: finetea.dev + finetea.app bought, DNS on Cloudflare, 301-redirect to hightea.dev
- hightea.dev remains primary for now

## npm Availability — How to REALLY Check
npm strips hyphens when comparing: `high-tea` = `hightea` → BLOCKED. This caught us.

### Reliable process:
1. `npm view <name>` — 404 = doesn't exist (necessary but NOT sufficient)
2. `npm view <hyphen-variant>` — check ALL plausible hyphenations (e.g., `fine-tea` for `finetea`)
3. `curl https://registry.npmjs.org/<name>` — same as above, scriptable
4. Check npm user/org: `curl https://www.npmjs.com/~<name>` and `/org/<name>`
5. `npm publish --dry-run` — validates locally only, does NOT check server-side similarity
6. **Actually publish a 0.0.1 placeholder** — the ONLY 100% reliable test

### What we got wrong with hightea
Checked `npm view hightea` (404) and assumed available. Didn't check `npm view high-tea` (EXISTS).

## Name Research (finetea)
- npm: ✅ owned by us
- GitHub: minor overlap (academic ML dataset "FineTea", personal username) — no software projects
- finetea.dev: ✅ owned by us
- finetea.app: ✅ owned by us
- finetea.com: parked for sale (not critical)
- PyPI, crates.io: available
- Twitter @finetea: likely available
- Trademarks: none found in software
- Software conflicts: NONE

## Pending
- [ ] Final name decision (finetea vs keep hightea with npm dispute)
- [ ] Create @finetea npm org (via npmjs.com website)
- [ ] If renaming: full codebase rename (hightea → finetea)
- [ ] Unpublish unused placeholders (see @km/infra/npm-cleanup)