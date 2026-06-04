/**
 * ModalOverlay Component
 *
 * Full-screen scrim that centers a modal and dismisses it on an outside click.
 * Wrap a `ModalDialog` (or any modal content) so mouse users can click the
 * dimmed backdrop to close — matching the Esc affordance.
 *
 * It owns the two-Box dance that every modal otherwise hand-rolls:
 *   - an absolutely-positioned, screen-filling backdrop whose `onClick` calls
 *     `onClose` (so a click anywhere outside the dialog body dismisses it), and
 *   - an inner guard Box that `stopPropagation()`s clicks so an empty-space
 *     click INSIDE the dialog does not bubble to the backdrop and close it.
 *
 * `position="absolute"` lifts the overlay out of the surrounding layout flow so
 * it fills the screen + centers regardless of where the modal is mounted in the
 * tree.
 *
 * ```tsx
 * <ModalOverlay onClose={() => setOpen(false)}>
 *   <ModalDialog title="Settings" onClose={() => setOpen(false)}>…</ModalDialog>
 * </ModalOverlay>
 * ```
 */
import React from "react"
import { Box } from "../../components/Box"

export interface ModalOverlayProps {
  /** Called when the backdrop (outside the dialog body) is clicked. */
  onClose?: () => void
  /** The modal content (typically a ModalDialog), centered over the scrim. */
  children: React.ReactNode
}

export function ModalOverlay({ onClose, children }: ModalOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      onClick={() => onClose?.()}
    >
      {/* Inner guard: clicks on the dialog body stop here, so an empty-space
          click inside the dialog never bubbles to the backdrop's onClose.
          Silvery dispatches clicks target→root (DOM-style bubbling). */}
      <Box flexShrink={0} onClick={(event) => event.stopPropagation()}>
        {children}
      </Box>
    </Box>
  )
}
