---
id: "@km/infra/npm-config"
aliases:
  - km-infra.npm-config
  - km-infra-npm-config
created_by: claude:fbad9cb1
created_at: 2026-03-04T16:35:02Z
closed_at: 2026-03-10T15:36:59Z
close_reason: Added files, publishConfig, repository, license to all 16 vendor
  packages. Created .npmignore files. Verified with npm pack --dry-run.
---

# [x] Set up npm publish configuration for all vendor packages @km/infra #task #P2 @claude:55df8ef1

Configure package.json for npm publishing across all vendor/* packages with @beorn/ scope. Includes: exports, types, files, publishConfig, repository fields. Do NOT actually publish — just set up the configuration.

Packages: decant, hightea (hightea + ansi), flexture, termless (in progress via @km/termless/npm-publish), vitestx, mdtest, tools.