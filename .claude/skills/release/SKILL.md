---
description: "Release packages — AI-native coordinated release across vendor submodules. Claude reads diffs, proposes changesets, executes with verify."
argument-hint: "[status|propose|verify|execute|<repo>|all] [--dry-run]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release, status, propose, changeset

## Shape

**AI-native coordinated release across 8 vendor submodules.**

The intelligence is in Claude reading diffs and writing changesets. The tools are thin:

| Piece | What | Who/what does it |
|-------|------|------------------|
| `bun release status` | Gather versions, tags, npm state, unreleased commit counts | TS tool |
| `bun .claude/skills/release/diffs.ts [repo]` | Dump unreleased commits with full diffs | TS tool |
| `/release propose` | Read diffs, group logical changes, write `.changeset/*.md` proposals | **Claude** |
| (user reviews/edits changeset files) | Human approval | User |
| `bun release verify <pkg>` | pnpm pack + install + run in temp dir | TS tool |
| `/release` (execute) | For each repo in dep order: `changeset version` → build → verify → `changeset publish` → push | TS tool + Claude orchestration |

**Changesets** (github.com/changesets/changesets) handles the mechanics: version bumps, cross-dep updates, changelog generation, topological publish order, git tags. We never hand-author changeset files — **Claude generates them from diffs**, user reviews.

## Repos

| Repo | Versioning | `linked` config |
|------|-----------|-----------------|
| `vendor/silvery` | coordinated | `[["silvery", "@silvery/*"]]` (9 public packages share one version) |
| `vendor/loggily` | single | none |
| `vendor/flexily` | single | none |
| `vendor/bearly` | per-package | none |
| `vendor/termless` | coordinated | `[["@termless/*"]]` |
| `vendor/vterm` | coordinated | `[["vt100.js", "vt220.js", "vterm.js"]]` |
| `vendor/vimonkey` | single | none |
| `vendor/watcher-chaos` | single | none |

Each repo has its own `.changeset/` directory.

## The Flow

### Step 1: `bun release status` — assess

Read-only dashboard across all 8 repos. Shows: version match (local ↔ npm), tag presence, unreleased commit count. First use this to see what's pending.

### Step 2: `/release propose` — AI generates changesets

Claude reads the raw data and writes changeset proposals:

1. Run `bun .claude/skills/release/diffs.ts` to get a markdown dump with unreleased commits + full diffs across all repos
2. For each repo with commits, read the diffs carefully
3. Group related commits into logical changes (not one changeset per commit — one per *intent*)
4. For each logical change, determine:
   - **Which packages are affected** (via which files changed)
   - **Bump type**: `major` if API/removal/breaking, `minor` if new feature/export, `patch` for fixes/docs/chores
   - **Human-quality description** — explain the *why*, not just "updated X"
5. Write `.changeset/<slug>.md` files in each repo:
   ```markdown
   ---
   "package-a": minor
   "package-b": patch
   ---
   
   Added new layout engine option (closes #123)
   
   Details about the change, impact, migration notes if any.
   ```
6. Print a summary to the user: "Proposed N changesets across M repos"

**Writing quality**: these are the CHANGELOG entries users will read. Write like a release engineer, not like a commit message. Explain what and why. Mention breaking changes prominently.

### Step 3: Review

User reviews the `.changeset/*.md` files across repos. They can:
- Edit any file directly (it's just markdown)
- Delete files they don't want in this release
- Add their own changeset files for changes not yet captured

### Step 4: `/release` — execute

For each repo with pending changesets, in **topological dep order** (packages with no @silvery/loggily/flexily deps first, consumers later):

1. `cd <repo>`
2. `pnpm changeset version` — bumps versions, updates cross-deps, prepends CHANGELOG, deletes consumed changesets
3. `pnpm install` — refreshes lockfile with new versions
4. `npx tsdown` (or the repo's build) — builds dist
5. `bun release verify` — pnpm pack + temp install + run CLI/import (aborts on failure)
6. `pnpm changeset publish` — publishes in dep order, creates tags
7. `git push --follow-tags`
8. Update km root submodule pointer

After all repos: `cd km && git commit vendor/<repos>`, push.

**Verification cascades**: since releases happen in dep order, when silvery's verify runs, it sees the already-published new loggily/flexily from earlier in this execution. Consumer breakage is caught immediately.

### Step 5: Report

Final status table showing what was released and at what versions. Close any beads referenced in the changesets.

## Setup (one-time per repo)

```bash
cd vendor/<repo>
pnpm add -D @changesets/cli
pnpm changeset init
# Edit .changeset/config.json to set `linked` for coordinated repos
```

Config example for silvery:
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/changelog-github",
  "commit": false,
  "linked": [["silvery", "@silvery/ansi", "@silvery/color", "@silvery/commander", "@silvery/examples"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

## Reference

### Tooling

- `release.ts` — status, verify, execute orchestration (thin wrapper)
- `diffs.ts` — gathers unreleased commits + full diffs for Claude to read
- `npm-packages.md` — canonical registry of all published packages
- `release.legacy.ts` — previous iteration (for comparison, to be deleted)

### Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| Version exists on npm | Changeset status will show it; either skip or bump again |
| Tag already exists | `git tag -d vX.Y.Z` and retry (changesets tag automatically) |
| verify fails | Fix the bug, rebuild, re-run verify before publishing |
| Partial publish failure | Changesets publishes what it can; re-run to finish |

### Why AI-native?

The thing a human brings to a release is *understanding what the changes mean*. Conventional-commit parsers mechanically map `feat:` → minor, but miss subtle breaking changes. Changeset files are a review artifact — they should read like release notes, not commit messages. Claude reading diffs produces that quality directly.

The thing changesets brings is *the mechanics*: version bumping, cross-dep propagation, topological publish, git tags, changelog formatting. Those are solved problems — no reason to rebuild them.

The combination: Claude writes the changesets (the intelligence), changesets executes (the mechanics), verify is the gate (the safety net).
