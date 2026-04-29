---
id: "@km/silvercode/shell-preview-argv-security"
aliases:
  - km-silvercode.shell-preview-argv-security
  - km-silvercode-shell-preview-argv-security
created_by: claude:2405c72e
created_at: 2026-04-25T16:13:27Z
closed_at: 2026-04-25T16:23:48Z
close_reason: Implemented in cacf304d7. Schema migrated string→{exec,args};
  per-arg ${resolves_to} substitution; argv-form Bun.spawn; minimized env
  (PATH/HOME/LANG only, TERM=dumb); SIGKILL timeout; sanitizeShellOutput strips
  ANSI/CSI/OSC/DCS/PM/APC/SOS/C0-controls/DEL — defense-in-depth even when
  TERM=dumb is ignored. 23 new tests across config + previews + sanitizer; 78/78
  autolinks tests green.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.shell-preview-argv-security
    depends_on_id: km-silvercode.autolinks-config
    type: parent-child
    created_at: 2026-04-25T09:13:30Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] shell preview kind: argv form + ANSI sanitization (security) @km/silvercode #bug #P0

blocks:: [[@km/silvercode/autolinks-config]]

Pro review (2026-04-25, /tmp/llm-2405c72e-...-5zsn.txt and yvaz.txt) flagged the current shell preview implementation as a security regression:

## Current state (commit 7d8e4d23d)

```yaml
syntaxlinks:
  - pattern: "~repo"
    preview: shell
    command: "git -C ${resolves_to} log -5 --oneline"
```

The `command` is a string. silvercode runs it via `Bun.spawn` with shell:false but parses the string itself, with a leading-metachar drop guard (`|`, `&`, `;`, `>`, `<`, ``).

## Pro findings

A leading-metachar check is **not** a security model. `bash -lc`, `python -c`, weird PATH resolution all still pass. Plus: shell-output text is rendered in a TUI buffer — terminal-injection (ANSI escapes, OSC commands, control sequences) is a real class of bug.

## Fix

1. **Schema change**: `command` becomes a structured form, not a string:
   ```yaml
   syntaxlinks:
     - pattern: "~repo"
       preview: shell
       command:
         exec: git
         args: ['-C', '${resolves_to}', 'log', '-5', '--oneline']
   ```
   Each `args` entry is interpolated per-token (`${resolves_to}` substituted), never concatenated into a shell string.

2. **Argv form only**: `Bun.spawn` already accepts argv arrays; pass `{cmd: [exec, ...args], shell: false, env: ...}`. No `sh -c` anywhere.

3. **Sanitize output before rendering**: strip ANSI escape sequences (`\x1b[...`), C0 control chars, OSC sequences (`\x1b]...`), and DCS sequences from shell-output text before piping into the popover. Whitelist: tabs, newlines, printable ASCII, valid UTF-8.

4. **Tighten env**: minimal env (`PATH`, `HOME`, `LANG`, `TERM=dumb`); don't inherit user's shell aliases / functions.

5. **Process group kill**: when the timeout fires, kill the whole process group (`process.killpg` or equivalent) so spawned children die.

## Acceptance

- [ ] Schema change: `command: string` → `command: { exec: string; args: string[] }`
- [ ] Validation: drop rules where exec contains path separators (`/`, `\\`) — must be a bare program name resolved via PATH (or absolute path with explicit allow-list, decided later)
- [ ] All `Bun.spawn` calls use argv array, `shell: false`
- [ ] Output passes through ANSI/control-sequence sanitizer before render
- [ ] Process-group kill on timeout
- [ ] `TERM=dumb` in spawn env so commands don't emit color codes by default
- [ ] Tests: argv interpolation, ANSI strip, OSC strip, control-char strip, timeout kills children
- [ ] Update `docs/design/autolinks.md` with the new schema

## References

- /pro review #1 (deep): `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-5zsn.txt`
- /pro review #2 (fast): `/tmp/llm-2405c72e-senior-engineer-architectural-review-of-yvaz.txt`
- Implementation: `apps/silvercode/src/autolinks/{config,previews}.ts`