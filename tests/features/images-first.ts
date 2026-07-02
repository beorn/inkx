/**
 * Enable Kitty graphics before the framework module graph loads.
 *
 * Image transmission is gated on SILVERY_KITTY_GRAPHICS (or an explicit
 * kittyGraphics option); without it every image test silently transmits
 * NOTHING and asserts on absence. Local shells often export the flag
 * (Ghostty), CI runners never do — import this FIRST from any test whose
 * assertions are meaningless without image output. Side-effect IMPORT, not a
 * bare statement: ESM hoists imports (same pattern as strict-first.ts).
 */
process.env.SILVERY_KITTY_GRAPHICS = "1"
