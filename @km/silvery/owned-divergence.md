---
mentions:
  - km
id: "@km/silvery/owned-divergence"
aliases:
  - "@km/all/owned-divergence"
  - km-all.owned-divergence
  - km-all-owned-divergence
created_by: claude:cc081a9a
created_at: 2026-04-27T06:21:50Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.owned-divergence
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-26T23:21:55Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] [epic] Owned divergence — workarounds we maintain forever @km/all #feature #P3

blocks:: [[@km/all]]

Perpetual sibling registry to @km/all/upstream-waiting. Holds workarounds where upstream is dead/declined/wontfix, and we own the divergence permanently. Reviewed in /sop infra alongside @km/all/upstream-waiting.

**Membership rule**: items move HERE from @km/all/upstream-waiting when their `Escalate by:` date arrives and re-decision concludes "accept owned divergence" (upstream dead, declined, or no longer aligned with our needs). They can also be filed directly here if it's clear from day one that no upstream fix is coming.

**Difference from @km/all/upstream-waiting**: that registry tracks workarounds we plan to *unwind* when upstream lands. This registry tracks workarounds we plan to *maintain forever*. The two have different lifecycle expectations and different review questions:

- upstream-waiting: "did upstream land yet? can we unwind?"
- owned-divergence: "is the divergence still doing its job? does it still cost less than the alternatives?"

**Bead description template** (each child documents):

```
Owned divergence. <one-sentence summary>.

Original upstream: <URL — closed issue, declined PR, abandoned project>
Why owned: <why upstream won't fix — abandoned | declined | needs differ | better-as-fork>
Decided owned on: <YYYY-MM-DD>   # when escalation re-decided
Last reviewed: <YYYY-MM-DD>      # updated each /sop infra cycle

Files we maintain divergent from upstream:
- <path>: <what's different and why>

Maintenance plan:
- <how we keep this in sync with upstream's evolution, or evidence we don't need to>
- <upgrade strategy: vendorize? fork? patch on every dep update?>

Review questions (each /sop infra cycle):
1. Is the divergence still doing its job?
2. Has upstream changed in a way that makes this obsolete?
3. Has the cost of maintaining the divergence grown beyond the value it provides?
```

**Code marker convention**: same shape as upstream-waiting but with a different first line, so the lint script and grep audits can distinguish:

```
// OWNED-DIVERGENCE: <one-line reason>
// Bead: km-<scope>.<slug>
// Last reviewed: <YYYY-MM-DD>
```

**Cadence**: reviewed monthly via /sop infra alongside upstream-waiting. Most cycles will be no-op "still relevant" check-ins; occasional cycles will graduate items back upstream (rare — usually upstream catches up to us) or retire items entirely (the divergence is no longer needed).

**Cross-refs**:

- Sibling registry: @km/all/upstream-waiting (workarounds that should be unwound when upstream lands)
- Workflow skill: .claude/skills/pm/workflows/upstream.md §8
- Lint script: packages/@km/infra/scripts/check-upstream-markers.sh

/complete: never (perpetual registry).

