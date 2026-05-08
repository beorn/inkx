---
aliases:
  - km-silvercode.binary-wrap-intercept-strategy
  - km-silvercode-binary-wrap-intercept-strategy
created_at: 2026-05-08T01:32:03.548Z
---

# Binary-wrap intercept strategy for spawned claude (Pro/Max path) — what gating actually applies #P2

Sub-bead under `@km/silvercode/cross-agent-feature-harmonization`. Decide and document the gating story for the binary-wrap path (silvercode's `@km/claude-acp` spawning the `claude` binary for Pro/Max subscription users), since it determines how much of silvercode's permission-policy harmonization (item 2) and filesystem-intercept story actually applies to those panes.

## The structural problem

For ACP-native backends (Codex, Gemini, opencode-via-ACP, Cline), the agent calls `fs/read_text_file` over JSON-RPC; silvercode implements it; intercept is free. Pattern B per the harmonization epic.

For binary-wrap (Claude Pro/Max via spawn — the only Anthropic-tolerated path for subscription users in third-party hosts), Claude Code's *own* Read/Write/Bash tools fire **inside the spawned process** using libc syscalls. silvercode sees the tool call after-the-fact in the stream-json output but does **not** intercept it before execution. Three intercept opportunities silvercode loses by default:

- **Permission gating per-read** — silvercode can only see the read happened (post-hoc). Can't deny a read in flight.
- **Vault-aware path remapping** — agent reads `src/auth.ts`; silvercode wanted to redirect to a vault-mirrored copy or block it. Can't.
- **Buffer/LSP-context awareness** — agent reads disk; silvercode's km-storage view of the file (current edit state, frontmatter facets) isn't considered.

Reporting channels (stream-json output, fd-3 sideband as in happy's A3 pattern) don't help — they're after-the-fact event streams, not gating mechanisms.

## Gating options to evaluate

In order from cheap to heavy:

1. **stdin tool-result feedback** — Claude Code accepts `--input-format stream-json` for input, not just emits it as output. If we can configure Claude to *wait* for client-side tool execution rather than running its own, silvercode could feed tool results back through stdin. **Verify**: does standalone `claude --print --input-format stream-json` actually support waiting for client-injected tool results, or is that ACP-via-claude-agent-acp-only?
2. **Permission-mode + allowlist/denylist flags** — `--permission-mode ask` plus `--allowedTools` / `--disallowedTools` to restrict which tools Claude can invoke at all. Coarser than per-call gating but no OS magic. **Probably the best near-term option.** Verify: how granular is Claude's permission-mode? Per-tool? Per-tool-call? Per-path?
3. **OS-level sandboxing** — macOS `sandbox-exec` profile, Linux seccomp-bpf, Docker. Restrict what spawned `claude` can `open()`. silvercode crafts a profile allowing reads inside the project tree + vault, blocking everything else. Forces fallback to whatever Claude does when reads fail. Verify per-OS feasibility.
4. **FUSE-mounted synthetic filesystem** — silvercode controls every `open()` Claude does via userland FUSE handler. Heavy: latency cost, kernel FUSE support required, macOS-fragile (third-party drivers).
5. **LD_PRELOAD / DYLD_INSERT_LIBRARIES** — intercept libc syscalls. Blocked by macOS hardened runtimes on signed binaries. Not recommended.
6. **Network intercept** — proxy Claude's outbound API calls. Doesn't help: Claude executes tools locally then sends *results* to the model API; the interesting events are pre-network.

## Acceptance — what "done" looks like

- [ ] Verify in current Claude Code release: does `--input-format stream-json` standalone support waiting for client-injected tool results (option 1)? Document the answer with version + flag-output evidence.
- [ ] Document Claude's actual permission-mode granularity (option 2). Per-tool? Per-call? Per-path? Test with a known set of tools.
- [ ] Decide gating story: which option(s) silvercode adopts for the binary-wrap path. Default expectation: option 2 (allowlist + permission-mode) for most users; option 3 (OS sandbox) for high-trust scenarios.
- [ ] Update `apps/silvercode/README.md` with the user-facing trade-off: subscription-Claude-via-binary-wrap gives coarser gating than API-key-Claude-via-ACP. Users with both auth options can choose per session.
- [ ] Update `apps/silvercode/src/doctor/checkers/` with a check that surfaces which gating mode is active per-pane.
- [ ] Add to harmonization epic: which of the 9 dimensions degrade under binary-wrap and to what extent.
- [ ] Cross-reference `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md` § A3 fd-3 sideband — note that fd-3 is *reporting*, not *gating*, to prevent future conflation.

## Why this matters strategically

The harmonization epic frames `@km/claude-acp` as moat infrastructure (Anthropic only permits binary-wrap for Pro/Max). But that moat comes with an asymmetry users should understand: **subscription-Claude panes don't get the same silvercode-side intercept that ACP-native panes get.** This bead surfaces the asymmetry, scopes the gating story, and decides what silvercode does in production.

Without this bead, silvercode's permission-policy work (Phase B item 2) silently fails on Pro/Max panes — the policy renders in the UI but isn't actually enforced for filesystem reads, and users won't realize it.

## Notes

- Filed 2026-05-08 from session conversation about ACP `fs/*` vs binary-wrap intercept (and a chat-only sloppy reference to "fd-3 proxy" that needed correcting — fd-3 is reporting, not gating).
- Cross-references the parent harmonization epic, the `borrow-paperclip-execution-target` bead (sandbox spawn is option 3 here), and the existing `@km/claude-acp` package.
- Consider whether sandboxing also applies to ACP-native backends as an additional defense layer ("can silvercode sandbox even when intercept is already in place?") — out of scope for this bead but a reasonable follow-up.
