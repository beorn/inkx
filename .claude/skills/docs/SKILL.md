---
benefits-from: [recall, gbrain]
escalate-to: {arch: "doc describes architecture that needs redesign"}
---

# Docs — Documentation Management

**Keywords**: docs, glossary, review docs, update docs, documentation audit

Workflows for maintaining project documentation: glossary updates, doc reviews, and consistency checks.

## Quick Actions

| Command | Purpose |
|---|---|
| `/docs review` | Full documentation review across the project |
| `/docs glossary` | Update the glossary with new/changed terms |
| `/docs audit` | Check for stale, missing, or contradictory docs |

## `/docs review` — Full Documentation Review

A systematic review of all project documentation. Run periodically (monthly) or after major design work.

### Step 1: Gather scope

```bash
# What docs exist?
find docs/ -name "*.md" | sort
find vendor/*/docs/ -name "*.md" | head -30
ls CLAUDE.md vendor/*/CLAUDE.md

# What changed recently?
git log --since="7 days ago" --name-only -- "*.md" | grep -E "^(docs/|vendor/.*/docs/|CLAUDE)" | sort -u

# What design docs exist?
ls docs/design/
```

### Step 2: Check each doc category

| Category | Files | Check for |
|---|---|---|
| **Design docs** | `docs/design/*.md` | Accuracy vs current code, stale decisions, missing decisions |
| **Glossary** | `docs/glossary.md` | New terms from recent work, stale definitions, consistency |
| **Architecture** | `docs/README.md` | Layer diagram matches reality, package list current |
| **Principles** | `docs/principles.md` | Still followed, new patterns not captured |
| **Lessons** | `docs/lessons/*.md` | New lessons from recent refactors |
| **CLAUDE.md** | Root + vendor | Skills list current, commands correct, packages listed |
| **Silvery docs** | `vendor/silvery/docs/` | Guide pages match current API |

### Step 3: Fix or flag

For each issue found:
- **Stale content**: Fix immediately if <5 min, create bead if larger
- **Missing content**: Create bead with scope
- **Contradictions**: Fix the newer source, update the older one
- **Wrong audience**: Move internal details to code comments, keep docs conceptual

## `/docs glossary` — Glossary Update

Update `docs/glossary.md` with terms from recent work.

### Glossary Guidelines

These rules define what makes a good glossary entry. Follow them when adding or editing terms.

**What belongs in the glossary:**
- Domain concepts (node, card, column, board, vault, bead)
- Architectural patterns (TEA, signal, computed, provider, plugin)
- Interaction model terms (cursor, anchor, selecting kind, mode ladder)
- Cross-cutting concepts (sync, reconciliation, roundtrip)
- Overloaded terms that need disambiguation (commit, selection, pipeline)

**What does NOT belong:**
- Internal type names (`WriteQueue`, `OwnershipTracker`, `ReconcileOp`) — these are code, not concepts
- Implementation details (`cursorCardNodeId`, `sync_state`) — read the source
- File paths or locations — a glossary defines meaning, not where to find code
- Method signatures or field lists — that's API documentation

**How to write an entry:**
- 1 sentence for simple terms, 2 max for complex ones
- Start with what the term IS, not what it does or where it lives
- Use dictionary voice: "The primary selected node" not "Used throughout km for..."
- Drop library attribution unless the library IS the term (e.g., Zustand, flexily)
- Cross-reference naturally ("Contrast with *item*") not mechanically ("See also: X, Y, Z")

**Overloaded terms** get a disambiguation callout:
```
**commit** — ⚠️ Two meanings:
- *gesture*: writing `selecting` into `selected`. Triggered by mouseup.
- *event*: persisting a storage event to the database.
```

**Target size**: ~150-170 terms. If the glossary grows past 200, audit for implementation-detail terms that crept in.

### Update workflow

1. **Find new terms**: Search recent commits, design docs, and bead descriptions for terminology not yet in the glossary
   ```bash
   git log --since="7 days ago" --oneline
   # Read any new/changed design docs
   ```

2. **Check existing terms**: Grep for each glossary term in the codebase to verify it's still accurate
   ```bash
   grep -c "term" docs/glossary.md  # how many terms?
   ```

3. **Apply changes**: Add new terms, update stale ones, remove terms that are no longer used or are too implementation-specific

4. **Verify consistency**: Check that cross-references point to terms that exist, overloaded terms are disambiguated, and voice is consistent

5. **Optional: Pro review**: For major updates, send to `/pro` for accuracy review

## `/docs audit` — Documentation Consistency Audit

Check for docs that are stale, missing, or contradictory.

### Automated checks

```bash
# Dead links in markdown
grep -roh '\[.*\](.*\.md)' docs/ | grep -oP '\(.*?\)' | tr -d '()' | while read f; do
  [ ! -f "docs/$f" ] && [ ! -f "$f" ] && echo "DEAD LINK: $f"
done

# Glossary terms not found in codebase (may be stale)
grep '^\*\*' docs/glossary.md | sed 's/\*\*\([^*]*\)\*\*.*/\1/' | while read term; do
  count=$(grep -rl "$term" docs/design/ packages/*/src/ apps/*/src/ 2>/dev/null | wc -l)
  [ "$count" -eq 0 ] && echo "UNUSED TERM: $term"
done

# Design docs older than 30 days without recent commits
find docs/design/ -name "*.md" -mtime +30
```

### Manual checks

- Do CLAUDE.md skill tables match actual `.claude/skills/` directory?
- Do package tables match actual `packages/` and `vendor/` directories?
- Do command examples in docs actually work?
- Are test commands in CLAUDE.md current?

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Add file paths to glossary entries | Define meaning, not location |
| Add internal type names to glossary | Only concepts that cross module boundaries |
| Write 3+ sentence glossary entries | 1-2 sentences max, link to design doc for detail |
| Leave "See also" on every entry | Cross-reference naturally, only when it helps |
| Skip glossary update after design work | Run `/docs glossary` after any design session |
| Review docs without checking code | Every doc claim should be verifiable |
