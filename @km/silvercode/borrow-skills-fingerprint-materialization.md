---
aliases:
  - km-silvercode.borrow-skills-fingerprint-materialization
  - km-silvercode-borrow-skills-fingerprint-materialization
created_at: 2026-05-07T19:16:19.849Z
---

# Adopt skills-fingerprint materialization pattern for per-session km skill injection #P1

Paperclip's `packages/adapters/acpx-local/src/server/skills.ts` and `claude-local/src/server/skills.ts` materialize selected runtime skills into the agent's home directory at spawn time, keyed by a content fingerprint hash so unchanged skills are skipped. The shape is roughly:

```
hash.update(\`paperclip-acpx-${input.label}-skills:v1\n\`)
// then write skill files into agent home, idempotent under fingerprint
```

Silvercode currently has no per-session skill injection — a Claude session inherits whatever ~/.claude/skills the user has globally. As silvercode grows km-skill awareness (per-vault, per-session, per-pane), we want the same fingerprint-keyed write so:
- Skill changes propagate without re-spawn churn (idempotent under unchanged hash).
- Per-session scopes — a squad-mode pane can have different skills loaded than a peer pane.
- Cleanup is fingerprint-driven — when a skill is dropped from the session config, the file is revoked from the agent home (Paperclip's "Revoked ACPX Codex skill" log lines).

Goal: design the silvercode-side equivalent in apps/silvercode/src/skills/ (new module) and wire it into the ACP spawn path so per-session km skill bundles can be injected at session start.

Acceptance:
- Module `apps/silvercode/src/skills/materialize.ts` with `materializeSkills(scope, { agentHome, label, skills }) → fingerprint`.
- Idempotency test — second call with same skill set is a no-op (asserted via fs.stat mtime).
- Revoke test — call with a smaller skill set, dropped skills are removed from agentHome.
- Wire one consumer — silvercode's claude-acp spawn passes session-scoped skills (read from km vault @<prefix>/skills/) before `claude` starts.
- Cross-reference: apps/silvercode/src/coordinator-mcp.ts (current per-session config), Paperclip prepareClaudeConfigSeed for the seed-file pattern.
- Out of scope: km-skill discovery + selection UI — that's a separate bead. This one is the fingerprint-keyed writer.
