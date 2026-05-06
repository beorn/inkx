# silvercode L5 — manual smoke checklist

The Layer 5 smoke is what we run by hand against a real Anthropic /
OpenAI API every morning before shipping. Layers 1-4 cover the wiring;
this checklist covers the things only a human eye + a real API can
catch — token cost, timing, terminal-host quirks (Ghostty / kitty /
iTerm2 / WezTerm), real Claude streaming behaviour.

Target: **30 seconds**, end to end. If the checklist takes longer than
that, automate the slow step into a Layer 4 visual test.

## Pre-flight

- [ ] `~/.claude/auth.json` exists OR `ANTHROPIC_API_KEY` is set
- [ ] `which silvercode` resolves to the just-built binary (not a stale install)
- [ ] Terminal is at >= 100 cols (mode-row labels need width)

## Run

```bash
cd ~/tmp/scratch
silvercode
```

## Visual checks

- [ ] **Welcome screen paints once.** No flicker, no double-bordered title,
      no cursor artefacts above the input. The block disappears on first
      user input.
- [ ] **Side panel is visible.** Identity row + ctx=0% bar + version
      string. No truncation, no overflow off-screen.
- [ ] **Input cursor blinks.** Not a flat block, not invisible — the
      shaped block-on-block cursor specific to silvery's TextInput.
- [ ] **Mode label reads "auto"** (or whatever the current default is).

## Functional flow

- [ ] Type `hi` and press Enter.
  - [ ] User-message block renders below Welcome (or replaces it).
  - [ ] Activity indicator spins / pulses while Claude responds.
  - [ ] Assistant text streams in incrementally (not all-at-once on turn-end).
  - [ ] Status returns to idle within 5s.
- [ ] Press Up arrow (or whatever the queue-edit chord is).
  - [ ] Cursor moves into the queue editor.
  - [ ] Type a follow-up; it lands in the queue (NOT sent yet).
  - [ ] Press Enter — queue flushes, message goes out.
- [ ] Type a Bash request — `run git status please`.
  - [ ] Permission prompt appears (auto mode may auto-allow read-only).
  - [ ] If a prompt appears, approve once — tool runs, result streams.
  - [ ] Tool-call block renders inline with the assistant turn.
- [ ] Type a long shell command that returns >1KB of output.
  - [ ] Side panel STAYS visible (no overflow regression — see
        `km-silvercode.overflow-at-root`).
  - [ ] Tool-result block content stays inside its frame.

## Tear-down

- [ ] Press Ctrl+D (or :q).
  - [ ] App exits cleanly. No subprocess left running:
    ```bash
    pgrep -f "claude --bare" && echo LEAK || echo clean
    ```
  - [ ] Resume hint prints: "silvercode --resume claude-code:<id>".

## Quota / overage

(Run only when Pro / Max plan is active.)

- [ ] Side panel shows 5h + 7d quota bars.
- [ ] When both bars are GREEN, the "Xtra" panel is hidden.
- [ ] Force a panel show (e.g. `silvercode --debug-quota=overage`) — the
      Xtra panel renders with a yellow label.

## Multi-backend (when codex / sdk paths land)

- [ ] `silvercode --backend=codex` spawns the codex CLI; side panel
      shows the OpenAI model label.
- [ ] `silvercode --backend=sdk` uses the SDK path; `apiKeySource` reads
      `ANTHROPIC_API_KEY`.

## Reporting a smoke failure

If a step fails, note:

1. The exact step number that failed.
2. Terminal app + OS (Ghostty, kitty, …).
3. Stop reason / error message if any.
4. Whether it reproduces in a clean shell vs only inside tmux / multiplexer.

File against bead `km-silvercode.test-system` or open a P1 if it's a
regression that didn't exist yesterday. Smoke failures take priority
over feature work — the daily smoke is the last line of defence
between green CI and a broken user.

