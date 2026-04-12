---
description: "Release packages — status, verify, and execute releases across km vendor submodules. AI-native changelog/bump from diffs, real pre-publish verification."
argument-hint: "[status|verify|<repo>|all] [--dry-run]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release, status, verify

## Shape

The release workflow coordinates publishing 8 vendor git submodules to npm. We keep submodules (some repos are private, some public — can't mix in one monorepo) and make the tooling work for them.

The intelligence lives in Claude reading diffs and writing changelogs. The mechanics live in thin, testable tools.

| Piece | What | Implementation |
|-------|------|----------------|
| **status** | Gather versions, tags, npm state, unreleased commit counts across all repos | `bun release status [-v]` |
| **diffs** | Dump unreleased commits + full diffs for AI to read | `bun .claude/skills/release/diffs.ts [repo]` |
| **propose** | AI reads diffs, drafts bump decisions + changelog entries | Claude (prompted by skill) |
| **verify** | pnpm pack + isolated install + publint + attw + import + CLI run | `bun release verify <pkg>` |
| **execute** | For each repo in dep order: bump, build, verify, publish, tag, push | `bun release execute [filter]` |

**Submodule-aware:**
- Per-package tag schemes: `v<version>` for coordinated repos, `<name>-v<version>` for per-package repos (bearly)
- Publish safety: skip if `npm view <pkg>@<ver>` already exists
- Tag **after** successful publish, not before
- Push only the specific tags we created
- State tracking for partial-publish recovery (see `.release-state.json` per repo)

## Usage

| Command | What happens |
|---------|--------------|
| `/release` | Full flow: status → AI proposal → confirm → execute |
| `/release --status` | Read-only status |
| `/release verify <pkg>` | Full verification: pack → install → publint → attw → import → CLI |
| `/release silvery` | Scope to silvery repo |
| `/release --dry-run silvery` | Show plan, don't publish |

## The Flow

### Step 1: Release Status

Run `bun release status`. Table per repo: versions, tags, npm state, unreleased counts. Flags:
- `NOTAG` — published but no git tag (housekeeping)
- `DRIFT` — local version ≠ npm
- `UNPUBLISHED` — never published
- `N new` — commits since last tag

### Step 2: AI Proposal

For each repo with unreleased changes:
1. Run `bun .claude/skills/release/diffs.ts <repo>` to get structured commits + full diffs
2. **Claude reads the diffs and proposes:**
   - Affected packages (what changed in each dir)
   - Bump type per package (major/minor/patch)
   - Breaking flag
   - Dependent bumps (if A changes, what consumers need updating?)
   - Changelog entry (human-quality prose, not commit subjects)

**Output format** (structured, not freeform markdown — validates cleanly):
```yaml
repo: vendor/silvery
release:
  - packages: [silvery, "@silvery/ansi", "@silvery/color", ...]
    bump: patch  # or minor, major
    breaking: false
    rationale: "Fixes kitty keyboard detection on iTerm2; adds new Text color prop."
    changelog: |
      ## 0.17.4
      
      - **Fixed**: kitty keyboard detection on iTerm2 (was false-positive on legacy terminals)
      - **Added**: `color` prop to `<Text>` accepts semantic tokens like `"$primary"`
```

**Major bumps require human-authored rationale.** The AI can suggest major, but the user must confirm with a written note explaining breakage.

**Dependent bump policy**: If package A has a major bump and package B re-exports A's types/API, B also needs a major. Claude checks each consumer explicitly.

### Step 3: Review + Confirm

Present the proposal to the user. They can:
- Approve all
- Edit individual rationales or bump levels
- Reject specific packages
- Abort

### Step 4: Execute

For each repo in **dep order** (topological by cross-deps):

1. **Pre-flight**:
   - `git status --porcelain` — clean tree
   - `git fetch --tags` — sync remote state
   - `npm view <pkg>@<ver>` — skip if already published at proposed version (resume-safe)

2. **Bump**: update package.json versions + cross-dep refs. For coordinated repos (silvery, termless, vterm), bump ALL public + private packages to the new version.

3. **Changelog**: prepend entry from AI proposal to each package's CHANGELOG.md (Keep a Changelog format).

4. **Build**: `npx tsdown` (reads config from package.json `tsdown` field).

5. **Verify** (mandatory — this is the real gate):
   - `pnpm pack` (applies publishConfig, unlike npm pack)
   - Install tarball in temp dir with isolated npm cache
   - `publint` — catches manifest/exports/files issues
   - `arethetypeswrong` — CJS/ESM dual checks, missing types
   - Import test via Node (not bun!) — catches type-stripping issues
   - CLI test: `bin --help` for packages with bin entries
   - All subpath exports tested
   
   **Any failure here stops the release.**

6. **Commit + tag**:
   - `git commit -am "chore(release): v<version>"`
   - `git tag <tag>` (using per-repo scheme: `v<ver>` or `<name>-v<ver>`)

7. **Publish**: `pnpm publish --no-git-checks --access public` in dependency order.

8. **Post-publish verify**: `npm view <pkg>@<ver>` — confirm resolvable before continuing to dependents (handles registry lag).

9. **Push**: `git push && git push origin <specific-tag>` (not `--tags` — only push the tags we created).

10. **Update km root**: `cd km && git add vendor/<repo> && git commit -m "chore(vendor): <name> v<version>"`.

**Verification cascades**: after repo A publishes, repo B's verify uses A@new from npm (not workspace). Consumer breakage surfaces immediately.

### Step 5: Report

Final status table. Close beads referenced in the proposal.

## Reference

### Tools

- `release.ts` — status, verify, execute (thin orchestration)
- `diffs.ts` — dumps unreleased commits + diffs for Claude to read
- `release.legacy.ts` — pre-upgrade version kept for comparison (delete once new version stable)
- `npm-packages.md` — canonical registry of all 60+ published packages

### Querying the npm registry

Don't curl `https://registry.npmjs.org/...` from inside the release skill. All registry interaction lives in the [`/npm` skill](../npm/SKILL.md), backed by `bun npm-registry`:

```bash
bun npm-registry list             # all packages by maintainer beorno
bun npm-registry status <pkg>     # version, downloads, deprecation, dist-tags
bun npm-registry audit            # cross-check npm-packages.md vs live registry
bun npm-registry placeholders     # stale placeholder packages
bun npm-registry renamed          # renamed/superseded packages
```

Run `bun npm-registry audit` before and after a release to keep `npm-packages.md` honest. Results are cached for 5 minutes in `/tmp/.npm-registry-cache.json`.

### Verify command details

`bun release verify <pkg-or-filter>` does:
1. `cd <package-dir>`
2. `pnpm pack` — gets real tarball with publishConfig applied (npm pack doesn't)
3. Create temp dir with isolated `NPM_CONFIG_CACHE` (avoids stale cache contamination)
4. `npm install <tarball> --no-save`
5. `publint` (via bunx)
6. `arethetypeswrong --pack` (via bunx, only for packages with types)
7. `node -e "import('<pkg>').then(...)"` — verifies import works in Node (not bun)
8. `node -e "import('<pkg>/subpath')"` — for each subpath export
9. For CLI packages: `node_modules/.bin/<cli> --help` (fail if exit non-zero)

Skips import test for CLI-only packages (bin but no library exports).

### Publish safety (per Pro review)

- **Skip existing**: before publish, `npm view <pkg>@<ver>` — if exists, skip (resume-safe)
- **Tag after publish**: only create git tags once publish succeeded
- **Verify registry after publish**: wait until npm resolves the new version before publishing dependents
- **Push specific tags**: `git push origin refs/tags/<tag>` not `git push --tags`
- **Dep-order**: topological sort of cross-deps, fail fast if any step fails

### Known tooling

- **pnpm publish** required — npm doesn't apply `publishConfig.exports`
- **tsdown** for builds — config in package.json `"tsdown"` field
- **bunx publint** for manifest lint
- **bunx @arethetypeswrong/cli** for TS consumer checks

### Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| Version exists on npm | Tool skips automatically (resume-safe) |
| Tag already exists | `git tag -d <tag>` and retry |
| verify fails | Fix the bug, rebuild, re-run verify before publish |
| Partial publish | Re-run `/release` — tool skips already-published versions |
| Cross-dep mismatch | Tool re-bumps automatically in dep order |

### Why not Changesets?

Considered. Pros: mature mechanics, good cross-dep handling, standard format. Cons: requires per-repo setup (8 repos), hand-authored .md files (AI can generate but adds a layer), doesn't solve verification. We keep our tool because: (a) submodule topology is load-bearing (privacy) so per-repo changesets don't buy cross-repo coordination, (b) verify is our unique value-add, (c) AI reading diffs gives higher-quality changelogs than commit-message parsing, (d) the orchestration logic is small now that the bugs are fixed.

If the submodule count grows or the cross-repo deps get denser, revisit.
