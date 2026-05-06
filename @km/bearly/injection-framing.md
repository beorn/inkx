---
mentions:
  - km
  - claude
id: "@km/bearly/injection-framing"
aliases:
  - km-bearly.injection-framing
  - km-bearly-injection-framing
created_by: Bjørn Stabell
created_at: 2026-04-21T06:09:51Z
owner: bjorn@stabell.org
assignee: claude:6552f1e9
dependencies:
  - issue_id: km-bearly.injection-framing
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-20T23:10:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [/] Injection framing: positive <user_prompt> marker + unified context envelope across all injection sources (tribe, recall, qmd, hooks, MCP) @km/bearly #task #P0 @claude:6552f1e9

blocks:: [[@km/bearly]]

## Problem

Claude Code's harness injects **non-user content** into `user`-role message turns via multiple channels. Because the Anthropic Messages API has only 3 roles (`system`, `user`, `assistant`), injected content — tribe channel messages, recall-memory snippets, qmd session memory, system-reminder blocks, hook output, MCP server instructions, command arguments — all collapse into `user` turns. Current mitigation is XML tag conventions (`<channel>`, `<recall-memory>`, `<session_memory>`, `<system-reminder>`, `<user-prompt-submit-hook>`). These are soft guarantees — text patterns the model is trained to usually respect, NOT structural constraints.

**Failure mode**: the model conflates injected content with user intent, answering phantom questions, acting on past-user-imperatives recalled as context, or responding to channel pings that warrant silence.

## Concrete failure examples observed 2026-04-20 (Bjorn's vault session)

Three distinct failures in one session:

1. **Phantom governance question**: A turn arrived containing a `<user-prompt-submit-hook>` block with hook output ("UserPromptSubmit hook success: OK") followed by substantive text ("how detailed should the governance be — is there anywhere we could capture eg. board vs executive...") that the user had NOT written. The model answered it as a fresh question. Source unclear — possibly recall-memory echo, qmd session-memory echo, or hook-output interleaving. The key failure: the text appeared adjacent to hook metadata but without a distinct `<user_prompt>` wrapper, and the model couldn't disambiguate.
2. **Past-user imperatives as fresh directives**: Earlier in the session, recall-memory snippets containing "create a bead that captures all of this" were treated as current instructions rather than context about what the past user had asked a past session.
3. **Channel-ping reflex**: Tribe daemon CPU-critical alerts ("load 38.05 exceeds 27.0 ...") repeatedly triggered action impulses despite vault-level feedback memory (`feedback_no_noted_acknowledgements.md`) explicitly forbidding it.

All three happened despite the existing XML framing. Framing alone is insufficient.

## Scope — broader than recall-memory

`km-bearly.recall-memory-framing` (P2) addresses ONE injection source (recall-memory) with Form A (XML envelope — ALREADY SHIPPING per observed `<recall-memory note="retrospective context...">` tags this session). Form A works as far as it goes.

**This bead covers the full injection landscape**:

| Source                  | Emitter                                      | Current framing                                             | Gaps                                                                                                                                                                |
| ----------------------- | -------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| recall-memory           | bearly/plugins/recall/src/lib/inject-core.ts | <recall-memory note="..."> ✅                                | Works; but user still conflates sometimes                                                                                                                           |
| qmd session memory      | UserPromptSubmit hook (where?)               | <session_memory source="qmd" trust="untrusted-reference"> ✅ | Same                                                                                                                                                                |
| tribe channel           | bearly/plugins/tribe                         | <channel source="plugin:tribe:tribe" ...> ✅                 | Works; but user-prompt-submit-hook note about untrusted gets ignored under pressure                                                                                 |
| system-reminder         | Claude Code harness                          | <system-reminder>                                           | AMBIGUOUS: some flavors wrap real user text ("The user sent a new message while you were working:"), others are pure environment. Model can't reliably distinguish. |
| user-prompt-submit-hook | Claude Code harness                          | <user-prompt-submit-hook>                                   | MISLEADING NAME: contains hook RESULTS not user prompt. Model pattern-matches "UserPromptSubmit" → user intent.                                                     |
| command-message         | Claude Code slash-command dispatch           | <command-message>                                           | Rare but present                                                                                                                                                    |
| MCP server instructions | Each MCP server                              | <system-reminder> with server doc                           | See system-reminder row                                                                                                                                             |

The pattern across sources: **no positive marker for "this is what the user actually typed"**. All markers are for the NON-user content. Model has to negate-identify user text by excluding the tagged regions.

## Proposal — three components, compose

