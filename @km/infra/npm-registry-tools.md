---
id: "@km/infra/npm-registry-tools"
aliases:
  - km-infra.npm-registry-tools
  - km-infra-npm-registry-tools
created_by: Bjørn Stabell
created_at: 2026-04-12T00:13:06Z
closed_at: 2026-04-12T05:41:16Z
close_reason: Shipped bun npm-registry CLI (.claude/skills/npm/registry.ts) with
  list/status/audit/placeholders/renamed/deprecate/undeprecate subcommands.
  Cached for 5 min in /tmp/.npm-registry-cache.json. /npm skill expanded to
  document registry management. Release skill points at the new tool.
  package.json gains npm-registry script. Audit found 7 version drifts (silvery
  family + loggily + vimonkey) annotated in npm-packages.md as HTML comment for
  the next sync. Commits 570ed1cf9, 992962864.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.npm-registry-tools
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T22:11:11Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] NPM registry management tools/skill @km/infra #task #P3 @Bjørn Stabell

blocks:: [[@km/infra]]

Centralize npm registry interaction into a dedicated /npm skill + tooling.

**Current state**: Ad-hoc `curl https://registry.npmjs.org/...` in release skill, manual `npm view`, no single source of truth for which packages we publish. The release skill has an npm-packages.md registry file but no tooling to keep it current.

**Scope**:
- Skill: .claude/skills/npm/ (query registry, check availability, deprecate, rename, list maintainer packages)
- Tool: `bun npm-registry <cmd>` with subcommands:
  - `list` — all packages by maintainer beorno (paginated)
  - `status <pkg>` — version, downloads, deprecated flag, latest dist-tag
  - `audit` — cross-check release/npm-packages.md against registry reality
  - `deprecate <pkg> <msg>` — wrap `npm deprecate` with confirmation
  - `unpublish-old` — list 0.0.1 placeholders eligible for deprecation
- Auto-update release/npm-packages.md from `npm-registry audit`
- Document known stale placeholders and renamed/superseded packages

**Why**: Every release session re-discovers the package list, re-hits npm API, re-answers 'is this published?'. A proper tool + registry file cuts this to one command.