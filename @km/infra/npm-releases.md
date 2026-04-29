---
id: "@km/infra/npm-releases"
aliases:
  - km-infra.npm-releases
  - km-infra-npm-releases
created_by: claude:55df8ef1
created_at: 2026-03-09T21:18:10Z
closed_at: 2026-03-10T15:37:00Z
close_reason: Created GitHub Actions release workflows for accountly, tap,
  watcher-chaos, silvery (monorepo), termless. Tag-triggered npm publish.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Set up npm release workflows for all vendor packages @km/infra #task #P2 @claude:55df8ef1

## What
Add GitHub Actions release/publish workflows to all vendor packages. Create initial releases.

## Packages
- flexily (0.2.0)
- loggily (0.3.0)  
- @beorn/mdtest (0.2.0)
- silvery (0.0.1) — has changesets already
- @termless/monorepo (0.2.0)
- vitestx (0.2.0)
- mostlydb (new)
- @beorn/accountly, @beorn/tap, @beorn/watcher-chaos, @beorn/tools (TBD)

## Approach
1. Create standard release workflow template (tag-triggered npm publish)
2. Apply to each package
3. Create GitHub releases with tags