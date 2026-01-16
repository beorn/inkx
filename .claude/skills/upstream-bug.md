# Skill: Handle Upstream Package Bugs

When encountering a bug in an upstream dependency, follow this systematic workflow to investigate, report, and optionally fix the issue.

## Workflow

### 0. Update Dependencies First

Before investigating, ensure you're on the latest version - the bug may already be fixed:

```bash
# Update to latest version
bun update <package>@latest

# Run tests to verify nothing broke
bun test

# Try to reproduce the issue again
# If it's fixed, you're done!
```

### 1. Isolate and Confirm the Bug

First, confirm the bug is in the upstream package, not your code:

```bash
# Create minimal reproduction
mkdir /tmp/bug-repro && cd /tmp/bug-repro
# Create minimal package.json with only the dependency
# Create minimal repro.tsx that triggers the bug
bun install && bun run repro.tsx
```

### 2. Search for Existing Reports

Check if the bug is already reported:

```bash
# Search GitHub issues
gh search issues --repo <owner>/<repo> "<keywords>"

# Or use web search
# site:github.com/<owner>/<repo> <bug keywords>
```

Also check:
- Open issues on the repo
- Recent releases/changelogs for fixes
- Discussions or related projects

### 3. If Fix Exists

If a fix is available in a newer version:

```bash
# Update the dependency
bun update <package>@latest

# Or pin to specific version with fix
bun add <package>@<version>
```

If the fix is in a PR but not released:
- Consider vendorizing (see below)
- Or wait for release and apply workaround

### 4. If No Fix Exists - File Bug Report

**Important**: Always ask the user for permission before posting issues or PRs to external repositories.

Create a high-quality bug report:

```bash
gh issue create --repo <owner>/<repo> \
  --title "Bug: <concise description>" \
  --body "$(cat <<'EOF'
## Environment
- OS: macOS/Linux/Windows (version)
- Runtime: Bun/Node (version)
- Package: <package>@<version>

## Description
<What happens vs what should happen>

## Reproduction
\`\`\`typescript
// Minimal code that triggers the bug
\`\`\`

## Expected Behavior
<What should happen>

## Actual Behavior
<What actually happens, including error messages>

## Analysis
<If you've investigated: root cause hypothesis>

## Workaround
<If you found one>

## Suggestion
<Optional: proposed fix approach>
EOF
)"
```

### 5. Subscribe to the Issue

```bash
# Subscribe to get notifications
gh issue view <issue-number> --repo <owner>/<repo>
# Click "Subscribe" in the web UI
```

### 6. Vendorize if Needed

If you need to fix it yourself (blocking issue, no upstream response):

```bash
# Clone the dependency
git clone https://github.com/<owner>/<repo> vendor/<repo>

# Or if it's an npm package, copy from node_modules
cp -r node_modules/<package> vendor/<package>

# Update your package.json to use local version
# "dependencies": {
#   "<package>": "file:./vendor/<package>"
# }

# Make your fix in the vendored copy
```

### 7. Submit PR Upstream

**Important**: Always ask the user for permission before submitting PRs to external repositories.

If you've fixed it:

```bash
cd vendor/<repo>
git checkout -b fix/<issue-description>

# Make changes, test

git add . && git commit -m "Fix: <description>

Fixes #<issue-number>"

# Fork and push
gh repo fork --clone=false
git remote add fork https://github.com/<your-user>/<repo>
git push fork fix/<issue-description>

# Create PR
gh pr create --repo <owner>/<repo> \
  --title "Fix: <description>" \
  --body "Fixes #<issue-number>

<Description of the fix>"
```

## Example: OpenTUI borderStyle Segfault

**Bug**: Invalid `borderStyle` value causes segfault in native Zig library.

**Steps taken**:
1. Isolated via binary search testing
2. Searched GitHub - no existing report
3. Created repro: `packages/km-tui-opentui/src/repro-crash.tsx`
4. Filed issue: https://github.com/anomalyco/opentui/issues/543
5. Applied workaround: Changed `borderStyle="round"` to `borderStyle="single"`

**Workaround applied**: Commit `092b891`

## Checklist

- [ ] Bug confirmed in upstream package
- [ ] Searched for existing reports
- [ ] Created minimal reproduction
- [ ] Filed bug report (if new)
- [ ] Subscribed to issue
- [ ] Applied workaround in your code
- [ ] (Optional) Vendorized and fixed
- [ ] (Optional) Submitted PR upstream
