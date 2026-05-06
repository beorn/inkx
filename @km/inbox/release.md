---
mentions:
  - km
id: "@km/inbox/release"
aliases:
  - km-release
  - "@km/_orphan/release"
created_at: 2026-01-23T10:36:34Z
closed_at: 2026-01-23T10:38:28Z
---

# [x] Add release-it for GitHub releases @km/_orphan #feature #P2

## Summary

Setup release-it for automated GitHub releases with conventional changelog.

## Implementation

- [x] Install release-it and @release-it/conventional-changelog
- [x] Create .release-it.json config
- [x] Add 'release' script to package.json
- [x] Create docs/dev/releasing.md
- [x] Update CLAUDE.md §17 with release section
- [x] Test with --dry-run (validates preconditions correctly)

## Usage

```bash
bun release              # Interactive
bun release patch        # Patch release
bun release --dry-run    # Preview
```

## What it does

1. Validates clean git tree, main branch
2. Bumps version in package.json
3. Runs bun run build:info (via hook)
4. Updates CHANGELOG.md from conventional commits
5. Git commit + tag
6. Creates GitHub release
7. Pushes everything

## Files Created/Modified

- .release-it.json (created)
- package.json (added devDeps + release script)
- docs/dev/releasing.md (created)
- CLAUDE.md §17 (added)

