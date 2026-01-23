# Versioning

km uses build-time version generation to avoid hardcoded version strings.

## Single Source of Truth

The version is defined in **one place only**: `package.json`

```json
{
  "version": "0.1.0"
}
```

## Build-Time Generation

At build time, `bun run build:info` generates `packages/km-core/src/build-info.gen.ts`:

```typescript
export const VERSION = "0.1.0";
export const GIT_COMMIT = "5197ef0";
export const GIT_BRANCH = "main";
export const GIT_DIRTY = false;
export const BUILD_TIME = "2026-01-23T10:00:00.000Z";

export const BUILD_INFO: BuildInfo = {
  version: VERSION,
  gitCommit: GIT_COMMIT,
  gitBranch: GIT_BRANCH,
  gitDirty: GIT_DIRTY,
  buildTime: BUILD_TIME,
};
```

This file is **gitignored** — it's regenerated on every build.

## Usage

Import from `@km/core`:

```typescript
import { VERSION, BUILD_INFO } from "@km/core";

// For CLI version flag
program.version(VERSION);

// For diagnostics
console.log(`km v${VERSION} (${BUILD_INFO.gitCommit})`);
```

## Bumping the Version

1. Edit `package.json` version field
2. Run `bun run build:info` to regenerate
3. Update `CHANGELOG.md` — move [Unreleased] to new version section
4. Commit: `git commit -m "chore: bump version to X.Y.Z"`
5. Tag: `git tag vX.Y.Z`

## Commands

```bash
bun run build:info    # Regenerate build-info.gen.ts
bun km -V             # Print version
bun km --version      # Same
```

## Environment Variables

The generator checks for CI/Docker environment variables:

- `GIT_COMMIT` — Override git commit hash
- `GIT_BRANCH` — Override git branch name

These are useful when building in containers where git isn't available.

## See Also

- [CLAUDE.md §15](../../CLAUDE.md) — Version info agent guidance
- `scripts/generate-build-info.ts` — Generator script
- `../cloudi/scripts/generate-build-info.ts` — Original pattern
