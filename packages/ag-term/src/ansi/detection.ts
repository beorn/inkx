// Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
// `detectColor` and `detectTerminalCaps` are removed — callers consume
// `term.caps` / `term.profile` when a Term is in scope, or call
// `createTerminalProfile()` / `probeTerminalProfile()` one-shot.
//
// Post km-silvery.unicode-plateau Phase 1 (2026-04-23): `detectUnicode` and
// `detectExtendedUnderline` are removed too — their logic moved into the
// profile factory. Consumers read `caps.unicode` / `caps.underlineStyles`
// / `caps.underlineColor` directly.
//
// Post km-silvery.unicode-plateau Phase 3 (2026-04-23): `detectCursor` is
// also gone — its "stdout.isTTY + TERM !== 'dumb'" gate lives on
// `caps.cursor`.
//
// Post km-silvery.unicode-plateau Phase 4 (2026-04-23): `detectInput` is
// also absorbed — its "stdin.isTTY + setRawMode" gate lives on
// `caps.input`, derived from the optional `stdin` argument on
// `createTerminalProfile`. The profile factory is now the single
// detection entry point for every TerminalCaps field.
export { defaultCaps, createTerminalProfile, probeTerminalProfile } from "@silvery/ansi"
export type {
  TerminalCaps,
  TerminalNotificationProtocol,
  TerminalProfile,
  ColorProvenance,
  CapabilityDecisionChannel,
  TerminalCapabilityProvenance,
  TerminalProfileStdout,
  CreateTerminalProfileOptions,
  ProbeTerminalProfileOptions,
} from "@silvery/ansi"

export {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "@silvery/ansi"
export type { BgModeDetector, BgModeDetectorOptions, BgMode } from "@silvery/ansi"
