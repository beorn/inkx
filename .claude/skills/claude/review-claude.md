---
description: Audit Claude steering docs for token efficiency, hierarchy, and progressive disclosure
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion
---

# Steering Documentation Audit

**Keywords**: claude review, audit skills, token efficiency, steering docs

Audit Claude Code configuration for token efficiency and proper structure.

**Reference**: [Anthropic Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**Note**: Our targets are optimization recommendations beyond Anthropic's official minimums (<500 lines for SKILL.md).

## Layer Model

**Official token costs** (from Anthropic):

- Metadata scan: ~100 tokens per skill (name + description only)
- Skill activation: <5,000 tokens when loaded
- CLAUDE.md: ~4 tokens/line, loads every message

**Why this matters**: CLAUDE.md loads every message (~240 tokens for 60 lines). Skills load on-demand (<5k tokens when activated). Keeping CLAUDE.md small saves thousands of tokens per session.

| Layer              | Loads           | Frequency | Official Limit | Our Target | Contains                  |
| ------------------ | --------------- | --------- | -------------- | ---------- | ------------------------- |
| CLAUDE.md          | Every message   | Always    | N/A            | <60 lines  | Commands, skills table    |
| skills/\*/SKILL.md | On `/domain`    | Often     | <500 lines     | 50-70      | Quick ref, sub-file links |
| skills/_/_.md      | On demand       | Varies    | <500 lines     | 80-150     | Full workflows            |
| docs/\*.md         | When referenced | Rare      | N/A            | Any        | Rationale, history        |

**Frequency-based exceptions**: Infrequently-run workflows (monthly audits, setup tasks) can exceed line targets. The cost is paid rarely. Focus optimization on:

1. CLAUDE.md (strict - loads every message)
2. SKILL.md entry points (strict - loads on domain access)
3. Frequently-used sub-files (e.g., commit workflow)

## Execute (Parallel First)

### Step 1: Gather Metrics (6 Bash in parallel)

```bash
# 1. CLAUDE.md size
wc -l CLAUDE.md

# 2. All skill files with line counts
find .claude/skills -name "*.md" -exec wc -l {} \; | sort -rn

# 3. Orphan files (not linked from SKILL.md)
for f in .claude/skills/*/*.md; do
  [[ $(basename "$f") == "SKILL.md" ]] && continue
  dir=$(dirname "$f")
  grep -q "$(basename "$f")" "$dir/SKILL.md" 2>/dev/null || echo "ORPHAN: $f"
done

# 4. Keywords overlap check
grep -h "^\*\*Keywords\*\*:" .claude/skills/*/SKILL.md | \
  sed 's/.*: //' | tr ',' '\n' | sort | uniq -c | sort -rn | head -10

# 5. MCP servers configured
if [[ -f .mcp.json ]]; then
  echo "=== Project MCP Servers (.mcp.json) ==="
  cat .mcp.json
fi
if [[ -f ~/.claude.json ]]; then
  echo "=== User MCP Servers (~/.claude.json) ==="
  cat ~/.claude.json
fi

# 6. Plugin configuration status
echo "=== Plugin Configuration ==="
cat ~/.claude/settings.json | jq -r '.enabledPlugins | to_entries[] | "\(.key): \(if .value then "enabled" else "disabled" end)"' 2>/dev/null || echo "No plugins configured"
echo ""
echo "=== Installed Plugins ==="
cat ~/.claude/plugins/installed_plugins.json 2>/dev/null || echo "No installed_plugins.json"
echo ""
echo "=== Plugin Skills Discovery ==="
for plugin_dir in ~/.claude/plugins/cache/*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name=$(basename "$plugin_dir")
  echo "Plugin: $plugin_name"
  # Check for skills at root (correct)
  if [[ -d "$plugin_dir"*/skills ]]; then
    echo "  Skills (root): $(ls -1 "$plugin_dir"*/skills 2>/dev/null | wc -l | tr -d ' ') found"
  fi
  # Check for nested skills in plugins/ (broken structure)
  for nested in "$plugin_dir"*/plugins/*/skills; do
    [[ -d "$nested" ]] && echo "  WARNING: Nested skills at $nested (not discovered by Claude Code)"
  done
done
```

### Step 2: Session Error Analysis (parallel)

Run [session-errors.md](session-errors.md) workflow simultaneously:

- Errors → docs that need "Common Mistakes" sections
- Dead docs → lines to remove

### Step 3: Evaluate Against Checklist

| Check                             | Pass                        | Fail                      |
| --------------------------------- | --------------------------- | ------------------------- |
| **Official limits**               |                             |                           |
| SKILL.md <500 lines               | ✓                           | Split (required)          |
| **Our optimizations**             |                             |                           |
| CLAUDE.md <60 lines               | ✓                           | Move to skill (strict)    |
| Entry points 50-70 lines          | Has sub-file table          | Monolithic (strict)       |
| Sub-files <150 lines              | Focused workflow            | Split (unless infrequent) |
| Files >100 lines have ToC         | ✓                           | Add table of contents     |
| **Plugins**                       |                             |                           |
| Skills at repo root               | skills/ at repo root        | Nested in plugins/ (fix)  |
| Installed version up-to-date      | Matches marketplace/source  | `plugin update` needed    |
| Enabled in settings               | enabledPlugins: true        | Add to settings.json      |
| Skills discovered                 | Listed in available skills  | Check structure           |
| **Structure**                     |                             |                           |
| No orphan sub-files               | All linked from SKILL       | Dead file                 |
| No deeply nested references       | Max 1 level from SKILL.md   | Flatten structure         |
| **Discovery**                     |                             |                           |
| Skill names use gerund form       | "testing-code", "analyzing" | Rename to gerund          |
| Descriptions are third person     | "Tests code", not "I test"  | Rewrite in third person   |
| Descriptions include "when"       | "Use when testing..."       | Add usage triggers        |
| No keyword overlap                | Unique per domain           | Confusing auto-load       |
| **Content**                       |                             |                           |
| No assumptions about Claude       | Concise, assumes knowledge  | Remove explanations       |
| Skills point to docs/             | Rationale in docs/          | Inline explanations       |
| Workflows use checkbox pattern    | `- [ ] Step 1`              | Add tracking checkboxes   |
| Frequently-used skills have evals | Test scenarios exist        | Create evaluations        |
| **MCP Servers**                   |                             |                           |
| Each server actively used         | Called in recent sessions   | Disable unused servers    |
| Context overhead justified        | <2k tokens OR high-value    | Remove low-value servers  |
| Servers documented in mcp.md      | Usage guidance exists       | Add documentation         |
| **Capability Overlap**            |                             |                           |
| No duplicate functionality        | Each component unique value | Disable redundant         |
| Skills over MCP for orchestration | Complex workflows use skill | Convert MCP to skill      |
| MCP only for unique capabilities  | No skill alternative exists | Disable or create skill   |
| Clear value proposition           | Why this vs alternatives?   | Document or remove        |

### Step 3b: Plugin Configuration Analysis

Check plugin health and skill discovery:

```bash
# 1. Check if installed plugins are outdated
for plugin in $(cat ~/.claude/plugins/installed_plugins.json | jq -r '.plugins | keys[]' 2>/dev/null); do
  installed_sha=$(cat ~/.claude/plugins/installed_plugins.json | jq -r ".plugins[\"$plugin\"][0].gitCommitSha")
  install_path=$(cat ~/.claude/plugins/installed_plugins.json | jq -r ".plugins[\"$plugin\"][0].installPath")
  echo "Plugin: $plugin"
  echo "  Installed SHA: ${installed_sha:0:12}"
  echo "  Install path: $install_path"
  # Check if skills directory exists at root
  if [[ -d "$install_path/skills" ]]; then
    echo "  Skills: $(ls -1 "$install_path/skills" 2>/dev/null | wc -l | tr -d ' ') at root (correct)"
  else
    echo "  WARNING: No skills/ at root - skills won't be discovered"
  fi
  # Check for nested plugins structure (broken)
  if [[ -d "$install_path/plugins" ]]; then
    echo "  WARNING: Found plugins/ subdirectory - monorepo structure not supported"
    ls -la "$install_path/plugins/"
  fi
done

# 2. Check enabled status in settings
echo ""
echo "=== Enabled Status ==="
enabled=$(cat ~/.claude/settings.json | jq -r '.enabledPlugins | to_entries[] | select(.value == true) | .key' 2>/dev/null)
disabled=$(cat ~/.claude/settings.json | jq -r '.enabledPlugins | to_entries[] | select(.value == false) | .key' 2>/dev/null)
echo "Enabled: ${enabled:-none}"
echo "Disabled: ${disabled:-none}"
```

**Common plugin issues:**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Skills not discovered | Skill missing from available skills | Move skills/ to repo root |
| Old version installed | Missing new features | `claude plugin update <name>` |
| Not enabled | Plugin installed but skills unavailable | Add to enabledPlugins in settings.json |
| Monorepo structure | source.path ignored in marketplace.json | Flatten repo (skills at root) |

### Step 3c: MCP Server Analysis

Use `ListMcpResourcesTool` to enumerate all configured MCP servers and their tools.

**For each server, calculate:**

| Metric         | Method                                   | Target      |
| -------------- | ---------------------------------------- | ----------- |
| Tools provided | Count from tool list                     | N/A         |
| Token overhead | ~300-600 per tool (desc + schema)        | <2k/server  |
| Usage pattern  | Check if tools called in session history | >1 use/week |
| Value ratio    | Token cost vs utility                    | High value  |

**Overhead estimates:**

- Simple tool (1-3 params): ~300-400 tokens
- Complex tool (5+ params, enums): ~500-700 tokens
- Resource catalogs: ~100-200 tokens
- Server overhead = (tools × avg) + resources

**Decision criteria:**

| Overhead | Usage      | Action           |
| -------- | ---------- | ---------------- |
| >2k      | Rare       | Disable          |
| >2k      | Frequent   | Keep, document   |
| <2k      | Rare       | Consider disable |
| <2k      | Frequent   | Keep             |
| Any      | Never used | Disable          |

### Step 3c: Capability Overlap Analysis

**Goal**: Identify redundant functionality between skills, MCP servers, and built-in tools.

#### 1. Inventory Capabilities (parallel)

```bash
# Skills - extract descriptions and keywords
for skill in .claude/skills/*/SKILL.md; do
  dir=$(dirname "$skill")
  name=$(basename "$dir")
  desc=$(grep "^description:" "$skill" | sed 's/description: //')
  keywords=$(grep "^\*\*Keywords\*\*:" "$skill" | sed 's/\*\*Keywords\*\*: //')
  echo "SKILL: $name | $desc | $keywords"
done

# MCP servers - list from config
if [[ -f .mcp.json ]]; then
  echo "=== Project MCP Servers ==="
  cat .mcp.json | grep -o '"[^"]*":' | tr -d '":' | grep -v mcpServers
fi
```

#### 2. Map Functionality

For each capability domain, list what provides it:

| Domain                | Skills         | MCP Servers         | Built-in Tools                            | Notes         |
| --------------------- | -------------- | ------------------- | ----------------------------------------- | ------------- |
| File rename + imports | batch-refactor | refactor-typescript | mcp**refactor-typescript**file_operations | Overlap       |
| Symbol rename         | batch-refactor | refactor-typescript | mcp**refactor-typescript**refactoring     | Overlap       |
| Text search/replace   | batch-refactor | -                   | Grep, Edit                                | Native better |
| Organize imports      | -              | refactor-typescript | mcp**refactor-typescript**code_quality    | MCP only      |
| Extract refactoring   | -              | refactor-typescript | mcp**refactor-typescript**refactoring     | MCP only      |

#### 3. Evaluate Value Proposition

For each component, assess:

| Component               | Token Cost            | Unique Value                                    | Redundant With          | Recommendation           |
| ----------------------- | --------------------- | ----------------------------------------------- | ----------------------- | ------------------------ |
| batch-refactor skill    | ~500 (on-demand)      | LLM-guided review, editsets, conflict detection | MCP refactor-typescript | Keep (more powerful)     |
| refactor-typescript MCP | ~2.1k (every message) | Extract refactorings, organize imports          | batch-refactor          | Disable (mostly overlap) |

**Analysis questions:**

1. **Does this component provide unique value?**
   - What can it do that others can't?
   - Is the unique value used frequently?

2. **What's the cost/benefit ratio?**
   - Token overhead vs frequency of use
   - Maintenance burden vs utility

3. **Could native tools handle this?**
   - Skills can orchestrate Grep + Edit for many tasks
   - MCP servers add overhead - worth it?

4. **Is there a lighter alternative?**
   - Could a skill replace an MCP server?
   - Could native tools replace a skill?

#### 4. Overlap Patterns to Flag

| Pattern                     | Example                               | Action                   |
| --------------------------- | ------------------------------------- | ------------------------ |
| Skill + MCP do same thing   | batch-refactor + refactor-typescript  | Disable MCP or skill     |
| MCP rarely used             | Never called in 10+ sessions          | Disable                  |
| Skill recreates built-in    | Grep skill that just wraps Grep tool  | Remove skill, use native |
| Multiple skills same domain | code-review + code-quality + refactor | Consolidate              |

### Step 4: Propose Changes

For each issue, draft Edit operations:

| Issue Type           | Action                                |
| -------------------- | ------------------------------------- |
| Over line limit      | Split into sub-files                  |
| Dead docs            | Remove (from session-errors analysis) |
| Missing section      | Add "Common Mistakes" table           |
| Orphan file          | Link from SKILL.md or delete          |
| Missing evaluations  | Create test scenarios (see below)     |
| No workflow tracking | Add checkbox pattern (see below)      |

**Evaluation-driven development**: For frequently-used skills, create test scenarios that validate the skill solves real problems. Example:

```json
{
  "skills": ["testing-code"],
  "query": "Run the fast tests and show me the results",
  "expected_behavior": [
    "Executes bun run test:fast command",
    "Shows test output with pass/fail status",
    "Identifies any failing tests"
  ]
}
```

**Workflow checklist pattern**: For multi-step workflows, add tracking checkboxes:

````markdown
## Commit workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Run git status and git diff
- [ ] Step 2: Draft commit message
- [ ] Step 3: Stage files and commit
- [ ] Step 4: Verify with git status
```
````

## Output Format

```markdown
## Audit Summary

| Metric           | Current | Target | Status |
| ---------------- | ------- | ------ | ------ |
| CLAUDE.md        | X lines | <60    | ✓/✗    |
| Largest skill    | X lines | <150   | ✓/✗    |
| Orphan files     | X       | 0      | ✓/✗    |
| Keyword overlaps | X       | 0      | ✓/✗    |
| MCP servers      | X       | N/A    | N/A    |
| MCP token cost   | X       | <2k/ea | ✓/✗    |
| Plugins enabled  | X/Y     | All    | ✓/✗    |
| Plugin skills    | X       | All    | ✓/✗    |

## Plugin Analysis

| Plugin | Version | Skills | Status | Notes |
|--------|---------|--------|--------|-------|
| name   | 0.x.0   | N      | ✓/✗    | Issue |

**Common issues found:**
- [ ] Skills not at repo root (source.path ignored)
- [ ] Plugin not enabled in settings.json
- [ ] Outdated version (update needed)

## MCP Server Analysis

| Server Name | Tools | Est. Tokens | Usage  | Recommendation |
| ----------- | ----- | ----------- | ------ | -------------- |
| server-name | 4     | ~2.1k       | Never  | Disable        |
| other-srv   | 2     | ~800        | Weekly | Keep           |

**Token impact**: Total overhead per request: ~X,XXX tokens (~X% of 200k budget)

## Capability Overlap Analysis

| Domain                | Providers                                     | Overlap | Recommendation                                         |
| --------------------- | --------------------------------------------- | ------- | ------------------------------------------------------ |
| File rename + imports | batch-refactor skill, refactor-typescript MCP | 100%    | Keep skill (more powerful), disable MCP                |
| Symbol rename         | batch-refactor skill, refactor-typescript MCP | 100%    | Keep skill (editsets, conflict detection), disable MCP |
| Organize imports      | refactor-typescript MCP                       | 0%      | Unique to MCP - keep if used frequently                |
| Extract refactoring   | refactor-typescript MCP                       | 0%      | Unique to MCP - keep if used frequently                |

**Value analysis:**

| Component               | Token Cost            | Unique Value                                                   | Usage Frequency | Keep?            |
| ----------------------- | --------------------- | -------------------------------------------------------------- | --------------- | ---------------- |
| batch-refactor          | ~500 (on-demand)      | LLM-guided review, editsets, conflict detection, text/markdown | High            | ✅ Yes           |
| refactor-typescript MCP | ~2.1k (every message) | Extract refactorings, organize imports, fix all errors         | Never observed  | ❌ No - disabled |

**Recommendations:**

- Disable MCP servers with 100% skill overlap and low usage
- Keep skills that provide unique orchestration value
- Document unique MCP capabilities (organize imports, extract) in mcp.md for future re-enablement

## Issues Found

| Priority | File | Issue      | Action          |
| -------- | ---- | ---------- | --------------- |
| P1       | X.md | 200 lines  | Split           |
| P2       | Y.md | Not linked | Add to SKILL.md |

## Session Errors (from session-errors.md)

[Include error summary and dead doc findings]

## Proposed Edits

[Edit tool calls to make]
```

## Reference

For detailed rules on skill structure, see [review-reference.md](review-reference.md).

## Retrospective: Steering Docs Evolution

After completing the steering docs audit, analyze patterns to continuously improve Claude Code configuration.

### 1. Pattern Recognition

Review audit findings to identify systemic issues:

**Key questions:**

- Which layer (CLAUDE.md, SKILL.md, sub-files, docs/) had most issues?
- Were issues about size, structure, discovery, or content quality?
- Did session errors reveal docs that confuse Claude?
- Were problems isolated or symptoms of structural issues?

### 2. Root Cause Analysis

For each major pattern, identify the underlying cause:

| Pattern Example            | Root Cause Hypothesis       | Evidence/Context                         |
| -------------------------- | --------------------------- | ---------------------------------------- |
| CLAUDE.md over 60 lines    | Feature creep over time     | Multiple additions, no removals          |
| Large SKILL.md files       | Monolithic design           | No sub-file split, all content in entry  |
| Orphan sub-files           | Refactoring without cleanup | Moved content but didn't delete old      |
| Keyword overlap            | Unclear domain boundaries   | Similar skills need better separation    |
| Missing "when" in desc     | Copied old patterns         | Skills created before guidelines update  |
| Session errors on specific | Unclear instructions        | Same misinterpretation happened 3+ times |
| Dead docs referenced       | No usage tracking           | Docs exist but Claude never loads them   |
| MCP + skill do same thing  | Added tools without review  | Duplicate file rename, symbol refactor   |
| Unused MCP servers         | No value tracking           | Server loaded every message, never used  |
| High token overhead        | No cost/benefit analysis    | MCP adds 2k+ tokens but used once/month  |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Structural improvements:**

- Split monolithic SKILL.md files into focused sub-files
- Remove orphan files and update links
- Clarify domain boundaries (merge or split overlapping skills)
- Add missing table of contents to files >100 lines

**Discovery improvements:**

- Fix skill descriptions to include "when to use" clauses
- Remove keyword overlap across domains
- Update metadata to use gerund form for skill names
- Add missing argument-hint fields for clarity

**Content quality:**

- Add "Common Mistakes" sections based on session errors
- Remove dead docs that Claude never loads
- Update workflows based on frequency (strict for common, relaxed for rare)
- Add evaluation scenarios for frequently-used skills

**Token efficiency:**

- Move CLAUDE.md overflow content to skills
- Remove redundant instructions that tools can enforce
- Replace inline examples with file:line references
- Consolidate similar workflows across skills

**Capability overlap elimination:**

- Disable MCP servers with 100% skill overlap (batch-refactor vs refactor-typescript)
- Document unique MCP capabilities in mcp.md for future re-enablement
- Prefer skills over MCP for orchestration (skills compose tools, MCP is single-purpose)
- Keep MCP only for capabilities that can't be orchestrated (native operations, state management)
- Track usage: disable components unused for 10+ sessions
- Regular overlap audits: quarterly review of all skills/MCP/tools

### 4. Metrics Tracking

Compare before/after metrics:

| Metric                           | Before | After | Target |
| -------------------------------- | ------ | ----- | ------ |
| CLAUDE.md lines                  | X      | Y     | <60    |
| Files over limit                 | X      | Y     | 0      |
| Orphan files                     | X      | Y     | 0      |
| Keyword overlaps                 | X      | Y     | 0      |
| Skills without "when"            | X      | Y     | 0      |
| Session error rate               | X%     | Y%    | <5%    |
| Avg tokens per activation        | X      | Y     | <4000  |
| MCP servers                      | X      | Y     | <3     |
| MCP token overhead               | Xk     | Yk    | <5k    |
| Capability overlaps              | X      | Y     | 0      |
| Unused components (10+ sessions) | X      | Y     | 0      |

### 5. Session Error Analysis Integration

If running with [session-errors.md](session-errors.md) in parallel:

**Cross-reference findings:**

- Errors → Missing "Common Mistakes" sections (add to skills)
- Repeated confusion → Ambiguous instructions (rewrite for clarity)
- Dead docs → Never loaded (safe to delete or archive)
- High-cost sessions → CLAUDE.md bloat (move content to skills)

**Priority ranking:**

1. **P0**: Session errors causing incorrect behavior (fix immediately)
2. **P1**: Token bloat in CLAUDE.md (loads every message)
3. **P2**: SKILL.md files over official limit (<500 lines)
4. **P3**: Structural issues (orphans, missing ToC, keyword overlap)
5. **P4**: Optimization opportunities (infrequent workflows can exceed targets)

### 6. Create Process Improvement Beads (Optional)

For significant improvements identified:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Fix session errors
bd create --id "km-proc-claude-errors-$DATE_SUFFIX" --type=task --priority=1 \
  --title="Fix top 3 Claude session error patterns" \
  --body="Add clarity to X, Y, Z based on session error analysis"

# Example: Token optimization
bd create --id "km-proc-claude-tokens-$DATE_SUFFIX" --type=task --priority=2 \
  --title="Reduce CLAUDE.md to <60 lines" \
  --body="Move X section to skill, delete Y redundant content, reference Z by file:line"

# Example: Structural cleanup
bd create --id "km-proc-claude-cleanup-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Remove orphan docs and fix links" \
  --body="Delete X files, update Y links in SKILL.md, add Z to .gitignore if needed"
```

### 7. Update Review Workflows

If the audit revealed gaps in the review process itself:

**Update [review-claude.md](review-claude.md):**

- Add new checks to Step 1 metrics (e.g., "Check for inline code examples >10 lines")
- Improve checklist with newly discovered anti-patterns
- Add automated detection for common issues (e.g., grep for missing "when" clauses)

**Update [review-reference.md](review-reference.md):**

- Add new best practices discovered
- Document examples of good/bad patterns found in the wild
- Update token economics based on real measurements

**Update [session-errors.md](session-errors.md) if it exists:**

- Add new error patterns discovered
- Improve categorization based on root causes
- Add automated pattern detection for common errors

Make edits directly or create process improvement beads to track changes.

**This creates a continuous improvement loop for Claude Code configuration effectiveness.**
