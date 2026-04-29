---
id: "@km/silvery/unicode-plateau/phase-2"
aliases:
  - km-silvery.unicode-plateau.phase-2
  - km-silvery-unicode-plateau-phase-2
created_by: claude:c6244087
created_at: 2026-04-23T15:46:39Z
closed_at: 2026-04-23T16:08:21Z
close_reason: "Phase 2 shipped. text-sizing.ts: 0 env reads (was 4 sites).
  isTextSizingLikelySupported deleted (duplicated Kitty version parse).
  TerminalCaps gained .version field. Fingerprint + probe cache take explicit
  keys; create-app.tsx derives once from caps. 10 new profile.test.ts contract
  tests migrate old heuristic coverage. text-sizing-probe.test.ts rewritten with
  fingerprint API. lint-env-reads: 0 violations. Silvery 4b41d6a6."
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.unicode-plateau.phase-2
    depends_on_id: km-silvery.unicode-plateau
    type: parent-child
    created_at: 2026-04-23T08:46:39Z
    created_by: claude:c6244087
    metadata: "{}"
  - issue_id: km-silvery.unicode-plateau.phase-2
    depends_on_id: km-silvery.unicode-plateau.phase-1
    type: blocks
    created_at: 2026-04-23T08:46:39Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Unicode plateau Phase 2: text-sizing.ts caps-only (no env fallback) @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery/unicode-plateau]], [[@km/silvery/unicode-plateau/phase-1]]

Remove all process.env reads from text-sizing.ts. isTextSizingLikelySupported becomes caps-required. getTerminalFingerprint takes caps-derived program+version. Probe cache keys by fingerprint passed in, not derived from env.

Changes:
  packages/ag-term/src/text-sizing.ts:
    - isTextSizingLikelySupported(caps: Pick<TerminalCaps, 'textSizingSupported'>): boolean — required caps, pass-through (no Kitty version parse — that's profile's job).
    - getTerminalFingerprint(caps: Pick<TerminalCaps, 'program' | 'term'>, env?): string — delete the env fallback path; callers pass caps.
    - getCachedProbeResult(fingerprint: string) + setCachedProbeResult(fingerprint, result) — fingerprint becomes an explicit arg; module owns the Map, callers own the key.
    - detectTextSizingSupport(..., fingerprint: string) — cache lookup uses the passed fingerprint.
    - Delete all process.env reads.
  packages/ag-term/src/runtime/create-app.tsx — compute fingerprint once from capsOption (line ~1006 area); pass through to the helpers.
  tests/text-sizing-probe.test.ts — update to pass explicit caps fixtures + fingerprints.

Duplication deleted: Kitty version parse in text-sizing.ts (was a duplicate of profile.ts:494-500).

/complete criteria:
  rg -n 'process\.env' vendor/silvery/packages/ag-term/src/text-sizing.ts → 0 hits
  rg -n 'TERM_PROGRAM|TERM_PROGRAM_VERSION' vendor/silvery/packages/ag-term/src/text-sizing.ts → 0 hits
  bun run lint + text-sizing-probe.test.ts + related create-app tests pass