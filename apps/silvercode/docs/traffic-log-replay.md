# Traffic Log Replay

`silvercode traffic replay` and `silvercode traffic view` inspect raw `AgentEvent`
JSONL ledgers without starting a provider or mounting the main TUI.

The replay path is deterministic:

```text
AgentEvent JSONL -> ChatEvent normalization -> ChatTree projection -> visible leaves
```

Use `traffic replay <path> --json` when a test or script needs the full replay
object. Use `traffic view <path>` when a human needs a scrubbed provenance view,
or `traffic view <path> --tui` for the interactive terminal viewer.

Both commands accept the same selectors:

- `--from <index>` and `--to <index>` for raw event spans.
- `--kind <kind>` for raw event kinds.
- `--session-id <id>` and `--turn <id>` for session and turn scopes.
- `--track <track>` and `--leaf <type>` for projected chat output.
- `--tool <id>`, `--permission <id>`, `--plan-step <id>`, `--job <id>`, and
  `--subagent <id>` for feature-specific debugging.

`traffic replay <path> --export-jsonl` emits only the selected raw events. This
is the fixture-minimization path for regressions: scrub to the smallest span
that still reproduces the normalized or projected defect, export it, and add it
to the focused test.
