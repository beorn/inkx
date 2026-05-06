---
mentions:
  - km
id: "@km/terminfo/workspace-layering"
aliases:
  - km-terminfo.workspace-layering
  - km-terminfo-workspace-layering
created_by: claude:4929065a
created_at: 2026-04-01T23:01:50Z
owner: bjorn@stabell.org
---

# [ ] terminfo.dev: add bun workspaces for packages/ — clean dependency layering @km/terminfo #task #P3

Add bun workspaces to terminfo.dev for clean package layering.

Current: packages import each other via relative paths (../../probe-defs/src/).
Target: workspace dependencies with proper package names.

Dependency graph (bottom → top):
  @terminfo/probe-defs    ← pure data: probe definitions, types
    ↑
  packages/probes         ← Vitest runner (termless backends)
  packages/terminfo.dev   ← npm CLI (inline TTY probes)
    ↑
  packages/admin          ← dev CLI (orchestration)

Steps:

1. Add "workspaces": ["packages/*"] to root package.json
2. Add @terminfo/probe-defs as dependency in probes/ and terminfo.dev/
3. Replace relative imports with package imports
4. Verify bun install resolves workspace deps

