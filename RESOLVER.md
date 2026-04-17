# RESOLVER — Where Does This Knowledge Live?

Walk this decision tree before writing any documentation, knowledge, or persistent note. If you're unsure where something goes, start at Q1.

## Decision Tree

### Q1. Is this about the USER (preferences, communication style, feedback)?
→ **Memory files** (`~/.claude/projects/*/memory/`)
→ STOP

### Q2. Is this a step-by-step PROCEDURE (how to do X)?
→ **Skill file** (`.claude/skills/*/SKILL.md`)
→ If it's a sub-procedure within a skill, add it to the existing skill.
→ STOP

### Q3. Is this AGENT-OWNED knowledge (state snapshot, new finding, or cross-cutting operational)?
→ **Agent knowledge file** (`.claude/agents/expert/*-knowledge.md`)
  - **Current state** (versions, counts, scan results) → *canonical section* with timestamp; refreshed on grooming
  - **Fresh finding** needing review → *staging section* with `promote-to:` tag; agent promotes on grooming
  - **Cross-cutting** (regression patterns spanning subsystems, multi-repo coordination) → *canonical section*; this IS the home, no promotion
→ STOP

### Q4. Is this a SESSION ENTRY POINT (what you need in the first 30 seconds)?
→ **CLAUDE.md** in the relevant directory
→ Keep it under 200 lines. Link to deeper docs, don't duplicate them.
→ STOP

### Q5. Is this about a SPECIFIC WORK ITEM (bug context, feature plan, investigation)?
→ **Bead notes/design** (`bd update <id> --notes/--design`)
→ Ephemeral — tied to the work item's lifecycle.
→ STOP

### Q6. Is this INTERNAL (strategy, competitive, roadmap, drafts, pre-public design)?
→ **`hub/`** — walk [`hub/RESOLVER.md`](hub/RESOLVER.md) for per-slot rules (design/launch/research/market/etc).
→ Never reference from public docs.
→ STOP

### Q7. Is this STABLE, PUBLISHABLE DESIGN KNOWLEDGE (how the system works and why)?
→ **Canonical docs** — pick the tree by audience:
  - km product concepts → walk [`docs/RESOLVER.md`](docs/RESOLVER.md) for subdir routing (guides/design/ref/dev)
  - vendor package public API (silvery, flexily, termless, loggily, mdspec) → `vendor/<pkg>/docs/`
→ Rule for content that could go either public or internal: **publishable now → `vendor/<pkg>/docs/`**; **WIP or needs editorial polish → `hub/<pkg>/`** (default to hub until promoted, per Q6).
→ STOP

### Q8. None of the above?
→ Ask: "Will this be needed again?" If no → don't write it. If yes → re-read Q1-Q7; one of them fits.

## Domain Routing (for Q7)

When placing canonical docs, route by bounded context. The "Home" column names the **publishable** destination; anything not publishable yet goes to `hub/<pkg>/` first (Q6) and promotes to this home when ready.

| If it's about... | Publishable home | Owned by... |
|---|---|---|
| Layer boundaries, invariants, principles, glossary, package map | `docs/` (arch domain) | arch agent |
| Selection, commands, views, editing, navigation, input | `docs/design/` (editor domain) | editor agent |
| km product-level testing patterns | `apps/km-tui/tests/CLAUDE.md` | editor agent |
| silvery public API, components, styling | `vendor/silvery/docs/guide/` | render agent |
| Rendering pipeline, dirty flags, layout, scroll, perf (public) | `vendor/silvery/docs/` | render agent |
| Pipeline internals, WIP design, postmortems (not yet public) | `hub/silvery/` | render agent |
| Packaging, versioning, publishing, registry, exports | `vendor/CLAUDE.md` + `.claude/skills/release/` | npm agent |

## What Does NOT Go Where

| Location | Does NOT contain |
|---|---|
| **CLAUDE.md** | Deep design rationale, full procedures, current state |
| **Knowledge files** | Design explanations that fit in canonical docs |
| **Canonical docs** | Current runtime state, user preferences, procedures |
| **Skill files** | Design rationale, state snapshots |
| **Memory files** | Anything about the codebase (only user prefs/feedback) |
| **Bead notes** | Permanent knowledge (beads close; knowledge should outlive them) |
