<!-- GENERATED from .agents/skills/*/SKILL.md. Keep in sync when the skill inventory changes. -->

# Codex Skills

MECE inventory of every skill directory under `.agents/skills/`.
Each skill is activated on demand by matching its description and keywords against
the user prompt and sub-agent context.

## Skills

| Skill | Description | Keywords |
| --- | --- | --- |
| `ask` | Single-model quick questions to other LLMs — fast, cheap (~$0.02). Use for one-off second opinions and prior-art lookups. For multi-model judging use /pro. For web-search research use /deep. | `gpt`, `chatgpt`, `openai`, `gemini`, `grok`, `ask`, `second opinion`, `quick` |
| `beads` | Beads — issue tracking with km bd. Canonical surface for the bead workflow: CLI, lifecycle, ids, claim/release, storage model. Load this for anything bead-related. /pm aliases here. | `bead`, `beads`, `km bd`, `issue`, `ticket`, `claim`, `close`, `ready`, `in_progress`, `P0`, `P1`, `P2`, `P3`, `P4`, `scope epic`, `sub-bead`, `parent`, `label` |
| `big` | META-PROTOCOL for reframing the problem: generate 10-20 hypotheses, run at least two rounds, and find the design where the bug cannot happen. Use when a fix feels like a patch, the same area keeps breaking, or the user asks to think bigger. Subsumes /fresh. | - |
| `checkpoint` | Checkpoint session context to a tracking bead. Ensures ONE bead captures all active work, recent commits, uncommitted changes, and next steps. Use before /compact, at natural breakpoints, or when context is getting long. Also runs automatically via pre-compact hook. | - |
| `claude` | Codex configuration - commands, plugins, MCP. Use when creating skills, configuring MCP servers, or managing Codex settings. | `Codex skill`, `slash command`, `/command`, `MCP`, `AGENTS.md`, `hooks`, `permissions`, `plugin` |
| `claude-config` | Codex configuration drift — audit, register, and repair hooks, skills, sub-agents, and MCP servers. Use when adding a hook, checking why a hook isn't firing, resolving drift-checker failures, or reviewing the full Codex config surface. | `hook`, `hooks`, `MCP`, `skill`, `agent`, `sub-agent`, `settings.json`, `WorktreeCreate`, `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `PreCompact`, `UserPromptSubmit`, `SubagentStop`, `Codex config`, `config drift`, `lint-claude-config`, `orphan hook`, `manifest` |
| `close` | Graceful session shutdown. Wraps up agent team, background tasks, and shells if idle; warns about unfinished work and offers /complete + /merge before exit. `/close tribe` broadcasts the same protocol to all tribe members. | `close`, `shutdown`, `wrap up`, `finish`, `end session`, `disconnect`, `exit`, `quiesce`, `sign off` |
| `code` | Code quality - principles compliance, architecture, design, simplification. Use when reviewing code structure, improving type safety, simplifying code, or stepping back to find dramatic improvements. **Proactively activate `/code quality`** after completing any substantial feature/refactor where the code feels complicated, has repeated patterns, or smells like it's fighting the wrong abstraction. | `code review`, `architecture`, `types`, `clean`, `quality`, `layers`, `over-engineering`, `improve`, `simplify`, `rethink`, `principles` |
| `commit` | Commit changes to git. Use when ready to commit staged or unstaged changes. | - |
| `complete` | Completeness audit — verify everything since the last /complete is actually finished. Bead acceptance greps run against origin/main (not local worktree). Use when finishing a refactor, migration, feature, or integration round. | `complete`, `done`, `finish`, `session end`, `audit`, `remnant`, `leftover`, `round close`, `integration verify`, `acceptance grep` |
| `cpu` | CPU & I/O — Rogue Process Hunter + Bottleneck Finder | `cpu`, `processes`, `rogue`, `runaway`, `slow`, `fan`, `hot`, `kill`, `cleanup`, `memory`, `ram`, `io`, `disk`, `network`, `bottleneck`, `fd`, `file descriptor` |
| `csw` | Complete Staff Work — structured analysis of a decision, design choice, or problem. Gathers all context, enumerates options with concrete examples, scores them, and presents a clear recommendation. The decision-maker should only need to say 'approved' or pick an option. | `csw`, `complete staff work`, `options`, `analysis`, `decision`, `tradeoffs`, `compare`, `alternatives`, `which approach`, `how should we` |
| `daily` | Daily ritual — run today's due cadence routines, prompt about due weekly/monthly/quarterly, surface yesterday's leave-notes, recommend next bead. Run at least once a day. | `daily`, `morning`, `routine`, `cadence`, `scheduled maintenance`, `weekly check`, `monthly check`, `what's due`, `what should I do today` |
| `deep` | Long-running web-search research with citations via OpenAI's Deep Research API (~$2-5, 2-15 min, fire-and-forget). Use when prior art / external citations matter. NOT DeepSeek. For multi-model judging without web search use /pro. | `deep research`, `thorough research`, `web search`, `citations` |
| `diagram` | ASCII diagram creation — aligned boxes, trees, flow diagrams. Use when creating diagrams in markdown docs. Prevents the chronic misalignment bug. | - |
| `discuss` | Pause implementation to discuss architecture, alternatives, or understanding. Use when you want to step back and discuss before coding. Checkpoints context to active bead for safe resumption. | - |
| `docs` | Docs — Documentation Management. Use when maintaining glossaries, running doc reviews, or auditing documentation consistency. | `docs`, `glossary`, `review docs`, `update docs`, `documentation audit` |
| `explore` | TUI exploration - interactive AI probing + targeted testing + randomized bug hunting. Use when exercising km view to find bugs, test scenarios, or inspect the live terminal. | - |
| `flexily` | Debug and fix Flexily layout issues — caching, fingerprinting, zero-allocation, performance. Use when Flexily layout is broken or performance degrades. | - |
| `fp-check` | Deprecated — false positive checking is done inline during reviews. | - |
| `fresh` | META-PROTOCOL for being stuck 20+ min on a specific problem — stops coding, gathers context, calls /deep (or /pro) internally with a structured request. Not itself an LLM tool. For unstructured stuck-feelings use /big; for direct questions use /ask, /pro, /deep. | `stuck`, `fresh perspective`, `step back`, `rethink`, `going in circles`, `each fix breaks something`, `tried everything` |
| `ink-compat` | Silvery vs Ink comparison, compat upgrade, benchmarking, and positioning analysis. One skill for all Ink-related work. Use when Ink releases a new version, when updating silvery-vs-ink docs, when benchmarking, or when planning silvery's positioning. | - |
| `lmstudio` | Query local LM Studio server on :1234; auto-starts via `lms server start` if down. Use when the user wants a local-model answer via LM Studio. | - |
| `logging` | Logging patterns — loggily namespaces, debug(), worker threads, file writers. Use when adding debug output, configuring loggers, building observability surfaces, or specifying log file paths in a bead. | `logging`, `debug`, `logger`, `worker thread`, `console output`, `DEBUG_LOG`, `JSONL`, `observability`, `namespace`, `log file`, `log levels`, `loggily` |
| `marketing` | Marketing — Content Marketing Coordination | `marketing`, `blog`, `SEO`, `content`, `article`, `newsletter`, `distribution`, `programmatic` |
| `max` | Maximize parallelization through sub-agents. Use when you have several todos, suspect tasks can be decomposed, or user requests parallel execution. | `parallel`, `concurrent`, `sub-agents`, `decompose`, `maximize` |
| `merge` | Reduce WIP — converge every in-flight work surface back to origin/main. Worktrees, branches, stashes, claimed-but-stale beads, submodule pointer drift, /loop and /schedule routines. Anytime, optionally scoped. | `merge`, `converge`, `settle`, `integrate`, `reduce wip`, `finish`, `land`, `ship retained`, `stop the bleeding` |
| `npm` | npm registry — name availability, package status, audit, deprecate. Use when exploring package names, reserving npm names, checking package status, auditing the package registry, or deprecating renamed/superseded packages. | `npm`, `package name`, `availability`, `scope`, `org`, `registry`, `reserve`, `check name`, `naming`, `audit`, `deprecate`, `status`, `list`, `maintainer`, `beorno` |
| `omlx` | Query local oMLX server on :8080 (mlx_lm.server). Does NOT auto-start; user runs `omlx` in a foreground shell. Use when the user wants a local-model answer via oMLX. | - |
| `open` | Open files, folders, URLs, beads, and ~shortcuts in the default macOS app via the `open` command | - |
| `perf` | Performance diagnostics and profiling. Use when debugging slow startup, laggy navigation, jank, stutter, event loop blocks, unresponsive UI, or any performance issue. | `slow`, `perf`, `performance`, `lag`, `jank`, `stutter`, `unresponsive`, `event loop`, `blocked`, `timing`, `profile`, `benchmark`, `latency` |
| `plat` | Quality plateau gap analysis. Auto-qualifies one or more domain lenses from this session's edits, friction, attention, claims, and bd activity; loads each lens's plateau definition; ranks gaps and offers DO / CAPTURE / DOC / SKIP. Use when asking whether an area has reached its quality plateau. | `plat`, `plateau`, `quality plateau`, `L5`, `gap analysis`, `not-done-done`, `quality plateau yet` |
| `playwright-cli` | Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages. | - |
| `pm` | Issue tracking with beads. Use when creating, claiming, closing issues or coordinating work across sessions. | `bd`, `beads`, `issue`, `task`, `work`, `claim`, `bug`, `backlog` |
| `pro` | Multi-leg dual-pro dispatch (DeepSeek R1 + Kimi K2.6 + rotating challenger) — second opinions, code reviews, architectural advice. Parallel models judged on a rubric. Heavier than /ask, lighter than /deep. | `pro`, `/pro`, `ask pro`, `second opinion`, `code review`, `dual-pro`, `multi-leg` |
| `recall` | Search and manage Codex session history. Use proactively when encountering errors, starting work, or recovering lost content. | `recall`, `memory`, `history`, `session`, `recover`, `find`, `previous session`, `lost conversation` |
| `refactor` | Plan and execute large refactors — phased migrations, API redesigns, package extractions. Use when a refactor spans multiple files/packages and needs a plan with phases, /complete criteria, and zero-WIP discipline. | `refactor`, `migration`, `extract`, `decompose`, `split`, `rename`, `redesign`, `phase` |
| `release` | Release packages — status, verify, and execute releases across km vendor submodules. AI-native changelog/bump from diffs, real pre-publish verification. | `release`, `publish`, `version`, `changelog`, `npm`, `tag`, `vendor release`, `status`, `verify` |
| `silverize` | Audit a codebase for silvery alignment — philosophy, components, patterns, styling, runtime. Finds tarnished code and shows the shiny equivalent. | `silverize`, `silvery`, `tarnished`, `shiny`, `audit`, `alignment`, `components`, `the silvery way` |
| `silvery` | Debug and fix silvery rendering issues — incremental rendering, dirty flags, scroll containers, sticky children. Use when silvery renders incorrectly or has visual artifacts. | - |
| `skill-improve` | Iterative skill refinement — run a skill, observe gaps, fix, re-run. Automated improvement loop. Use after /skill-test finds issues, or to polish any skill. | - |
| `skill-test` | Pressure-test a skill with adversarial subagent scenarios. TDD for skills — write the test, watch it fail, fix the skill, watch it pass. | - |
| `sop` | SOP / ops — scan→propose→execute across 9 maintenance domains. The one skill that grooms everything. Alias: /ops | `sop`, `ops`, `maintain`, `groom`, `audit`, `review`, `health check`, `periodic`, `refresh`, `cloudflare`, `domain` |
| `sync` | Deprecated — split into /merge (reduce WIP) and /daily (cadence routines). This skill redirects. | - |
| `tdd` | TDD mode — reproduce first, fix second. Use PROACTIVELY when the user reports a bug, requests a feature, or says 'fix'. Also use when you catch yourself reading source code before writing a test. | - |
| `terminfo-update` | terminfo.dev periodic refresh — discover, probe, validate, build, deploy. Run monthly or when upstream terminals release. | `terminfo`, `update`, `refresh`, `probe`, `discover`, `radar`, `explore` |
| `test-site` | AI-driven visual smoke test — explore any website via Playwright, find interactive elements, verify they work | `test site`, `smoke test`, `visual test`, `examples`, `demos`, `playwright`, `website`, `QA` |
| `tests` | Test-driven development for km. Use when writing tests, running test suites, fixing test failures, or following TDD workflow. | `test`, `TDD`, `bun test`, `test:fast`, `test:all`, `buffer assertions`, `chaos`, `silvery`, `createTestApp` |
| `tribe` | Tribe coordination — check sessions, send messages, view health/history. Use when user says /tribe. | - |
| `tui` | TUI development - design system, km-specific rendering bugs, performance. Use when building silvery components for km, fixing km-tui visual bugs, or optimizing TUI performance. For silvery pipeline bugs (dirty flags, incremental rendering, scroll tiers), use /silvery instead. | `TUI`, `silvery`, `styling`, `colors`, `slow`, `rendering`, `performance`, `design system`, `km-tui`, `board`, `card`, `column` |
| `why` | 5 Whys root cause analysis + /big reframing. Use when the same area keeps breaking, when a fix feels like it's treating symptoms, or when you want to understand WHY a problem exists — not just how to fix it. | - |
| `worktree` | Worktree pool — claim a slot, work in it, release. The canonical source for all worktree/branch/concurrency/isolation rules. Load this before spawning agents, planning concurrent work, or asking 'where do I work?'. | `worktree`, `pool`, `slot`, `wt1`, `wt2`, `claim`, `release`, `isolation`, `concurrent agents`, `branch hopping`, `parallel work` |

## How to add a new skill

```markdown
<!-- .agents/skills/my-skill/SKILL.md -->
---
description: One-line purpose + "Use when ..." trigger.
argument-hint: [optional|subcommands]
allowed-tools: Read, Write, Bash
---

# My Skill

**Keywords**: keyword1, keyword2, trigger phrase

Skill body here ...
```
