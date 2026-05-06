---
mentions:
  - km
id: "@km/infra/release-tool-redesign"
aliases:
  - km-infra.release-tool-redesign
  - km-infra-release-tool-redesign
created_by: Bjørn Stabell
created_at: 2026-04-12T04:01:23Z
closed_at: 2026-04-12T06:00:37Z
close_reason: Superseded by the dev-publish gap reframe (/big analysis). The
  ReleaseUnit abstraction, two-phase verify, and workflow reorder were designed
  to make a complex tool more robust. But the /big analysis concluded the tool
  is a symptom — the real fix is closing the dev/publish gap (exports
  restoration, package-contract tests in CI). With exports now properly restored
  (km-infra.silvery-exports-drift), the tool's verify gate catches real issues
  instead of masking them. The remaining practical work (full execute path) is
  tracked in km-infra.release-execute-full, which is simpler than the
  ReleaseUnit redesign and achieves the same end. Verdaccio ephemeral registry
  (the one genuinely useful idea from this bead) can be added later as a point
  improvement to verify, not as a tool rewrite.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.release-tool-redesign
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T21:01:39Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Release tool: ReleaseUnit abstraction + two-phase verify + workflow reorder @km/infra #task #P2

blocks:: [[@km/infra]]

From GPT-5.4 Pro review of /release skill (5.04 toolchain). Architectural items not addressed in the 8 critical fixes commit edd19c171.

## ReleaseUnit abstraction

Replace 'monorepo: boolean' with a real config:

- physical package (package.json)
- release unit (what versions together)
- tag strategy (shared / per-package)
- publish order (dependency tiers)
- change scope (paths that trigger release)
- public vs internal (private packages still affect coordinated public release)

Group by release unit, not repo name.

## Two-phase verify

Split verify into:

- verify-local: pnpm pack + temp install (prepublish gate, current 'verify')
- verify-registry: install name@version from npm (postpublish proof)

Reorder execute to: build → verify-local → publish → verify-registry → push tags → GH release.
Currently push happens before verify, so broken publishes leak.

## Coordinated multi-tarball verify

For coordinated releases (silvery), verify-local needs to install MULTIPLE local tarballs together, not one at a time. Otherwise package B depending on package A at unreleased version will fail until A is on npm.

## Stale tag protection

- git fetch --tags --prune at start of mutating commands
- Detect tag-points-to-wrong-commit (verify tag commit version matches current version)
- Detect coordinated tag missing some packages

## Tarball content inspection

verify currently only tests that import works. Should also:

- Parse tarball, validate every export target exists
- Ensure no .ts source ships when files: ['dist']
- Detect workspace: protocol leaking into published manifest
- Validate bin targets exist

## Test fixtures

Pro recommended fixture repos for:

- bearly per-package tags
- coordinated shared tags
- duplicate tag creation
- missing tag then recalc delta
- tagged-but-unpublished
- initial release
- string exports
- scoped CLI bin
- private-package change affecting coordinated release
- shared root config change

## Reference

- Pro review: /tmp/llm-manual-review-the-release-skill-xl5d.txt (full text)
- Current tool: .claude/skills/release/release.ts
- Skill doc: .claude/skills/release/SKILL.md
- 8 critical fixes: edd19c171

