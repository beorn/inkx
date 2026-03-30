# Beads Workflow Context

> **Context Recovery**: Run `bd prime` after compaction, clear, or new session
> Hooks auto-call this in Claude Code when .beads/ detected

# 🚨 SESSION CLOSE PROTOCOL 🚨

**CRITICAL**: Before saying "done" or "complete", you MUST run this checklist:

```
[ ] 1. git status              (check what changed)
[ ] 2. git add <files>         (stage code changes)
[ ] 3. git commit -m "..."     (commit code)
[ ] 4. git push                (push to remote)
```

**NEVER skip this.** Work is not done until pushed.

## Core Rules
- **Default**: Use beads for ALL task tracking (`bd create`, `bd ready`, `bd close`)
- **Prohibited**: Do NOT use TodoWrite, TaskCreate, or markdown files for task tracking
- **Workflow**: Create beads issue BEFORE writing code, mark in_progress when starting
- **IDs are REQUIRED**: ALWAYS use `--id` with `bd create`. Use `km-<scope>.<slug>` format (e.g., `km-silvery.bg-bleed`, `km-tui.nav-bug`). NEVER let bd auto-generate opaque IDs.
- **Memory**: Use `bd remember "insight"` for persistent knowledge across sessions. Do NOT use MEMORY.md files — they fragment across accounts. Search with `bd memories <keyword>`.
- Persistence you don't need beats lost context
- Git workflow: beads auto-commit to Dolt, run `git push` at session end
- Session management: check `bd ready` for available work

## Essential Commands

### Finding Work
- `bd ready` - Show issues ready to work (no blockers)
- `bd list --status=open` - All open issues
- `bd list --status=in_progress` - Your active work
- `bd show <id>` - Detailed issue view with dependencies

### Creating & Updating
- `bd create --id km-<scope>.<slug> --title="Title" --description="Description" --type=task|bug|feature --priority=2` - New issue
  - **ALWAYS provide --id** using `km-<scope>.<slug>` format. Scope = package name (silvery, tui, storage, etc.) or cross-cutting scope (infra, all). Slug = short descriptive kebab-case.
  - Priority: 0-4 or P0-P4 (0=critical, 2=medium, 4=backlog). NOT "high"/"medium"/"low"
  - Then set parent: `bd update <id> --parent km-<scope>` (--id and --parent CANNOT be combined)
- `bd update <id> --claim` - Claim work
- `bd update <id> --assignee=username` - Assign to someone
- `bd update <id> --title/--description/--notes/--design` - Update fields inline
- `bd close <id>` - Mark complete
- `bd close <id1> <id2> ...` - Close multiple issues at once (more efficient)
- `bd close <id> --reason="explanation"` - Close with reason
- **Tip**: When creating multiple issues/tasks/epics, use parallel subagents for efficiency
- **WARNING**: Do NOT use `bd edit` - it opens $EDITOR (vim/nano) which blocks agents

### Dependencies & Blocking
- `bd dep add <issue> <depends-on>` - Add dependency (issue depends on depends-on)
- `bd blocked` - Show all blocked issues
- `bd show <id>` - See what's blocking/blocked by this issue

### Sync & Collaboration
- `bd dolt push` - Push beads to Dolt remote
- `bd dolt pull` - Pull beads from Dolt remote
- `bd search <query>` - Search issues by keyword

### Project Health
- `bd stats` - Project statistics (open/closed/blocked counts)
- `bd doctor` - Check for issues (sync problems, missing hooks)
- `bd doctor --check=conventions` - Check for convention drift (lint, stale, orphans)

### Quality Tools
- `bd create --validate` - Check description has required sections
- `bd create --acceptance="criteria"` - Set acceptance criteria (checked by --validate)
- `bd create --design="decisions"` - Record design decisions
- `bd create --notes="context"` - Add supplementary notes
- `bd config set validation.on-create warn` - Auto-validate on every create
- `bd lint` - Check existing issues for missing sections

### Lifecycle & Hygiene
- `bd defer <id> --until="date"` - Defer work to a future date
- `bd supersede <id> --with=<new-id>` - Mark issue as superseded
- `bd close <id> --suggest-next` - Show newly unblocked issues after closing
- `bd stale` - Find issues with no recent activity
- `bd orphans` - Find issues with broken dependencies
- `bd preflight` - Pre-PR checks (lint, stale, orphans)
- `bd human <id>` - Flag for human decision (list/respond/dismiss)

### Structured Workflows
- `bd formula list` - See available workflow templates
- `bd mol pour <name>` - Start structured workflow from formula

## Common Workflows

**Starting work:**
```bash
bd ready           # Find available work
bd show <id>       # Review issue details
bd update <id> --claim  # Claim it
```

**Completing work:**
```bash
bd close <id1> <id2> ...    # Close all completed issues at once
git add . && git commit -m "..."  # Commit code changes
git push                    # Push to remote
```

**Creating dependent work:**
```bash
bd create --id km-tui.feature-x --title="Implement feature X" --description="Why and what" --type=feature
bd create --id km-tui.test-x --title="Write tests for X" --description="Why and what" --type=task
bd update km-tui.feature-x --parent km-tui
bd update km-tui.test-x --parent km-tui
bd dep add km-tui.test-x km-tui.feature-x  # Tests depend on Feature
```
