import React, { Fragment } from "react"
import { Box } from "../../components/Box"
import { H3, Kbd, Muted } from "./Typography"
import { ModalDialog, type ModalDialogProps } from "./ModalDialog"

export interface ShortcutHelpRow {
  readonly keys: readonly string[]
  readonly action: string
}

export interface ShortcutHelpSection {
  readonly title: string
  readonly rows: readonly ShortcutHelpRow[]
}

export interface ShortcutHelpDialogProps extends Omit<ModalDialogProps, "children"> {
  readonly sections: readonly ShortcutHelpSection[]
  /** Width reserved for shortcut badges before the action text. */
  readonly keyColumnWidth?: number
}

/**
 * Shared presentation for shortcut help. Apps own the command registry and
 * modal scope; this component renders that registry without inventing another
 * input or keymap system.
 */
export function ShortcutHelpDialog({
  sections,
  keyColumnWidth = 24,
  width = 72,
  ...dialogProps
}: ShortcutHelpDialogProps): React.ReactElement {
  return (
    <ModalDialog width={width} {...dialogProps}>
      <Box flexDirection="column" paddingX={1}>
        {sections.map((section, sectionIndex) => (
          <Box key={section.title} flexDirection="column" marginTop={sectionIndex === 0 ? 0 : 1}>
            <H3>{section.title}</H3>
            {section.rows.map((row) => (
              <Box key={`${row.keys.join("+")}:${row.action}`} flexDirection="row">
                <Box width={keyColumnWidth} flexShrink={0} flexDirection="row">
                  {row.keys.map((key, keyIndex) => (
                    <Fragment key={key}>
                      {keyIndex === 0 ? null : <Muted> / </Muted>}
                      <Kbd>{key}</Kbd>
                    </Fragment>
                  ))}
                </Box>
                <Box flexGrow={1} minWidth={0}>
                  <Muted wrap="wrap">{row.action}</Muted>
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </ModalDialog>
  )
}
