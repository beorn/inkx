---
id: "@km/infra/release-execute-full"
aliases:
  - km-infra.release-execute-full
  - km-infra-release-execute-full
created_by: Bjørn Stabell
created_at: 2026-04-12T04:45:14Z
closed_at: 2026-04-12T06:07:56Z
close_reason: "Implemented full execute path in release.ts (commit b864a0197).
  Flow: pre-flight (clean tree, fetch tags, skip-if-published) → bump
  (coordinated for silvery/termless/vterm, single-package otherwise) → build
  (npx tsdown) → verify (existing verifyPackage gate, hard stop on failure) →
  commit+tag → publish (pnpm publish, dep-tier order) → post-publish verify
  (waitForNpmResolvable, 30s polling) → push (specific tags only) → update km
  root. Safety: --yes required, --dry-run available, .release-state.json for
  resume-after-failure, never force-push or delete tags. Verified: bun release
  plan, bun release execute --dry-run both work. Dry-run correctly computes
  versions for 6 repos (silvery patch, loggily patch, bearly patch, termless
  patch, vterm patch, watcher-chaos minor)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.release-execute-full
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T21:45:30Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Release execute: full bump+build+verify+publish+tag flow with safety net @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

Execute the full release flow end-to-end in 'bun release execute' instead of stopping at the plan stage.

## Current state
'bun release execute' shows the plan then says 'manual confirmation required'. It doesn't run the actual bump/build/verify/publish/tag loop.

## What to build
Full execute path per repo (in cross-dep topological order):

1. Pre-flight: clean tree, fetch --tags, skip-if-already-published check
2. Bump: npm version (single) or coordinated Python bump script (silvery/termless/vterm)
3. Build: npx tsdown
4. Verify: pnpm pack + install + publint + attw + import + CLI (already built)
5. Commit: 'chore(release): v<version>'
6. Publish: pnpm publish --no-git-checks --access public, in dep order
7. Post-publish: npm view check, wait for registry lag
8. Tag: only AFTER successful publish, using per-repo tag scheme
9. Push: git push + git push origin refs/tags/<tag> (not --tags broad)
10. Update km root submodule pointer

Between repos: verification cascades — after repo A publishes, repo B's verify uses A@new from npm.

## Safety requirements (from Pro review)
- Skip existing: 'npm view <pkg>@<ver>' before publish, skip if exists (resume-safe)
- Tag after publish: only create tags once publish succeeded
- Post-publish verify: wait until npm resolves new version before dependents
- Push specific tags: 'git push origin refs/tags/<tag>' not 'git push --tags'
- Idempotent: safe to re-run after partial failure
- State tracking: consider .release-state.json per repo for resume

## AI changeset proposer integration
When /release is invoked (not --status), skill runs:
1. 'bun release status'
2. 'bun .claude/skills/release/diffs.ts' for each repo with commits
3. Claude reads diffs, writes structured proposal (YAML or similar)
4. User reviews, approves, edits
5. Claude invokes 'bun release execute' with the approved plan

## Reference
- Current execute stub: release.ts executeCmd (line ~482)
- Pro review: /tmp/llm-manual-design-review-ai-native-release-ruml.txt
- Legacy: release.legacy.ts (pre-Pro-review, for comparison)
- Verify (already built): 6 checks — pack, install, publint, attw, import, CLI