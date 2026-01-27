---
name: review-claude
description: Audit Claude Code steering docs for token efficiency and progressive disclosure
---

# /review-claude - Steering Documentation Audit

Audit Claude Code configuration for progressive disclosure and token efficiency.

## The Economics

CLAUDE.md loads **every message** (~4 tokens/line). Skills load **only when invoked**.
A 300-line CLAUDE.md wastes 1,000+ tokens before your request is even read.

**Target: CLAUDE.md <60 lines. Everything else on-demand.**

## Three-Layer Architecture

| Layer           | Loads           | Target       | Contains                           |
| --------------- | --------------- | ------------ | ---------------------------------- |
| CLAUDE.md       | Always          | <60 lines    | Commands, stack, pointers          |
| .claude/skills/ | When invoked    | 50-150 lines | Actionable workflows, code samples |
| docs/\*.md      | When referenced | Any          | Full specs, rationale, history     |

## Layer Relationships

**Skills summarize, docs explain.** They complement, never duplicate.

| Pattern               | When to Use                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| Skill → points to doc | Skill has rules, doc has rationale (e.g., tui-design.md → docs/06-ui.md) |
| Doc only              | Human reference, not actionable for Claude                               |
| Skill only            | Claude-specific workflow, no human audience                              |

**Anti-patterns:**

- Full duplication between skill and doc (content drifts)
- Doc-only for Claude workflows (can't find it)
- Skill with no doc pointer (rationale lost)

## Audit CLAUDE.md Lines

Ask in order—first "yes" wins:

1. **Can a tool enforce this?** → Delete. Configure ESLint/Prettier/TypeScript.
2. **Is it a code snippet?** → Delete. Use `file:line` pointer instead.
3. **Task-specific workflow?** → Move to `.claude/skills/`
4. **Reference material?** → Move to `docs/`, add skill pointer if needed.
5. **Would removing it cause mistakes?** → Keep only if YES.

## Audit Skills

**Size check:** Flag skills >150 lines. Split or move details to docs/.

**Consolidation opportunities:**

- Multiple skills with overlapping workflows → merge
- Skills that are really reference docs → move to docs/, add pointer skill

**Split opportunities:**

- Skills with distinct sections rarely used together → split
- Troubleshooting content → move to docs/, keep core in skill

**Auto-loading check:** Skills with broad keywords ("slow", "error") may load when irrelevant. Consider making reference-only.

## Audit Commands

**Commands** (`.claude/commands/`) = user-invoked workflows (`/name`)
**Skills** (`.claude/skills/`) = auto-loading OR user-invoked reference/workflows

**Size check:** Flag commands >300 lines. Consider splitting modes into separate commands.

**Overlap check:**

- Commands doing similar things → merge or clarify boundaries
- Command that duplicates skill → consolidate

**Naming check:**

- Name describes action clearly?
- Follows naming pattern? (`/review-*` family, `/verb-noun`)

**Should be a skill instead?**

- Reference material, not workflow → skill
- Auto-loads on context → skill
- No arguments/modes → probably skill

**Should be a command instead?**

- User explicitly invokes → command
- Has arguments/modes → command
- Multi-step workflow → command

## Audit Hooks

Check `.claude/settings.json` and `.claude/hooks/` for hook configuration.

**Available hook events:**

| Event              | Can Add Context? | Use Case                       |
| ------------------ | ---------------- | ------------------------------ |
| `SessionStart`     | Yes (stdout)     | Set env vars, inject context   |
| `SessionEnd`       | No               | Cleanup, warnings to user      |
| `UserPromptSubmit` | Yes (stdout)     | Add context to messages        |
| `PreToolUse`       | Can modify       | Validate/transform tool inputs |
| `PostToolUse`      | No               | Logging, follow-up             |

**Hook audit questions:**

- Is the hook doing something a skill could do? → Consider skill
- Is the hook output appearing in context? → Check stdout handling
- Could this fail silently? → Add error handling
- Is there a corresponding skill that should reference this hook?

**Note:** `SessionEnd` cannot inject context (session is ending). Use CLAUDE.md for session-completion rules that Claude needs to follow.

## Red Flags

- Style rules (linters should handle)
- "Be helpful" / "Write clean code" (noise)
- Duplicate content across files
- Code examples (get stale fast)
- Instructions >200 (models lose track beyond ~150)
- Skills >150 lines (split or move to docs)

## Validation

Simulate: "As a fresh Claude session, do I know exactly what to do and what not to do?"
Flag anything requiring guesswork.

## Deliverable

**Summary:**

- CLAUDE.md: X lines (target: <60)
- Skills: Y files, largest Z lines
- Top 3 issues found

**Recommendations table:**

| Priority | Content | Action | Token Δ |
| -------- | ------- | ------ | ------- |

**Skills analysis:**

| Skill | Lines | Recommendation |
| ----- | ----- | -------------- |

**Commands analysis:**

| Command | Lines | Recommendation |
| ------- | ----- | -------------- |

**Hooks analysis:**

| Hook | Event | Purpose | Issues |
| ---- | ----- | ------- | ------ |

If CLAUDE.md needs major restructuring, provide a rewritten version following layer guidelines.
