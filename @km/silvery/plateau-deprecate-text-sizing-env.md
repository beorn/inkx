---
mentions:
  - km
id: "@km/silvery/plateau-deprecate-text-sizing-env"
aliases:
  - km-silvery.plateau-deprecate-text-sizing-env
  - km-silvery-plateau-deprecate-text-sizing-env
created_by: claude:c6244087
created_at: 2026-04-23T10:11:56Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.plateau-deprecate-text-sizing-env
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T03:11:55Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Deprecate text-sizing.ts env fallback — route through TerminalCaps @km/silvery #task #P4

blocks:: [[@km/silvery]]

Follow-up from @km/silvery/plateau-env-read-lint.

isTextSizingLikelySupported(caps?) accepts caps but has a documented
env fallback that reads TERM_PROGRAM + TERM_PROGRAM_VERSION directly.
The fallback uses a LOOSER heuristic than profile.ts (program==="kitty"
vs canonical term==="xterm-kitty" + version parse). Tests in
tests/text-sizing-probe.test.ts pin the looser semantics, which is why
the file is allowlisted in scripts/lint-env-reads.ts.

Only one caller (create-app.tsx:1006) passes caps; but the signature
leaves the fallback reachable. After 1.0, tighten:

1. Make caps required on isTextSizingLikelySupported.
2. Delete the env fallback.
3. Update tests/text-sizing-probe to pass caps fixtures instead of
   setting process.env.TERM_PROGRAM.
4. Remove text-sizing.ts from scripts/lint-env-reads.ts allowlist.

Also check getTerminalFingerprint (same file, cache keying for
detectTextSizingSupport probe results) — its env reads could be
derived from caps + an optional version field.

