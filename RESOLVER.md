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

### Q3. Is this a CURRENT STATE snapshot (versions, counts, scan results)?
→ **Agent knowledge file** (`.claude/agents/expert/*-knowledge.md`) — canonical section
→ Include a timestamp. Will be refreshed on next grooming run.
→ STOP

### Q4. Is this a NEW FINDING that needs review before becoming permanent?
→ **Agent knowledge file** — staging section (with `promote-to:` tag)
→ Agent will promote it to the right canonical home during grooming.
→ STOP

### Q5. Is this CROSS-CUTTING operational knowledge with no single-doc home?
(regression patterns spanning multiple subsystems, multi-repo coordination rules, cross-domain connections)
→ **Agent knowledge file** — canonical section
→ This IS the canonical home. It won't be promoted elsewhere.
→ STOP

### Q6. Is this a SESSION ENTRY POINT (what you need in the first 30 seconds)?
→ **CLAUDE.md** in the relevant directory
→ Keep it under 200 lines. Link to deeper docs, don't duplicate them.
→ STOP

### Q7. Is this about a SPECIFIC WORK ITEM (bug context, feature plan, investigation)?
→ **Bead notes/design** (`bd update <id> --notes/--design`)
→ Ephemeral — tied to the work item's lifecycle.
→ STOP

### Q8. Is this INTERNAL (strategy, competitive, roadmap, drafts)?
→ **vendor/internal/** in the relevant project subdirectory
→ Never reference from public docs.
→ STOP

### Q9. Is this STABLE DESIGN KNOWLEDGE (how the system works and why)?
→ **Canonical docs** (`docs/` or `vendor/*/docs/`)
→ Pick the directory that matches the domain (see domain list below).
→ STOP

### Q10. None of the above?
→ Ask: "Will this be needed again?" If no → don't write it. If yes → re-read Q1-Q9; one of them fits.

## Domain Routing (for Q9)

When placing canonical docs, route by bounded context:

| If it's about... | It goes in... | Owned by... |
|---|---|---|
| Layer boundaries, invariants, principles, glossary, package map | `docs/` (arch domain) | arch agent |
| Rendering pipeline, dirty flags, layout, scroll, perf | `vendor/silvery/docs/` or `vendor/internal/silvery/` | render agent |
| Selection, commands, views, editing, navigation, input | `docs/design/` (editor domain) | editor agent |
| Packaging, versioning, publishing, registry, exports | `vendor/CLAUDE.md` or `.claude/skills/release/` | npm agent |
| Testing patterns, assertion hierarchy | `apps/km-tui/tests/CLAUDE.md` | editor agent |
| silvery public API, components, styling | `vendor/silvery/docs/guide/` | render agent |
| Pipeline internals, postmortems | `vendor/internal/silvery/` | render agent |

## What Does NOT Go Where

| Location | Does NOT contain |
|---|---|
| **CLAUDE.md** | Deep design rationale, full procedures, current state |
| **Knowledge files** | Design explanations that fit in canonical docs |
| **Canonical docs** | Current runtime state, user preferences, procedures |
| **Skill files** | Design rationale, state snapshots |
| **Memory files** | Anything about the codebase (only user prefs/feedback) |
| **Bead notes** | Permanent knowledge (beads close; knowledge should outlive them) |
