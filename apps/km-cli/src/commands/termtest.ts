/**
 * Terminal Capability Test (CLI wrapper)
 *
 * Delegates to silvery's runTermtest() for the actual test output.
 *
 *   bun km termtest              # all sections
 *   bun km termtest emoji        # emoji width alignment only
 *   bun km termtest colors sgr   # specific sections
 */

import { Command } from "@commander-js/extra-typings"
import { runTermtest, TERMTEST_SECTIONS, type TermtestSection } from "@silvery/ag-react"

export const termtestCommand = new Command("termtest")
  .description("Visual terminal capability test — run in any terminal to verify feature support")
  .argument("[sections...]", `Sections to show: ${TERMTEST_SECTIONS.join(", ")}`)
  .action((sections: string[]) => {
    const valid = sections.filter((s): s is TermtestSection => (TERMTEST_SECTIONS as readonly string[]).includes(s))
    if (sections.length > 0 && valid.length === 0) {
      console.error(`Unknown section(s): ${sections.join(", ")}`)
      console.error(`Available: ${TERMTEST_SECTIONS.join(", ")}`)
      process.exitCode = 1
      return
    }
    runTermtest({ sections: valid.length > 0 ? valid : undefined })
  })
