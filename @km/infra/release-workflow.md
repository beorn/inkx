---
id: "@km/infra/release-workflow"
aliases:
  - km-infra.release-workflow
  - km-infra-release-workflow
created_by: Bjørn Stabell
created_at: 2026-04-11T22:31:23Z
closed_at: 2026-04-11T22:54:48Z
close_reason: "/release skill redesigned with: --status dashboard, --audit,
  coordinated silvery release, tsdown build, pnpm publish, smoke tests,
  dependency-order publishing. Changesets integration deferred — manual
  coordinated bumps work for now."
owner: bjorn@stabell.org
---

# [x] Redesign /release as complete multi-package release workflow @km/infra #task #P2

## Goal
Make /release a unified workflow that handles the complete release process for all vendor packages:

1. Pre-flight audit (bun infra/audit-packages.ts)
2. Tests (bun run test:fast at minimum)
3. Version bumps (coordinated for @silvery/*, individual for others)
4. Build all packages (tsdown -W)
5. Changelog generation from git + beads
6. Commit version bumps + changelogs
7. Publish in dependency order (pnpm publish)
8. Post-publish smoke tests (npx, node -e import)
9. Git tags + push
10. GitHub releases

Sub-workflows:
- /release --status: show all packages with unpublished changes
- /release --audit: run publishing readiness audit
- /release silvery: release silvery monorepo (all packages)
- /release loggily: release single package
- /release --all: release everything

Should call upon: /repo-health, /tests, audit-packages.ts, tsdown, pnpm publish.
Consider Changesets integration for version management.