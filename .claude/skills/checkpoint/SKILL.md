---
description: "Checkpoint session context to a tracking bead. Ensures ONE bead captures all active work, recent commits, uncommitted changes, and next steps. Use before /compact, at natural breakpoints, or when context is getting long. Also runs automatically via pre-compact hook."
argument-hint: "[message]"
---

# Checkpoint

Save session context to a single tracking bead so it survives compaction and can be recovered by the next session or post-compact continuation.

**Argument**: $ARGUMENTS

## What It Does

1. **Find or create ONE tracking bead** for this session
2. **Gather all context**: active beads, git status, recent commits, uncommitted changes
3. **Update the bead** with a structured checkpoint including next steps
4. **Report** the bead ID so the user (or post-compact) can recover with `bd show <id>`

## Instructions

### Step 1: Find the tracking bead

Look for an existing in-progress bead that serves as the session's tracking bead. Prefer:
1. A bead the user explicitly mentioned as the tracking/epic bead
2. The most recently updated in-progress bead created by this session
3. If none exists, create one: `bd create --title="Session checkpoint" --type=task --priority=3`

There must be exactly ONE tracking bead. If multiple candidates exist, pick the most relevant one.

### Step 2: Gather context

Collect ALL of these:

```bash
# Active beads
bd list --status=in_progress

# Git state
git status --short | head -20
git log --oneline -10
git branch --show-current

# Any open beads this session created or closed
bd list --status=open | head -10
```

### Step 3: Build the checkpoint

Update the tracking bead with structured notes:

```bash
bd update <BEAD_ID> --notes="## Session Checkpoint
**Branch:** <branch>
**Time:** <timestamp>

### What was done
<1-3 bullet summary of session work>

### Active beads
<list of in-progress beads with titles>

### Open beads (created this session)
<any new beads that need future work>

### Recent commits
<last 10 commits>

### Uncommitted changes
<git status>

### Next steps
<what should be picked up next — be specific>
<reference file paths, bead IDs, function names>

### Key context
<anything that would be lost in compaction — design decisions, failed approaches, gotchas>"
```

If the user provided an argument (message), include it as the primary "Next steps" content.

### Step 4: Report

Tell the user:
- Which bead was updated (ID + title)
- That `bd show <id>` will recover context after compact
- Suggest `/compact` if they haven't already

## Auto-trigger

This skill runs automatically via the pre-compact hook when the user types `/compact`.
It can also be invoked manually with `/checkpoint` at any time.
