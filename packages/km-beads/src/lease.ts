/**
 * Bead claim lease policy.
 *
 * A "claim" is `assigned_to` + `task_status: wip` written by `bd update --claim`
 * (or `task claim`). The claim is conceptually a lease — after a window of
 * inactivity, a stale claim is reclaimable by another session so dropped /
 * crashed agents don't permanently block beads.
 *
 * Two tiers, distinguished by the *shape* of the assignee identifier:
 *
 *   - **Agent leases** (20 min) — assignees that look like spawned agent
 *     sessions: `claude:*`, `silvercode:*`, or any `<harness>:<session-id>`
 *     pattern. Agents are expected to either close the bead or refresh the
 *     claim within minutes.
 *   - **User leases** (24 h) — every other assignee shape (bare emails, names,
 *     `@handle`s). Users work on slower wall-clock timescales; a 24-hour lease
 *     gives them a workday to come back without losing their claim.
 *
 * The lease is consulted at claim time only (see `repo.tryClaim` in
 * `@km/storage`). We never pre-emptively clear stale claims; they remain on the
 * bead until somebody else tries to claim, at which point the CAS WHERE clause
 * accepts (`assigned_to IS NULL OR assigned_to = self OR updated_at < cutoff`).
 *
 * Source-of-truth for the policy values: bead `@km/agent/sigil-boards`
 * (Phase 1 — "Lease expiry at board level"). If the policy changes, update
 * here; the storage layer is parametric on `leaseMs`.
 */

/** 20-minute agent lease, in milliseconds. */
export const AGENT_LEASE_MS = 20 * 60 * 1000

/** 24-hour user lease, in milliseconds. */
export const USER_LEASE_MS = 24 * 60 * 60 * 1000

/**
 * Heuristic: does this assignee look like an automated agent session?
 *
 * Matches `<harness>:<session>` patterns (claude:, silvercode:, pi:, …).
 * A bare email or `@handle` is NOT an agent.
 */
export function isAgentAssignee(assignee: string): boolean {
  // `<word>:<rest>` where `<word>` is an alphanumeric harness id.
  // Excludes `mailto:` and URL-shaped strings by requiring the rest to be
  // non-empty and not start with `//`.
  const match = /^([a-z][a-z0-9_-]*):([^/].*)$/.exec(assignee)
  if (!match) return false
  // Reject obvious URI schemes that aren't agent sessions.
  const scheme = match[1]!
  if (scheme === "mailto" || scheme === "http" || scheme === "https") return false
  return true
}

/**
 * Lease window for the given assignee — agent or user policy.
 *
 * Use at claim time to compute the staleness cutoff:
 *
 *   const cutoff = Date.now() - leaseMsForAssignee(holder)
 *   // claim succeeds if holder.updated_at < cutoff (lease expired)
 */
export function leaseMsForAssignee(assignee: string): number {
  return isAgentAssignee(assignee) ? AGENT_LEASE_MS : USER_LEASE_MS
}