## Component 1 — Positive user-prompt marker

Add a distinct wrapper around the user's actual typed text, emitted by the UserPromptSubmit hook or harness entry point:

```xml
<user_prompt>
  {verbatim user input}
</user_prompt>

<recall-memory ...>...</recall-memory>
<session_memory ...>...</session_memory>
```

Model extraction rule becomes simple and positive: respond to content inside `<user_prompt>`, treat everything else as context. No negation required.

**Implementation scope**: bearly UserPromptSubmit hook wraps the prompt BEFORE injecting recall/qmd. Claude Code harness may or may not cooperate — worst case, bearly adds the wrapper even if other content still appears at the same level, and the model is trained to prefer the wrapped text.

## Component 2 — Source normalization across emitters

Unify the 6 current tag shapes into a consistent schema:

```xml
<injected_context source="recall|qmd|tribe|telegram|fs-event|command|mcp-instruction"
                  trust="reference|untrusted|system"
                  actionable="false"
                  timestamp="...">
  {content}
</injected_context>
```

Each emitter (bearly/recall, bearly/tribe, qmd, MCP servers) produces the same outer envelope with differing `source` attribute. Model learns one shape, not six.

Disambiguation of the `<system-reminder>` ambiguity: reminders that wrap real user text get `<user_prompt>` instead, cleanly separating "hook/system notification" from "user typed this".

## Component 3 — Model-side discipline (vault + user CLAUDE.md)

Already partially landed 2026-04-20 in `~/Bear/Vault/CLAUDE.md` ("Injected context — silent ingest rule" section) and new feedback memory (`feedback_injection_echoes_not_instructions.md`). This component is CONFIGURATION, not code — reinforces the protocol but doesn't fix ambiguous emit shapes.

Components 1+2 are the structural fix. Component 3 is the today-fix.

## Why P0

- Pattern observed 3+ times in single session despite existing framing
- Bjorn running multiple concurrent Claude Code sessions via tribe — peer-session impersonation risk is live
- Auto mode amplifies the failure (biases toward action on anything that looks like a prompt)
- Security-adjacent: adversarial RAG / qmd content could become vectors if model treats tagged content as instructions
- Vault-wide reorg (`projects/+vault-reorg`) and +founder-portfolio archaeology in flight — sessions with high substantive context density = high injection echo risk

## Acceptance criteria

- `bearly` UserPromptSubmit hook emits `<user_prompt>` wrapper around verbatim user text, before any recall/qmd injection
- All bearly-side emitters (recall, tribe) use consistent `<injected_context source="..." trust="..." actionable="false">` envelope (OR: keep source-specific tags but ensure all have consistent attributes)
- Hook-output vs user-prompt clearly distinguishable in emitted format (hook results NEVER adjacent to unwrapped user-style text)
- New test: emission format contains exactly one `<user_prompt>` per firing, exactly matches the user's input, is not nested inside any `<injected_context>` envelope
- Existing tests (bearly/plugins/tribe/tests/, bearly/plugins/recall/tests/) green
- Documentation: `bearly/docs/injection-protocol.md` spelling out the schema, ownership, escape rules

## Not in scope

- Anthropic API changes (they own the 3-role constraint; we work within it)
- Claude Code TUI renderer changes (they own the `H:` duplicate display)
- Model training changes (we don't train Claude; this is emission-side discipline)
- MCP server-side format changes (each MCP server controls its own emission; we only fix bearly + suggest schema for others to adopt)
- Haiku rewrite (Form B from `km-bearly.recall-memory-framing`) — stays in that bead

## Relation to existing beads

- **`km-bearly.recall-memory-framing`** (P2, open) — Form A (recall XML envelope) already shipped. Form B (Haiku rewrite) still in scope of that bead. THIS bead supersedes its scope with broader coverage; that bead becomes a Form-A-done child of this.
- **Any tribe-channel classification bead** (the recall-memory-framing bead mentions `km-tribe.event-classification` as separate — if exists, should be child of this)

## References

- Canonical vault rule: `~/Bear/Vault/CLAUDE.md` section "Injected context — silent ingest rule"
- Vault feedback memory: `~/.config/claude-profiles/d@delei.org/projects/-Users-beorn-Bear-Vault/memory/feedback_injection_echoes_not_instructions.md`
- Session transcript where 3 failures observed: 2026-04-20 evening, vault session
- bearly emitter to touch: `vendor/bearly/plugins/recall/src/lib/inject-core.ts`
- bearly tribe emitter: `vendor/bearly/plugins/tribe/src/` (channel format)

