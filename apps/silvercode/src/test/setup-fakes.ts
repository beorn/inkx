/**
 * Vitest setup for silvercode visual tests.
 *
 * Loaded BEFORE any test file (and therefore before App / SidePanel are
 * imported). Sets env-var fakes for boundaries that probe at MODULE load:
 *
 *   - claude-version: SidePanel does `const X = probeClaudeVersion()` at
 *     top-level so the override must be in place before its import.
 *
 * Per-test factory injection (account, branch override, fs root) flows
 * through `installFakes()` from `render-harness.tsx` — those are checked
 * lazily so they can be set after module load. We also `setAccountFactoryOverride`
 * to a default healthy probe so any test that mounts the SidePanel without
 * going through the harness still gets deterministic quota rendering.
 *
 * `SILVERCODE_REAL=1` opts every default out — the live-mode contract
 * tests (`km-silvercode.test-live-mode`) want real boundaries.
 *
 * Production never loads this file; it's only referenced from the
 * silvercode visual vitest projects.
 */

import { afterEach } from "vitest"
import { setAccountFactoryOverride } from "../claude-account.ts"
import { setGitFactoryOverride } from "../git-branch.ts"
import { setVersionFactoryOverride } from "../claude-version.ts"
import { defaultQuotas, fakeAccountFactory } from "./fake-boundaries.ts"

const REAL_MODE = process.env.SILVERCODE_REAL === "1"

if (!REAL_MODE) {
  if (!process.env.SILVERCODE_FAKE_CLAUDE_VERSION) {
    process.env.SILVERCODE_FAKE_CLAUDE_VERSION = "2.1.119"
  }
  if (!process.env.SILVERCODE_FAKE_BRANCH) {
    process.env.SILVERCODE_FAKE_BRANCH = "main"
  }
  setAccountFactoryOverride(fakeAccountFactory({ quotas: defaultQuotas() }))
}

afterEach(() => {
  // Restore defaults so a misbehaving test can't leak fakes into the next
  // one. Tests that need a custom override re-install it on each run.
  if (!REAL_MODE) {
    setAccountFactoryOverride(fakeAccountFactory({ quotas: defaultQuotas() }))
    setGitFactoryOverride(null) // env var fallback applies
    setVersionFactoryOverride(null)
  }
})
