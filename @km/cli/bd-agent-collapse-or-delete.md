---
aliases:
  - km-cli.bd-agent-collapse-or-delete
  - km-cli-bd-agent-collapse-or-delete
created_at: 2026-05-06T17:13:25.009Z
---

# Consolidate `bd agent ls` data path with `km agent ls` #P3

Reframed under the on-ramp model. `km agent` and `km bd agent` are NOT redundant duplicates — they have different mental models:

- **`km agent`** (9 subcommands: ls, spawn, stop, kill, show, harnesses, sessions, session, run) — agent process lifecycle
- **`km bd agent`** (6 subcommands: ls, queue, assign, unassign, claim, run) — bd-style work assignment

Both call into the `@km/agent` package. They share the data layer, not the surface.

The original "delete bd-agent.ts" framing was based on misreading them as duplicates. **Both stay** as legitimate parallel surfaces with different audiences (km-native users vs bd-on-ramp users).

## Real consolidation opportunity: only `ls`

The single overlap: both `km agent ls` and `bd agent ls` call `queryAgents(repo)` and format the result. The output formatters might differ slightly. Real action:

- Extract the shared formatter to a small helper (already shared via the `@km/agent` package); both surfaces use it
- ~30 LOC saved at most

## Out of scope

- Don't delete `bd-agent.ts` — it has bd-specific work-assignment subcommands (queue/assign/unassign/claim) that aren't in `km agent`
- Don't merge the `run` semantics — they differ on purpose (km agent run = one-shot prompt; bd agent run = work through queue)

## Why P3 (lower than originally filed)

Tiny LOC savings. The duplicate-`ls` smell is real but the user has indicated agents aren't actively used yet ("we are not even using that feature"). Don't over-invest before the feature graduates.

If agents become actively used and the two surfaces diverge in ways that confuse users, revisit.
