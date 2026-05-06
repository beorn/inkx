---
mentions:
  - km
  - Bjørn
id: "@km/infra/release-verify-ci"
aliases:
  - km-infra.release-verify-ci
  - km-infra-release-verify-ci
created_by: Bjørn Stabell
created_at: 2026-04-12T03:45:42Z
closed_at: 2026-04-12T06:18:05Z
close_reason: "Added verify-publishable CI workflow to all 7 vendor repos
  (silvery, loggily, flexily, termless, vterm, vimonkey, watcher-chaos). Each
  runs on push to main + PRs: build → pnpm pack → install in temp dir → publint
  → node import test. Catches the exact class of bugs we hit (missing deps,
  wrong exports, broken tarballs) at PR time instead of after publishing. km
  root commit 84be1c7fa."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.release-verify-ci
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T22:11:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-infra.release-verify-ci
    depends_on_id: km-infra.release-execute-full
    type: blocks
    created_at: 2026-04-11T22:11:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-infra
      - type: link
        target: km-infra.release-execute-full
---

# [x] Run bun release verify in CI on every commit @km/infra #task #P3 @Bjørn Stabell

blocks:: [[@km/infra]], [[@km/infra/release-execute-full]]

Add a CI job that runs `bun release verify` against every package with unreleased changes. Catches publish-time bugs before they ship — pnpm pack + install + publint + attw + import + CLI smoke, all in clean temp dirs.

**Why**: The workspace resolver masks publish-time bugs locally. Four broken publishes in a row happened because npm publish behaves differently from workspace resolution. Verify in CI means we catch these at PR time, not after users hit them.

**Scope**:

- GitHub Actions workflow that runs on push to main + PRs
- For changed packages only (detect via `git diff --name-only`)
- Upload verify output as artifact for debugging
- Fail the build if any package fails verify

**Prerequisite**: @km/infra/release-execute-full (so verify is reliable enough to gate CI on).

