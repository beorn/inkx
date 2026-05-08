---
mentions:
  - km
aliases:
  - "@km/silvercode/acp-matrix-spike"
  - "@km/silvercode/matrix-spike"
  - km-silvercode.acp-matrix-spike
  - km-silvercode-acp-matrix-spike
created_at: 2026-05-07T13:30:00.000Z
type: spike
priority: P2
---

# [ ] ACP-over-Matrix prototype spike — five-phase validation in ~1 week @km/silvercode #spike #P2

Hands-on spike to validate the strategic claims in `@km/silvercode/acp-matrix-binding`. Five phases, each with an explicit stop-signal, total ~1 week of focused work. After Phase 3 there's enough signal to decide whether to promote the parent bead to P1 or scope it down.

Goal: end-to-end ACP-over-Matrix demo (multi-observer, federated, optionally E2EE) using off-the-shelf parts before committing to a full reference impl.

## Stack picks

| Choice                       | Tool                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Homeserver (local)           | matrix-conduit (0.10.12 in nixpkgs) — `nix-install nixpkgs#matrix-conduit`    |
| Homeserver (federation test) | matrix.org public account as second server                                    |
| Client SDK                   | matrix-bot-sdk (TS, includes Olm/Megolm crypto) — `bun add matrix-bot-sdk`    |
| Underlying agent             | claude-acp subprocess (already wired in silvercode)                           |
| Test client UI               | Element web in browser (no install — element.io)                              |

## Phase 0 — Hello world (½ day) — ✅ DONE 2026-05-07 (~10 min elapsed)

