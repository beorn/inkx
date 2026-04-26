/**
 * SlashCommandPalette — open with a query.
 *
 * Demonstrates the inline popover above the composer when the user types
 * a slash. The story varies the query text to exercise filter + empty
 * states. (Empty result yields `null`, which the runner treats as a
 * blank canvas — useful for verifying the no-match branch.)
 */
import React from "react"
import { SlashCommandPalette } from "../../src/components/SlashCommandPalette.tsx"
import type { Story } from "../types.ts"

const REMOTE = ["help", "model", "compact", "init", "memory"] as const

export const slashCommandPaletteOpen: Story = {
  id: "SlashCommandPalette/open",
  component: "SlashCommandPalette",
  variant: "open",
  description: "Slash-command popover with an active query.",
  knobs: [
    {
      kind: "select",
      id: "query",
      label: "Query",
      options: ["empty", "/", "/h", "/zzz"],
      default: "/",
    },
  ],
  render(knobs) {
    const raw = knobs.query as string
    const query = raw === "empty" ? "" : raw
    return <SlashCommandPalette query={query} remoteCommands={REMOTE} onSubmit={() => {}} onClose={() => {}} />
  },
}
