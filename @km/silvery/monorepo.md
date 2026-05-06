---
mentions:
  - km
  - claude
id: "@km/silvery/monorepo"
aliases:
  - km-silvery.monorepo
  - km-silvery-monorepo
created_by: claude:55df8ef1
created_at: 2026-03-09T18:28:18Z
closed_at: 2026-03-09T18:42:17Z
close_reason: "Created beorn/silvery GitHub repo with: bun workspaces (8
  packages: react, term, ansi, theme, tea, ui, test, compat), changesets (fixed
  versioning), oxlint+oxfmt (not biome), TypeScript. All packages have stub
  src/index.ts. https://github.com/beorn/silvery"
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Set up silvery monorepo with bun workspaces + changesets @km/silvery #task #P2 @claude:55df8ef1

Set up the silvery GitHub monorepo (beorn/silvery) with unified versioning infrastructure.

## Tooling

- **bun workspaces** for package management (preferred runtime)
- **changesets** (@changesets/cli) for unified versioning and changelog generation
- All packages share the same version number (Angular-style)
- **biome** for lint/format (consistent with km)

## Structure

```
silvery/
├── package.json          ← bun workspace root
├── bun.lock
├── biome.json
├── tsconfig.json         ← base tsconfig
├── .changeset/
│   └── config.json       ← fixed versioning mode
├── src/index.ts          ← bundle re-exports
├── packages/
│   └── ...               ← workspace packages
└── docs/                 ← silvery.dev (vitepress or similar)
```

## Changeset config (fixed mode)

```json
{
  "fixed": [["@silvery/*", "silvery"]],
  "access": "public",
  "baseBranch": "main"
}
```

## CI

- GitHub Actions: test, lint, publish (on tag/release)
- `bun changeset version` → `bun changeset publish`