- [x] Install conduit locally (`NIXPKGS_ALLOW_UNFREE=1 nix profile add --impure nixpkgs#matrix-conduit` — `nix-install` zsh alias doesn't exist in bun-shell). Write minimal `conduit.toml` (server_name=localhost, port=6167, allow_registration=true, allow_federation=false, rocksdb backend). Start on :6167. Conduit creates database on first run.
- [x] Register a bot account (`POST /_matrix/client/v3/register` with `auth: {type: m.login.dummy}`). Captured access token. Also registered a `human` test account.
- [x] Scratch script (~30 LOC) using `matrix-bot-sdk`: bot joins on invite, echoes incoming messages. Required `bun pm trust @matrix-org/matrix-sdk-crypto-nodejs` to enable the native crypto postinstall (bun blocks it by default).
- [x] Verified end-to-end: human creates room → invites bot → bot auto-joins → human sends "hello bot" → bot replies "echo: hello bot". Confirmed via timeline read-back over REST. Did not need Element web for verification.

**Findings**:
- conduit 0.10.12 from nixpkgs works out-of-the-box on darwin-arm64.
- matrix-bot-sdk SDK behaves as documented; the native-crypto postinstall trust step is the only friction.
- Conduit auto-creates an admin room and posts welcome messages when the bot joins it — bot will echo those too unless you filter by sender or room.
- Spike artifacts: `.claude/worktrees/wt2/spike/` (gitignored implicitly — never committed). Conduit data: `spike/conduit-data/` (rocksdb).

**Stop signal**: not triggered — phase complete.

## Phase 1 — Wrap an LLM, validate streaming feel (½–1 day) — ✅ DONE 2026-05-07

- [x] Bot listens for room messages (filtered to `m.text` from non-bot, non-`@conduit:localhost`, non-`m.replace` events).
- [x] Pipes user text to LM Studio (OpenAI-compatible at `:1234`) using `openai` SDK with `stream: true`. Anthropic SDK kept available as fallback (env has `ANTHROPIC_API_KEY`).
- [x] Streams response back as `m.replace` edits — initial placeholder message captured by `event_id`, subsequent edits sent as `m.relates_to: {rel_type: "m.replace", event_id}` with `m.new_content: {body, msgtype}`. Throttled to 250ms minimum between edits.
- [x] Verified end-to-end: `hello bot` produced 4-edit progression (placeholder → 31 chars → 51 chars → 69 chars → final), each edit visible separately in Matrix timeline. Mechanism works.

**Findings**:
- **Mechanism is solid**: `m.replace` edits from matrix-bot-sdk render cleanly in modern Matrix clients (legacy clients show `* <body>` fallback).
- **GOTCHA — typing indicator masks streaming**: setting `setTyping(roomId, true, ...)` for the entire LLM call duration causes Element web to defer rendering of in-flight `m.replace` edits — user sees long "typing" period followed by a 3-4s burst of all text appearing at once. **Fix**: drop typing indicator the moment the first token arrives (`setTyping(roomId, false, 0)` inside the stream loop). After this fix, streaming renders progressively as each edit lands. This is non-obvious and only caught by real eyeball testing.
- **Edit throttle**: 100ms (10 edits/sec) works smoothly in Element web. 250ms feels chunky on fast models. Conduit unfazed at 100ms; lower bound is bot-sdk HTTP-PUT cost (~50ms locally).
- **Latency is model-bound, not transport-bound**: qwen3.6-27b-ud-mlx (a *reasoning* model on Mac M-series) burns tokens on internal reasoning before visible output. Switching to non-reasoning models (gemma-4-e4b, openai/gpt-oss-20b) or Anthropic Claude API gives ChatGPT-class smoothness. Matrix layer itself is not the bottleneck.
- **Conduit happily accepts** ~10 edits/sec without protest. `matrix-websockets-proxy` is not needed for this latency budget; legacy /sync is fine.
- **Element X / mobile clients** were not validated in this phase (defer to Phase 3 multi-observer demo).
- **User confirmation 2026-05-07**: with both fixes (typing-drop + 100ms throttle), "it started streaming immediately" — phase complete.

**Stop signal**: not triggered — streaming mechanism works, perceived smoothness depends on the underlying LLM. Phase 1 complete.

## Notes for Phase 2

The bot's `room.message` handler currently treats incoming `m.text` events as raw user prompts. Phase 2 will replace this with `m.acp.request` event-type dispatch, calling into a real `claude-acp` subprocess via JSON-RPC instead of LM Studio. The streaming pattern (placeholder + incremental edits) is reusable for `m.acp.update` notifications.

## Phase 2 — Spec + impl `m.acp.*` events (2–3 days)

Define three custom event types:

- `m.acp.request` — `{method, params, id}` — client → bot
- `m.acp.response` — `{id, result | error}` — bot → client
- `m.acp.update` — `{method, params}` — bot → all observers (no id)
- [ ] Bot receives `m.acp.request`, dispatches to `claude-acp` subprocess via JSON-RPC.
- [ ] Streams `claude-acp`'s `session/update` notifications back as `m.acp.update` events.
- [ ] Sends final `m.acp.response` when the prompt turn ends.
- [ ] CLI demo: `bunx silvercode-matrix-cli --room <id>` — sends `session/prompt` as `m.acp.request`, prints `m.acp.update` events.

**Stop signal**: event-type mapping doesn't survive a real session — tool calls / plan updates / permission requests need bidi callbacks that don't fit the request/response/notification triad. Revisit design before continuing.

## Phase 3 — Multi-observer demo (½ day)

- [ ] Run two `silvercode-matrix-cli` instances against the same room.
- [ ] Both see the same `m.acp.update` stream simultaneously.
- [ ] Bonus: open Element on phone, join room, watch tool calls in real-time on mobile.
- [ ] Record screencap — this is the killer demo for the wedge.

**This phase is the decision gate.** After Phase 3 we know enough to decide:

- All working → promote parent bead `@km/silvercode/acp-matrix-binding` to P1, share demo, start OGP-compat research.
- Streaming felt bad in Phase 1 → kill the parent bead, note learnings.

## Phase 4 — Federation smoke (1–2 days)

- [ ] Spin up a second conduit instance on a different port (or use matrix.org as server B).
- [ ] Configure federation between the two homeservers.
- [ ] Create a federated room — agent on server A, client on server B.
- [ ] Full ACP roundtrip works.

**Stop signal**: conduit federation fights for >½ day. Fall back to `matrix.org-as-A + local-conduit-as-B` to validate the pattern; defer self-hosted federation testing to v2.

## Phase 5 — E2EE smoke (1–2 days)

- [ ] Enable E2EE in the test room.
- [ ] `matrix-bot-sdk` crypto setup — `bot.crypto.prepare()` etc.
- [ ] Validate: bot encrypts outgoing events, decrypts incoming events.
- [ ] `curl` conduit's room messages endpoint as admin, confirm only ciphertext is stored.

**Stop signal**: Olm key sharing fails across multi-device for >2 days. Defer E2EE to v2; ship without it. Federation + multi-device value still holds.

## Decision matrix after the spike

| Outcome                                | Action                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| All five phases work                   | Promote parent bead to P1; share demo; start OGP compat research; draft compliance-enterprise pitch                |
| Phases 0–3 work, federation/E2EE flake | Ship Matrix as "single-org transport with audit log"; drops federation pitch, keeps multi-device + bridges + audit |
| Phase 1 streaming felt bad             | Kill parent bead; document learnings; revisit when Matrix-WS MSC merges                                            |
| Phase 2 event mapping doesn't survive  | Revisit m.acp.* design; consider OGP-compat from the start; possibly defer parent bead                             |

## Concrete first commands

```bash
# Install conduit via nix user profile (per ~/CLAUDE.md package policy)
nix-install nixpkgs#matrix-conduit

# Scratch worktree
bun worktree create acp-matrix-spike  # or git worktree
cd .claude/worktrees/acp-matrix-spike
mkdir spike && cd spike
bun init -y
bun add matrix-bot-sdk

# Local conduit — write conduit.toml (server_name, port, database path)
# See: https://docs.conduit.rs/configuration.html
conduit --config conduit.toml &  # binds to :6167 by default

# Register bot account (one-time, via conduit's admin room or registration token)
# See: https://docs.conduit.rs/registration.html

# Hello world: bot joins a room, echoes incoming messages
cat > hello.ts <<'EOF'
import { MatrixClient, SimpleFsStorageProvider } from "matrix-bot-sdk"
const client = new MatrixClient(
  "http://localhost:6167",
  process.env.MATRIX_TOKEN!,
  new SimpleFsStorageProvider("/tmp/spike-bot.json"),
)
client.on("room.message", (roomId, ev) => {
  if (ev.sender === client.userId) return
  client.sendText(roomId, `echo: ${ev.content.body}`)
})
await client.start()
EOF
MATRIX_TOKEN=<bot-access-token> bun run hello.ts
```

Total day-1 budget: ½ day to "bot echoes in Element web."

## Out of scope for the spike

- Full opencode-server compat (that's `@km/silvercode/parity-kilo/opencode-server-compat`).
- Production-grade E2EE (key rotation, cross-signing, device verification UI).
- HG HomeServer embedding — defer to the full impl bead; conduit local is enough for the spike.
- OGP compatibility — research note in parent bead, not impl in spike.
- Performance benchmarking — qualitative "feels good" is enough at this stage.

## Related

- Parent: `@km/silvercode/acp-matrix-binding` — strategic overview + acceptance for the full binding
- Sibling-of-interest: `@km/silvercode/acp-http-binding` — primary binding ships first; spike informs the multi-binding architecture
- Reference: `@km/silvercode/acp` (closed) — stdio binding implementation as the JSON-RPC source

@agent/2

