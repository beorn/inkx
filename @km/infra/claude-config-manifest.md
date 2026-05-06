---
mentions:
  - km
  - Bjørn
id: "@km/infra/claude-config-manifest"
aliases:
  - km-infra.claude-config-manifest
  - km-infra-claude-config-manifest
created_by: Bjørn Stabell
created_at: 2026-04-19T05:10:50Z
closed_at: 2026-04-19T05:23:50Z
close_reason: >-
  Completed. Commits:

  - 0db1f4f9a feat(tools): lint-claude-config.ts drift-checker

  - aab4ddd58 feat(claude): auto-generated MECE manifests for
  hooks/skills/agents/mcp

  - a31785e68 feat(claude): claude-config activation skill

  - 7855a74ab chore(ci): wire lint-claude-config into test:ci


  Evidence:

  - `bun tools/lint-claude-config.ts` → exit 0 (11 hooks / 9 active / 2
  internal, 44 skills, 11 agents, 2 MCP servers)

  - Dummy-orphan end-to-end test: add .claude/hooks/dummy-orphan.sh → exit 1
  with "Orphan hook scripts (1)" in output; remove → exit 0.

  - `npx tsc --noEmit` (non-vendor) = 0 errors.

  - `bun fix` clean.

  - 4 MECE manifests auto-generated under
  .claude/{hooks,skills,agents}/README.md + .mcp-manifest.md.

  - New skill .claude/skills/claude-config/SKILL.md with keywords: hook, hooks,
  MCP, skill, agent, sub-agent, settings.json, WorktreeCreate, PreToolUse,
  PostToolUse, SessionStart, SessionEnd, PreCompact, UserPromptSubmit,
  SubagentStop, claude code config, config drift, lint-claude-config, orphan
  hook, manifest.

  - Root CLAUDE.md skills table updated with claude-config entry.

  - lint-claude-config wired into test:ci.


  Side effects during execution:

  - Registered 4 previously-orphan project hooks (session-start, session-end,
  user-prompt-submit, subagent-cleanup) + 1 newly-added worktree-remove
  counterpart.

  - Marked pre-compact.sh and post-bash-cleanup.sh with `# Hook-Status:
  internal` (they're called by other hooks, not top-level registrations).

  - Added missing description frontmatter to .claude/skills/docs/SKILL.md.


  17 skills remain with "no keywords" soft warnings — non-fatal, tracked as
  follow-up.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.claude-config-manifest
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-18T22:11:04Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] MECE Claude config manifest + drift-checker + activation skill @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

## Problem

Today's cross-session chaos root-caused to 'hook file exists but nobody knew it wasn't registered'. The WorktreeCreate hook was dead code for weeks — every agent worktree got half-populated vendor/ trees because nobody knew the hook existed.

Same risk exists for:

- Skills in .claude/skills/ (orphan skill directories, never keyword-matched)
- Agents in .claude/agents/ (orphan definitions)
- MCP servers in .mcp.json (servers configured but not running)
- Hooks in .claude/hooks/ (scripts without registration)

## Fix

## 1. Self-describing manifests per category (auto-generated)

Files: `.claude/hooks/README.md`, `.claude/skills/README.md`, `.claude/agents/README.md`, `.mcp.json → .mcp-manifest.md`

Each enumerates every file/entry in its directory with:

- name
- description (from docstring or first-line comment)
- activation trigger (event name / keywords / tool match)
- status: ACTIVE (registered and functional) or ORPHAN (file exists but not wired)

## 2. Drift-checker lint

`bun tools/lint-claude-config.ts` runs in test:ci. Rules:

- Every script in .claude/hooks/ must have a registration in settings.json
- Every registration in settings.json must point to an existing script
- Every skill in .claude/skills/ must have a SKILL.md with keywords
- Every agent in .claude/agents/ must have a valid frontmatter (name, description, tools)
- MCP server configs must match running MCP client state

Failures list the drift (X file exists but unregistered, Y registration broken).

## 3. Activation-on-demand skill

`.claude/skills/claude-config/SKILL.md` — keywords: hook, MCP, skill, agent, settings.json, WorktreeCreate, PreToolUse, PostToolUse, claude code config.

Content: inline MECE manifest + how to register a new hook/skill/agent/MCP properly. When an LLM touches any Claude Code config concern, skill loads, LLM sees full state.

## /complete

- [ ] `bun tools/lint-claude-config.ts` script exists, runs, exits 0 when clean
- [ ] Drift-checker catches orphan hook script (test: create dummy hook without registering, lint fails)
- [ ] Manifests in 4 directories: .claude/hooks, .claude/skills, .claude/agents, .mcp.json
- [ ] Skill .claude/skills/claude-config/SKILL.md exists with full keyword list
- [ ] lint-claude-config.ts wired into bun run test:ci
- [ ] Documented in CLAUDE.md skills table

## Why now

Real bug cost: the worktree-create.sh dead code caused the TEA Phase 2 agent (a07b0f69) to write a diagnostic handoff instead of doing work, wasted a full parallel agent slot.

## Parent

@km/infra

## Source

/why + MECE docs design discussion 2026-04-18

