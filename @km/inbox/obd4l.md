---
mentions:
  - km
id: "@km/inbox/obd4l"
aliases:
  - km-obd4l
  - "@km/_orphan/obd4l"
created_at: 2026-02-04T10:55:47Z
closed_at: 2026-02-04T11:00:32Z
---

# [x] Evaluate Claude plugins vs km skills @km/_orphan #feature #P3

Analyze official Anthropic Claude plugins for potential adoption vs km skills.

## Relevant Plugins (6 of 28)

### commit-commands (v1.0.0)

- Auto-generated commit messages, /commit, /commit-push-pr, /clean_gone
- **We have**: /commit skill with \!-backtick pre-gathering + allowed-tools restriction
- **They have**: /commit-push-pr (combined workflow), /clean_gone (branch cleanup)
- **We have that they don't**: bd sync integration, submodule-aware commits, bead correlation
- **Verdict**: We adopted the pattern (\! backtick + allowed-tools) but our skill is more specialized for monorepo+submodules+beads

### code-review (v1.0.0)

- 4 parallel agents: 2x CLAUDE.md compliance, 1x bug detection, 1x git blame context
- Confidence scoring (0-100, threshold 80+)
- **We have**: /code review-code skill, review-code-patterns.sh
- **They have**: Multi-agent parallel review, confidence scoring, auto-skip for draft/trivial PRs
- **We have that they don't**: Project-specific patterns (factory functions, using cleanup, etc.)
- **Verdict**: Their multi-agent + confidence scoring is more sophisticated. Consider adopting for larger reviews.

### feature-dev (v1.0.0)

- 7-phase workflow: Discovery → Explore → Questions → Architecture → Implement → Review → Summary
- Uses parallel code-explorer, code-architect, code-reviewer agents
- **We have**: /pm work + /pm feat workflows, TDD-first approach
- **They have**: Structured multi-agent exploration and architecture phases
- **We have that they don't**: Bead tracking, TDD workflow, @km/_orphan/specific patterns
- **Verdict**: Our workflow is more integrated with project management. Their exploration phase is worth studying.

### hookify (v0.1.0)

- Creates hooks from conversation patterns
- **We have**: Manual hook management in settings.json
- **They have**: AI-assisted hook creation from observed patterns
- **Verdict**: Skip — we manage hooks manually and just removed our only complex hook

### pr-review-toolkit (v1.0.0)

- 6 specialized agents: comment-analyzer, test-analyzer, silent-failure-hunter, type-design-analyzer, code-reviewer, code-simplifier
- **We have**: No PR workflow (commit directly to main)
- **Verdict**: Skip — doesn't match our workflow

### security-guidance (v1.0.0)

- Hook-based monitoring for 9 security patterns (SQLi, XSS, command injection, etc.)
- **We have**: Nothing equivalent
- **Verdict**: Low priority but could be useful. Simple hook, easy to add later.

## Plugins vs Skills: Architectural Comparison

| Aspect          | Plugins              | km Skills              |
| --------------- | -------------------- | ---------------------- |
| Portability     | Cross-project        | Project-specific       |
| Namespacing     | /plugin:cmd          | /cmd                   |
| Dynamic content | Same (! backtick, @) | Same                   |
| allowed-tools   | Same                 | Same                   |
| MCP servers     | Per-plugin .mcp.json | Project .mcp.json      |
| Configuration   | plugin.json manifest | Frontmatter            |
| Distribution    | Marketplace/GitHub   | Git repo               |
| Context         | No project awareness | Full project awareness |

## Key Insight

Plugins are better for generic workflows. Skills are better for project-specific workflows. km's commit, pm, and test workflows are deeply integrated with beads, submodules, and project conventions — plugins would lose that integration.

## Recommendation

- **Don't switch**: km skills are more integrated than plugins for our use cases
- **Do adopt patterns**: Multi-agent confidence scoring (from code-review), \! backtick pre-gathering (done)
- **Consider later**: security-guidance hook, plugin-dev for any future cross-project tools

