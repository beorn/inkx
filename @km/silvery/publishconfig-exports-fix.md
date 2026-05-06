---
mentions:
  - km
  - claude
id: "@km/silvery/publishconfig-exports-fix"
aliases:
  - km-silvery.publishconfig-exports-fix
  - km-silvery-publishconfig-exports-fix
created_by: claude:4274df30
created_at: 2026-04-20T21:08:04Z
closed_at: 2026-04-20T21:34:45Z
close_reason: "0.19.2 published. Workflow now uses pnpm publish + build:all +
  pnpm/action-setup + private-pkg skip. npm view
  @silvery/{ansi,color,commander}@0.19.2 dist.fileCount → 7/7/13 (vs 3/3/3 in
  0.19.1). Local smoke: npm install + import works for all four scoped packages
  and root silvery. CI smoke: green on rerun (initial CDN race). Vendor:
  silvery@32812ba1. km root: bump committed (not pushed; user verifies)."
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.publishconfig-exports-fix
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-20T14:08:04Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v4
---

# [x] Sterling 0.19.1: republish with pnpm to fix broken exports @km/silvery #bug #P0 @claude:a1a0e667

blocks:: [[@km/silvery/theme-v4]]

REGRESSION discovered after 0.19.0 ships. release.yml workflow uses 'npm publish' which does NOT apply publishConfig.exports.

3 of 5 published 0.19.0 packages are BROKEN for standalone install:

- @silvery/ansi@0.19.0  → exports: { '.': './src/index.ts' } (wrong)
- @silvery/color@0.19.0 → exports: { '.': './src/index.ts' } (wrong)
- @silvery/commander@0.19.0 → exports: { '.': './src/index.ts' } (wrong)
- @silvery/theme-detect@0.19.0 → dist/* (correct, manually pnpm published)
- silvery@0.19.0 → bundled barrel, masks the issue

Repro:

```
mkdir /tmp/repro && cd /tmp/repro && npm init -y
npm install @silvery/ansi
node -e "import('@silvery/ansi').catch(e => console.error(e.message))"
# Cannot find module '/tmp/repro/node_modules/@silvery/color/src/index.ts'
```

0.18.0 worked because it was published manually via pnpm publish (which DOES apply publishConfig.exports).

vendor/CLAUDE.md explicitly documents this: 'pnpm publish, not npm publish — npm doesn't support publishConfig.exports'.

FIX (one PR):

1. Patch vendor/silvery/.github/workflows/release.yml: replace 'npm publish --access public' with 'pnpm publish --no-git-checks --access public' in the publish() function
2. Bump silvery monorepo to 0.19.1 (cross-package dep refs too)
3. CHANGELOG entry: '## 0.19.1 — Republish with correct exports' (mention the broken 0.19.0 install)
4. Tag v0.19.1 + push → CI republishes all packages with correct exports applied
5. Verify: npm view @silvery/ansi@0.19.1 exports → should show dist/*
6. Smoke test: install standalone @silvery/ansi in temp dir + import

Acceptance:

- npm view @silvery/{ansi,color,commander,theme-detect}@0.19.1 exports → all dist/* paths
- Standalone install + import works for each
- Verify Publishable CI passes

