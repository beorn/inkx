---
description: Handle bugs in upstream dependencies - report, vendorize, fix, track until landed
---

# Skill: Handle Upstream Package Bugs

**Keywords**: upstream bug, vendor, submodule, dependency bug, package bug, vendorize, file issue, report bug, github issue, bug report, upstream waiting, track upstream, waiting on upstream, blocked on upstream, when fix lands, unwind workaround, oven-sh, bun bug, node bug, register upstream

When encountering a bug in an upstream dependency, follow this systematic workflow: investigate, report, apply workaround, **register for tracking**, unwind when upstream lands.

**Activation**: Use this skill whenever:
- Filing a bug against an external project (MUST be loaded before `gh issue create` on any repo you don't own).
- Applying a workaround in our code that depends on an upstream fix.
- Mentioning "waiting on", "blocked on", "when fix lands", or "unwind" in connection with an upstream package.
- Reviewing the upstream-waiting backlog (e.g. during `/sop infra`).

The pre-step-1 mental model: filing alone is not enough. A filed bug with a workaround in our code is a permanent debt unless someone tracks it. **Step 8 (Register for tracking) is mandatory whenever a workaround lands in our code** — without it, the workaround outlives the upstream fix and quietly accumulates.

## Workflow

### 0. Update Dependencies First

Before investigating, ensure you're on the latest version — the bug may already be fixed:

```bash
bun update <package>@latest
bun run test:fast   # verify nothing broke
# Try to reproduce — if fixed, you're done
```

### 1. Isolate and Confirm the Bug

Confirm the bug is in the upstream package, not your code:

```bash
mkdir /tmp/bug-repro && cd /tmp/bug-repro
# Create minimal package.json + repro script
bun install && bun run repro.tsx
```

### 2. Read the Source Code

Before theorizing about root cause, **read the actual source** to verify your hypothesis:

```bash
# Fetch the relevant source file from the project
WebFetch the raw source from GitHub (e.g. raw.githubusercontent.com/owner/repo/main/path/to/file.rs)
# Or clone locally and read
```

**Never file a bug report with an unverified root cause analysis.** If you claim "line X does Y", confirm it by reading line X.

### 3. Search for Existing Reports

```bash
gh search issues --repo <owner>/<repo> "<keywords>"
gh search issues --repo <owner>/<repo> "crash"
gh search issues --repo <owner>/<repo> "memory"
# Also try WebSearch for broader coverage
```

Check: open issues, recent releases/changelogs, discussions. Also check if the project has a parent/upstream repo (e.g., `coder/ghostty-web` wraps `ghostty-org/ghostty`) — the bug may need to be filed upstream of the upstream.

### 4. Assess the Project

Before filing, understand the project's health, culture, and responsiveness. This determines **whether**, **where**, and **how** to file — and whether to invest effort waiting for a response or just fix it yourself.

#### 4a. Project Profile

Who owns this? What's the business model? Is this the canonical repo or a wrapper/fork?

```bash
# Repo metadata
gh api repos/<owner>/<repo> --jq '{ stars: .stargazers_count, forks: .forks_count, open_issues: .open_issues_count, created: .created_at, pushed: .pushed_at, license: .license.spdx_id, description: .description }'

# Org profile
gh api orgs/<owner> --jq '{ name: .name, blog: .blog, description: .description }'
```

**Note**: The npm package name may differ from the GitHub repo (e.g., `ghostty-web` npm package lives at `coder/ghostty-web` on GitHub). Verify which repo is canonical.

#### 4b. Maintainer Activity

Recent commits, contributor distribution, release cadence:

```bash
gh api repos/<owner>/<repo>/commits --jq '.[0:5] | .[] | .commit.author.date + " " + (.commit.message | split("\n")[0])'
gh api repos/<owner>/<repo>/contributors --jq '.[0:5] | .[] | .login + " (" + (.contributions|tostring) + ")"'
gh release list --repo <owner>/<repo> --limit 5
```

Key questions: Is development active or stalled? Is it one person or a team? How often do they release?

#### 4c. Issue Responsiveness

The most important signal. Fetch recent issues and analyze patterns:

```bash
gh issue list --repo <owner>/<repo> --state all --limit 30 --json number,title,state,createdAt,comments,author
```

Evaluate:
- **Response time**: Hours? Days? Weeks? Never?
- **Response quality**: Thoughtful engagement or just label+close?
- **Trend**: Improving or declining? (compare oldest vs newest in the batch)
- **Community health**: Are users posting workarounds? Community forks? "Any updates?" comments?
- **PR merge rate**: Are external PRs being reviewed and merged?

#### 4d. Contribution Policies

Check before filing:
- **AI policy** (`AI_POLICY.md`, `AGENTS.md`, or in `CONTRIBUTING.md`). Some projects require full AI disclosure, human review of all AI-generated content, and may denounce contributors who submit AI slop. If a project bans AI-generated issues, provide findings to the user — they must write/file it themselves.
- **Issue templates** (`.github/ISSUE_TEMPLATE/`)
- **CLA requirements**
- **Preferred contact channels** — some projects prefer Discord/Slack over GitHub issues

```bash
# Check for AI policy
gh api repos/<owner>/<repo>/contents/AI_POLICY.md 2>/dev/null && echo "Has AI_POLICY.md"
gh api repos/<owner>/<repo>/contents/AGENTS.md 2>/dev/null && echo "Has AGENTS.md"
gh api repos/<owner>/<repo>/contents/CONTRIBUTING.md 2>/dev/null && echo "Has CONTRIBUTING.md"

# Check for issue templates
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE --jq '.[].name' 2>/dev/null || echo "No issue templates"
```

#### 4e. Decision Matrix

Based on the assessment:

| Signal | Action |
|--------|--------|
| Active maintainers, <1 week response | File confidently — expect engagement |
| Moderate activity, 1-4 week response | File — but apply workaround locally, don't wait |
| Low activity, >1 month response | File for the record — vendorize/fix yourself |
| Abandoned (no commits/responses in months) | Don't file — fork or find alternative |
| Active project but strict AI policy | Provide findings to user — they must write/file |
| Community forks more active than upstream | Consider filing on fork instead |

**Report assessment to user with recommendation before proceeding to file.**

### 5. If No Fix Exists — File Bug Report

**Important**: Always ask the user for permission before posting issues to external repositories.

#### 5a. Check the project's issue templates (CRITICAL)

**Every project has its own bug report format.** Using the wrong template causes friction and may get your issue closed or ignored.

```bash
# List available issue templates
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE --jq '.[].name'

# Read the relevant template
WebFetch https://raw.githubusercontent.com/<owner>/<repo>/main/.github/ISSUE_TEMPLATE/<template-file>
```

Common patterns:
- **YAML templates** (`.yaml`/`.yml`): Structured forms with required fields. Match the field IDs exactly.
- **Markdown templates** (`.md`): Section headings to fill in. Follow the structure.
- **No templates**: Use the generic format below.
- **Multiple templates**: Pick the most specific one (e.g., `linter_bug_report.yaml` over `bug_report.md`).

**Also check for**:
- Required title prefixes (e.g., `linter: `, `bug: `)
- Required labels (you may not have permission to add them — that's OK, maintainers will triage)

#### 5b. Write the report matching their template

Adapt your content to their format. If they ask for "version", put the version where they want it. If they have a "reproduction" section, put repro steps there — not in a generic "description" blob.

**If no template exists**, use this structure:

```markdown
## Environment
- OS: <os> (<version>)
- Package: <package>@<version>

## Description
<What happens vs what should happen>

## Reproduction
<Minimal steps or code>

## Error Output
<Exact error, copy-pasted>

## Analysis
<Root cause — only if verified against source code>

## Workaround
<If you found one>

## Suggested Fix
<Optional: proposed approach with code>
```

#### 5c. Quality checklist before submitting

- [ ] AI policy checked — disclosure requirements met, human-reviewed content
- [ ] Title follows project conventions (check existing issues for style)
- [ ] Version number included
- [ ] Error output is exact copy-paste, not paraphrased
- [ ] Root cause claims are verified against actual source code
- [ ] Reproduction steps are minimal and self-contained
- [ ] Workarounds listed (helps others + shows you tried)
- [ ] Tone is respectful and factual — describe symptoms, not complaints

```bash
# Write body to temp file first (avoids heredoc backtick escaping issues)
cat > /tmp/issue-body.md << 'EOF'
<body matching their template>
EOF

gh issue create --repo <owner>/<repo> \
  --title "<prefix><concise description>" \
  --body-file /tmp/issue-body.md
```

**Note on labels**: You typically can't add labels to repos you don't own. Don't use `--add-label` — let maintainers triage.

### 6. Vendorize if Needed

If you need to fix it yourself (blocking issue, no upstream response):

```bash
git clone https://github.com/<owner>/<repo> vendor/<repo>
# Update package.json: "<package>": "file:./vendor/<package>"
# Make your fix in the vendored copy
```

### 7. Submit PR Upstream

**Important**: Always ask the user for permission before submitting PRs to external repositories.

```bash
cd vendor/<repo>
git checkout -b fix/<issue-description>
# Make changes, test
gh repo fork --clone=false
git remote add fork https://github.com/<your-user>/<repo>
git push fork fix/<issue-description>
gh pr create --repo <owner>/<repo> \
  --title "Fix: <description>" \
  --body "Fixes #<issue-number>"
```

### 8. Register for tracking (MANDATORY when a workaround lands)

If steps 5–7 left a workaround in our code, **register the bead in `km-all.upstream-waiting`** so the workaround unwinds when upstream lands. Without this step, workarounds become permanent silent debt — the registry is the only mechanism that ensures revisit.

#### When to register
- A workaround was applied (any change to our code that exists *because* upstream is broken).
- A vendorized fix is in place but a PR is open upstream — register so we remove our fork once merged.
- Even if the project is moribund and you don't expect a fix — register anyway so it gets reviewed monthly and can be promoted to "fork-and-own" if appropriate.

#### How to register

```bash
# Create the tracking bead under the upstream-waiting epic
bd create --id km-<scope>.<descriptive-slug> \
  --title "Remove <workaround-description> when <upstream-ref> lands" \
  --type=bug --priority=3 \
  --description="<see template below>"
bd update km-<scope>.<slug> --parent km-all.upstream-waiting

# REQUIRED: defer the bead so it surfaces in `bd ready` near its review date.
# Default = creation date + 30 days. Each /sop infra review re-defers another 30d
# if upstream hasn't moved.
bd defer km-<scope>.<slug> --until="<YYYY-MM-DD>"   # creation + 30 days
```

**Description template** (every field is required — the monthly review depends on them):

```
Workaround tracking. <one-sentence summary of what we did and why>.

Upstream: <URL — issue or PR>
Status: <merged-upstream | released-upstream | adopted-locally> as of <YYYY-MM-DD>
  - merged-upstream:   PR merged into upstream's main/master, but not yet in a tagged release
  - released-upstream: published in a release we COULD consume, but our package.json/lock still pins an older version
  - adopted-locally:   our deps actually consume the fix in package.json AND lockfile — the only state where the workaround can be removed
Last checked: <YYYY-MM-DD>
Escalate by: <YYYY-MM-DD>     # default = creation + 6 months
  - At this date re-decide: vendorize | fork | accept owned divergence | continue waiting
  - If "accept owned divergence" → move bead to km-all.owned-divergence (perpetual sibling registry)
  - If "continue waiting" → bump Escalate by another 6 months and document why

Files affected by the workaround:
- <path>
  - <specific change 1: e.g., "URL.toString() in 'new Request(url.toString(), ...)'">
  - <specific change 2>

Unwind when upstream lands:
1. <concrete step 1: e.g., "Replace 'new Request(url.toString(), ...)' with 'new Request(url, ...)'">
2. <concrete step 2: e.g., "Bump <pkg> minimum version in package.json to <patched-release>">
3. <concrete step 3: e.g., "Run vendor/<pkg> tests; verify the workaround test still passes without the workaround">
4. Close this bead with the version that fixed it (only when Status = adopted-locally)
```

**Why each field matters**:
- *Upstream URL*: the only auditable proof a fix has or hasn't landed. Without this, monthly review devolves into guessing.
- *Status (3-state enum)*: `merged ≠ released ≠ adopted`. Closing on "merged-upstream" is the most common false-victory — our code still runs the workaround until our deps actually pull the patched release. Only `adopted-locally` justifies running the unwind steps.
- *Last checked*: gives the monthly reviewer a delta to compare against; updated every review even if nothing changed (this is how we detect orphaned beads).
- *Escalate by*: forces a re-decision before the bead silently becomes "we gave up but won't admit it." Without this, "waiting" beads accumulate forever and the registry stops being honest.
- *bd defer date*: parent-grouping makes the bead visible in monthly review; defer-until makes it active in `bd ready` near its review date — both, not either.
- *Files affected* with specific changes: when the upstream lands months later, the original author may not be available — the bead must be self-contained.
- *Unwind steps*: removing a workaround is rarely a single line. Spelling out the steps prevents partial unwinds (revert one site, miss two).

#### Code-marker convention (REQUIRED for every workaround site)

Every workaround in code must carry a greppable comment block at the call site:

```ts
// UPSTREAM-WAITING(<repo>#<issue>): Delete when <pkg> >= <version>
// Bead: km-<scope>.<slug>
// Escalate by: <YYYY-MM-DD>
```

- `<repo>#<issue>` is the canonical upstream reference (e.g. `oven-sh/bun#7716`). Match the bead's `Upstream:` URL.
- `Bead:` line is exactly the bead ID — `packages/km-infra/scripts/check-upstream-markers.sh` greps for it.
- `Escalate by:` mirrors the bead field. If they drift, the lint script flags it (the bead is the source of truth; update the marker to match).
- One marker block per workaround site. If a workaround spans multiple files, each file gets its own block.
- Markers do not need to be on a single line — multiline `/* … */` is fine — but the three labelled lines must be present and contiguous.

The lint script (`packages/km-infra/scripts/check-upstream-markers.sh`, wired into `bun fix`) enforces a two-way binding:
1. Every `// UPSTREAM-WAITING(<ref>):` comment in apps/, packages/, vendor/ resolves to an open bead under km-all.upstream-waiting.
2. Every open child of km-all.upstream-waiting has at least one matching code marker (so beads can't outlive their workaround).

Mismatches fail CI. Either wire up the missing side, or close the bead.

#### Cross-references
- Epic: `km-all.upstream-waiting` (perpetual registry, never closes — children close individually).
- Sibling epic: `km-all.owned-divergence` — destination when escalation re-decides "accept owned divergence" (upstream dead/declined).
- Lint: `packages/km-infra/scripts/check-upstream-markers.sh` (two-way bead↔marker binding, runs in `bun fix`).
- Cadence: monthly via `/sop infra` → `upstream-waiting` check (`.claude/skills/sop/SKILL.md`).
- Existing examples: see open children of `km-all.upstream-waiting` for prior-art bead descriptions (e.g. `km-bearly.bun-keepalive-url-shim` for the Bun #7716 keep-alive workaround).

#### Anti-patterns
- "I'll remember to come back to this" — you won't, and a future maintainer can't read your memory.
- Filing the upstream issue without a tracking bead — the issue exists upstream; the *workaround in our code* is what we forget.
- Vague unwind steps ("revert the workaround") — by the time upstream lands, the workaround is woven through more files than you remembered.
- Closing the bead when upstream merges but before unwind runs — the bead must stay open until Status = `adopted-locally`.
- **Bundling upstream-shim with permanent local improvements creates wrong unwind.** Split. When upstream lands, the agent reverts the whole bead — including the local hygiene work that should have stayed. One bead per unwindable unit; permanent improvements get their own non-upstream-waiting bead.
- Missing code marker — the bead is the *plan*, the marker is the *anchor*. A bead without markers is unenforceable; markers without a bead are orphans. The lint script catches both.
- Letting `Escalate by` slide silently — six months passed and nothing was decided ≡ "we gave up but won't admit it." Move to `km-all.owned-divergence` or extend the date with a written reason; never let it expire quietly.

## Examples

### oxlint stdout panic (oxc-project/oxc#20239)

1. Discovered oxlint crashes on large projects (~1300 files, ~365 warnings)
2. Read actual source (`service.rs`) via raw GitHub URL — confirmed `check_for_writer_error` handles `BrokenPipe`/`Interrupted` but not `WouldBlock`
3. Searched GitHub issues — no existing report
4. Checked issue templates — found `linter_bug_report.yaml` (initially used wrong generic template, had to edit)
5. Filed with correct format: version, command, config, what happened
6. Applied local workaround: `packages/km-infra/scripts/lint.sh` wrapper redirecting to temp file

**Lessons**:
- Always check issue templates BEFORE filing. Editing after the fact is messy.
- Use `--body-file` instead of `--body` with heredocs — heredocs can escape backticks, breaking markdown code blocks. Write the body to a temp file first.

### OpenTUI borderStyle segfault (anomalyco/opentui#543)

1. Isolated via binary search testing
2. Searched GitHub — no existing report
3. Created repro: `packages/km-tui-opentui/src/repro-crash.tsx`
4. Filed issue with reproduction
5. Applied workaround: `borderStyle="round"` → `borderStyle="single"`

### ghostty-web WASM memory corruption (coder/ghostty-web#141)

1. Discovered ghostty-web 0.4.0 crashes after freeing terminals that processed multi-codepoint grapheme clusters
2. Initial repro showed crash in test suite — initially thought it was specific ANSI sequences
3. **Bisection was key**: Tested each character type in isolated processes to find the pattern (multi-codepoint sequences corrupt WASM state on free, single-codepoint chars are fine)
4. **Project assessment** (Step 4 example):
   - **Owner**: Coder (coder.com) — VC-backed company, ghostty-web is a wrapper around ghostty-org/ghostty
   - **Activity**: Commits active through Feb 2026, but only 1 release (v0.4.0, Dec 2025), one dominant contributor (87 of ~100 commits)
   - **Responsiveness**: Fast in Dec 2025 (hours), slowed significantly by Feb 2026 (weeks-to-never for newer issues). Community forks appearing (slang25, rcarmo) with unmerged PRs
   - **AI policy**: ghostty-web has `AGENTS.md` (welcomes AI). Parent ghostty-org/ghostty has strict `AI_POLICY.md` — different policies, file on the right repo
   - **Decision**: File for the record, don't wait — workaround in place, expect slow/no response
5. Standalone 15-line repro using only `ghostty-web` npm package (no project dependencies)
6. Workaround: don't free terminals that processed grapheme clusters

**Lessons**:
- **Project assessment changes the approach**: Without assessment, you'd file and wait. With it, you know to file for the record but not block on a response.
- WASM bugs can be state-corrupting — one terminal's bug poisons ALL subsequent terminals in the process. Test each hypothesis in isolated processes (`bun run script.ts` per test) to avoid contamination.
- When a standalone repro doesn't crash but the test suite does, look for accumulated/shared state (module-level caches, WASM shared memory, singleton instances).
- Always check the project's parent/upstream — `coder/ghostty-web` wraps `ghostty-org/ghostty` which has very different contribution policies.
- npm package name may differ from GitHub repo — verify which repo to file on.

## Checklist

- [ ] Bug confirmed in upstream package (not your code)
- [ ] Source code read to verify root cause hypothesis
- [ ] Searched for existing reports
- [ ] **Project assessed** — profile, activity, responsiveness, AI policy, decision made
- [ ] Assessment reported to user with recommendation
- [ ] Checked project's issue templates and contributing guidelines
- [ ] Filed bug report matching their format (human-reviewed if AI policy requires)
- [ ] Applied workaround in your code
- [ ] (Optional) Vendorized and fixed
- [ ] (Optional) Submitted PR upstream
- [ ] **Registered in `km-all.upstream-waiting`** (mandatory whenever a workaround landed) — bead has upstream URL, status, last-checked date, files-affected list, and concrete unwind steps
- [ ] Bead `Status:` uses the 3-state enum: `merged-upstream` | `released-upstream` | `adopted-locally`
- [ ] Bead `Escalate by: <YYYY-MM-DD>` set (default = creation + 6 months) with re-decision options documented (vendorize / fork / accept owned divergence / continue waiting)
- [ ] `bd defer km-<scope>.<slug> --until="<YYYY-MM-DD>"` run (default = creation + 30 days) so the bead actively surfaces in `bd ready` near review date
- [ ] Code marker present at every workaround site: `// UPSTREAM-WAITING(<repo>#<issue>): Delete when <pkg> >= <version>` + `// Bead: km-<scope>.<slug>` + `// Escalate by: <YYYY-MM-DD>`
- [ ] Bead is unwindable as a single unit — no permanent local improvements bundled with the upstream-shim (split if needed, otherwise reverting the bead deletes good work)
- [ ] `bash packages/km-infra/scripts/check-upstream-markers.sh` passes (two-way bead↔marker binding clean)
