---
id: "@km/silvery/token-manifest"
aliases:
  - km-silvery.token-manifest
  - km-silvery-token-manifest
created_by: claude:22c2717d
created_at: 2026-04-25T16:41:04Z
closed_at: 2026-04-25T17:13:02Z
close_reason: Closed
started_at: 2026-04-25T16:51:36Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.token-manifest
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-25T09:41:04Z
    created_by: claude:22c2717d
    metadata: "{}"
---

# [x] Sterling tokenManifest.ts — single source of truth + doc generation @km/silvery #task #P2 @claude:22c2717d

blocks:: [[@km/all/sterling]]

Create vendor/silvery/packages/theme/src/sterling/tokenManifest.ts as the
authoritative source for documentation, storybook TokenTree labels, and
contract tests. Powers the gen-token-docs.ts script.

## Acceptance

- [ ] tokenManifest.ts exports PUBLIC_TOKENS array; per-token: { flat, path,
      family, axis, purpose, derivationKey, exampleStory, tierNotes, contract }
- [ ] Contract test: PUBLIC_TOKENS.length matches actual flat-token count
- [ ] scripts/gen-token-docs.ts reads manifest + Nord palette + emits
      vendor/silvery/docs/reference/tokens.md
- [ ] Page opens with grammar + decision tree (status vs intent, variant
      vocab, family capabilities); per-family tables with hex/contrast/
      derivation/tier-fallback
- [ ] CI check: bun run docs:gen && git diff --exit-code

## Why deferred

Tier 1 + consolidate-design-demos shipped without blocking on this. The
manifest is foundation for sterling-storybook polish (@km/silvery/sterling-
storybook epic) and silvery.dev docs but not load-bearing for the
storybook itself today.