# injection-gate — settings wiring

PreToolUse authority gate for Claude Code. Structural backstop for
`km-ambot` — blocks mutating tool calls driven by injected recall
rather than user-typed text. See `tools/injection-gate.ts` for the
algorithm and `km-bearly.injection-gate-pretooluse` for the design.

## Wire into `~/.claude/settings.json`

Add to the existing `hooks` object — do NOT replace other hooks:

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
        "hooks": [
          {
            "type": "command",
            // Absolute path so the hook works regardless of the calling
            // session's cwd. Replace /Users/beorn/Code/pim/km with your
            // local km checkout.
            "command": "bun /Users/beorn/Code/pim/km/tools/injection-gate.ts"
          }
        ]
      }
    ]
  }
}
```

## What the matcher covers

- `Write` — full-file write
- `Edit` — single-region replace
- `MultiEdit` — multi-region replace
- `NotebookEdit` — Jupyter cell write
- `Bash` — gate inspects the command for destructive regex (`rm -rf`,
  `>`, `chmod`, etc.) and only flags those

## How it integrates with @bearly/injection-envelope

- At `UserPromptSubmit` time, the envelope library's
  `wrapInjectedContext({sessionId, typedUserText, items})` persists
  a `TurnManifest` to `$BEARLY_SESSIONS_DIR/turn-manifest-<sid>.json`
  (default `~/.claude/bearly-sessions/`).
- At `PreToolUse` time, this hook reads the manifest, extracts
  entities + shingles from the pending tool's args, and applies
  deterministic heuristics:
  - **(B) Recall-only entities** — if candidate output references
    entities that appear ONLY in injected spans, not in typed text
    → deny
  - **(C) Shingle overlap** — if candidate overlaps injected
    recall much more than typed text, and user didn't explicitly
    authorize a write → deny
  - **(D) No explicit write auth** — mutating tool with injection
    present and typed text didn't contain mutation verbs → deny

## Deny messages

The deny reason always names the problematic entities. The user
can reply "proceed — I do want that" to authorize.

## Disabling

- Unset the hook in settings to disable globally.
- Remove the manifest side-effect by not passing `sessionId` to
  `wrapInjectedContext` (but then you lose the gate's data).
