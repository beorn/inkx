# Information Architecture — DRY across docs, CLAUDE.md, skills, and knowledge files

Every piece of information lives in exactly one canonical home. Everything else references it.

## The 5 Layers

| Layer | Purpose | Examples | Maintained By |
|---|---|---|---|
| **Canonical docs** | Design truth — the authoritative "what and why" | `docs/design/*.md`, `docs/principles.md`, `RENDERING.md`, `LESSONS.md` | Owning agent |
| **CLAUDE.md files** | Session entry points — summaries + pointers | Root `CLAUDE.md`, `vendor/silvery/CLAUDE.md` | Owning agent (summary sections) |
| **Skill files** | Procedural workflows — "how to execute" | `.claude/skills/*/SKILL.md` | Owning agent |
| **Knowledge files** | Reference index + staging area (see below) | `.claude/agents/expert/*-knowledge.md` | Owning agent |
| **Memory files** | User prefs, feedback, communication style | `.claude/projects/*/memory/` | Auto-memory system |

## What Goes Where (MECE by information type)

### Canonical Docs — `docs/`, `vendor/*/docs/`
Design decisions, architectural principles, data model, glossary, component guides, algorithm references, postmortems, operational gotchas (once promoted), regression patterns (once promoted).

**Rule**: if it describes *how the system is designed and why*, OR is a stable operational insight that every session needs, it goes here.
**Not here**: current runtime state, workflow procedures, user preferences.

### CLAUDE.md Files — per-directory
Short summaries that orient a new session. Point to canonical docs for depth. Include: key commands, gotchas that bite every session, quick-reference tables.

**Rule**: if every session touching this directory needs it in the first 30 seconds, it goes here. Max ~200 lines.
**Not here**: deep design rationale (→ canonical docs), workflow procedures (→ skill files).

### Skill Files — `.claude/skills/*/SKILL.md`
Step-by-step procedures for executing workflows: release, test, review, triage. Include: command tables, decision trees, error recovery.

**Rule**: if it answers "how do I do X right now", it goes here.
**Not here**: design rationale (→ canonical docs), current state (→ knowledge files).

### Knowledge Files — `.claude/agents/expert/*-knowledge.md`

Knowledge files have **three sections**:

#### 1. Reference Index (permanent, thin)
Annotated links to canonical docs — NOT copies. Each link includes a short annotation about what's there and any operational notes.

```markdown
## Reference Index
- `docs/design/model/knode.md` — KNode shape, items vs blocks, board hierarchy
  - Note: body extraction edge case with mixed heading siblings (2026-04-10)
- `vendor/silvery/RENDERING.md` — pipeline algorithm, 8 phases
  - Note: bgDirty epoch clearing changed in v0.17.3
```

This section is stable. It changes only when canonical docs are added/moved/reorganized.

#### 2. Canonical Sections (permanent, this IS the home)
Some knowledge has no natural home in project docs — it's cross-cutting, experiential, or operational. The knowledge file IS the canonical source for these:

- **Regression patterns** — "dirty flag changes tend to break scroll containers" (spans pipeline + layout + tests)
- **Cross-domain connections** — "silvery exports changes break km-tui tests" (spans two agents)
- **Coordinated operational state** — publish order across 8 repos, version coordination rules
- **Anti-patterns tried** — "we attempted X across the whole repo and it failed because Y"
- **Whole-repo concerns** — patterns that don't belong to any single package's docs

```markdown
## Canonical: Regression Patterns
- Dirty flag changes → test scroll containers + sticky headers + km-tui visual regression
- Exports map changes → run verify gate + check km-tui imports still resolve
```

**Test**: if you can't point to a specific file in `docs/` or `vendor/*/docs/` where this belongs, it's canonical to the knowledge file. If you CAN point to a home, it's staging.

#### 3. Staging Area (ephemeral, drains toward zero)
New findings awaiting promotion to canonical docs. Each entry has a `promote-to:` destination.

```markdown
## Staging
- **Gotcha**: changing scrollRect phase order breaks sticky headers
  promote-to: RENDERING.md#sticky-two-pass or LESSONS.md
- **Inconsistency**: docs/ref/packages.md lists @silvery/ansi as 0.3.4, actual is 0.17.3
  promote-to: fix docs/ref/packages.md directly
```

Each grooming run drains staging by promoting findings to their canonical homes. Staging that keeps growing means the agent isn't doing its primary job. But some items may stay if, on reflection, they belong in the canonical section instead.

