---
mentions:
  - km
  - claude
id: "@km/termless/backend-mgmt"
aliases:
  - km-termless.backend-mgmt
  - km-termless-backend-mgmt
created_by: claude:4929065a
created_at: 2026-03-22T06:48:06Z
closed_at: 2026-03-22T06:59:22Z
close_reason: "Implemented Playwright-grade backend management: backends.json
  manifest, registry API (resolveBackend, createTerminalByName, health checks),
  CLI commands (backends, install, upgrade, doctor), async test fixture, 27
  registry tests, 4 doc updates"
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Backend version management system (Playwright-grade) @km/termless #feature #P1 @claude:4929065a

Comprehensive backend management for termless — manifest, registry, CLI commands (install/upgrade/backends/doctor). Inspired by Playwright's browser management: one version number controls everything, easy discovery, one-command install/upgrade.