#### What does NOT belong in knowledge files
- Design explanations that fit in `docs/design/` (→ put them there)
- Algorithm descriptions that fit in RENDERING.md (→ put them there)
- Package inventories that fit in docs/ref/packages.md or npm-packages.md (→ put them there)
- Type definitions or code structure (→ derive from code, don't copy)
- Anything that duplicates content in a canonical doc elsewhere

### Memory Files — `.claude/projects/*/memory/`
User communication preferences, workflow feedback, project context. Owned by the auto-memory system.

**Rule**: if it's about the user or how to collaborate with them, it goes here.
**Not here**: anything about the codebase itself.

## Approval Rules for Doc Updates

Agents promote findings from staging to canonical docs. Not all promotions are equal:

### Auto (agent just does it)
- Fix factual errors in docs it owns (stale version, broken path, typo)
- Add new entries to docs it owns (gotcha, lesson, package inventory row)
- Update current-state sections it owns (test counts, version tables)

### Ask first (present to user, wait for approval)
- Structural changes to any doc (reorganize sections, change narrative, delete content)
- Editing docs owned by a **different agent** (cross-boundary — see ASSETS.md)
- Anything that changes design rationale or architectural decisions
- Removing content from canonical docs (even if moving it elsewhere)

The ownership boundary from ASSETS.md is the natural gate. If in doubt, ask.

## The Agent's Primary Job

An agent's primary job during grooming is **maintaining canonical docs** — not maintaining its own knowledge file. The flow:

1. Scan sources for new information (bead close reasons, LESSONS.md, session recall, tribe, git log)
2. Write new findings to staging area (with `promote-to:` tag)
3. **Promote staged items to their canonical homes** (edit the target doc)
4. Remove promoted items from staging
5. Update reference index if canonical docs moved
6. Report what was promoted and what's still staged

The knowledge file should be the THINNEST file the agent maintains — most of its work goes into the canonical docs it owns (per ASSETS.md).

## Information Flow (promote / demote)

### Promote (staging → canonical docs or CLAUDE.md)

| Signal | Destination |
|---|---|
| Gotcha that bites every session | → CLAUDE.md gotchas section |
| Gotcha that reveals a design principle | → `docs/principles.md` |
| Failed approach that reveals a constraint | → `docs/lessons/*.md` |
| Regression pattern implying missing invariant | → RENDERING.md or design doc |
| Cross-domain contract | → `docs/README.md` or package docs |
| Inconsistency | → fix the doc directly |
| Operational pattern (stable, recurring) | → relevant CLAUDE.md or doc |

### Demote (canonical docs → staging or delete)

| Signal | Action |
|---|---|
| Doc section that's really operational trivia | → stage with promote-to a better home, clean doc |
| CLAUDE.md gotcha only relevant to one domain | → that agent promotes to its owned docs |
| LESSONS.md entry that's been fully resolved | → mark resolved in LESSONS.md, no knowledge file needed |
| Stale doc content | → update doc to current, no knowledge file needed |

### Sources to scan for promote/demote candidates

| Source | What to look for | Command |
|---|---|---|
| **Bead close reasons** | Insights that should be documented | `bd list --status=closed --since=2w` |
| **LESSONS.md entries** | New postmortems needing promotion or archival | `git log --oneline -20 -- '**/LESSONS.md'` |
| **Session recall** | Recurring patterns across sessions | `bun recall --raw "domain keywords"` |
| **Tribe history** | Gotchas flagged by other sessions | `bun tribe log` |
| **Git log** | Recent changes to canonical docs | `git log --oneline -20 -- 'docs/'` |
| **bd memories** | Persistent memories that should live in docs | `bd memories "domain keywords"` |

## Ownership MECE

Every file is owned by exactly one agent (see ASSETS.md). The owning agent:
1. Keeps the canonical docs current (primary job)
2. Maintains a thin reference index in its knowledge file
3. Uses staging for new findings, drains it on each grooming run

## Behavioral Triggers (agent disciplines)

Inspired by gbrain's skillpack pattern. Every agent should have explicit behavioral rules in scannable trigger format — not buried in prose.

```
Always: <unconditional standing behavior>
Before: <pre-condition check>
When X: <conditional trigger>
Never: <hard guard>
```

### Universal triggers (all agents)

```
Always: check RESOLVER.md before writing any documentation
Always: include [Source: session-id, YYYY-MM-DD] on findings in staging
Before: writing to a doc you don't own → check ASSETS.md, ask if cross-boundary
When: a finding appears 3+ times in staging → promote to canonical docs
When: a bead closes with insights in the reason → stage the insight
Never: write stable knowledge only to a knowledge file (it must reach canonical docs)
Never: duplicate content that exists in a canonical doc (reference it instead)
```

### Notability gate

Before staging a finding, ask: "Will a future session need this? Is this reusable knowledge or one-time context?" If one-time → bead notes, not staging. If reusable → stage with `promote-to:` tag.

## Anti-Patterns

- **Knowledge files that rewrite canonical docs** — the initial seed files did this; prune on next grooming
- **Staging that never drains** — means the agent isn't promoting; treat as a bug
- **Writing findings directly to knowledge file instead of canonical docs** — knowledge file is a staging area, not a destination
- **CLAUDE.md sections that duplicate skill files** — one-line pointer + key commands only
- **Current state in docs/** — docs describe design, not runtime state; state goes in knowledge file staging, then gets promoted to the right place or discarded
- **Permanent "operational gotchas" section** — gotchas should be promoted to CLAUDE.md or docs, not kept in knowledge files forever
