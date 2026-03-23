/**
 * useDialogInput — Safe dialog text input hook.
 *
 * Combines useEditContext (text editing) with dialogTargetRef (Enter/Escape routing).
 * Prevents the auto-save-on-unmount double-fire bug (km-qaco9) by:
 *
 * 1. Never passing onConfirm/onCancel to useEditContext
 * 2. Setting cancelledRef via editTarget.cancel() before calling dialog callbacks
 *
 * ALL dialog components MUST use this hook instead of useEditContext directly.
 * useEditContext has an auto-save-on-unmount that fires onConfirm when the
 * component unmounts if cancelledRef is not set — this causes double-confirm
 * bugs when dialogs close.
 */
import React from "react"
import { useEditContext, type UseEditContextResult } from "@silvery/ag-react"
import { dialogTargetRef } from "../dialog-target.ts"

export interface UseDialogInputOptions {
  /** Initial text value */
  initialValue?: string
  /** Called when value changes (every keystroke) */
  onChange?: (value: string) => void
  /** Called when Enter is pressed (dialog confirm). Receives current text. */
  onConfirm?: (value: string) => void
  /** Called when Escape is pressed (dialog cancel) */
  onCancel?: () => void
  /** Called when arrow up is pressed */
  navUp?: () => void
  /** Called when arrow down is pressed */
  navDown?: () => void
}

export function useDialogInput({
  initialValue,
  onChange,
  onConfirm,
  onCancel,
  navUp,
  navDown,
}: UseDialogInputOptions): UseEditContextResult {
  // Text editing — NEVER pass onConfirm/onCancel here.
  // useEditContext's auto-save-on-unmount would fire them again on close.
  const editCtx = useEditContext({
    initialValue,
    onChange,
  })

  // Stable refs for callbacks (avoids stale closures in useLayoutEffect)
  const onConfirmRef = React.useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const navUpRef = React.useRef(navUp)
  navUpRef.current = navUp
  const navDownRef = React.useRef(navDown)
  navDownRef.current = navDown

  // Wire dialogTargetRef for command system (Enter/Escape/arrows)
  React.useLayoutEffect(() => {
    dialogTargetRef.current = {
      navUp() {
        navUpRef.current?.()
      },
      navDown() {
        navDownRef.current?.()
      },
      confirm() {
        const value = editCtx.target.getContent()
        editCtx.target.cancel() // Set cancelledRef — prevents auto-save on unmount
        onConfirmRef.current?.(value)
      },
      cancel() {
        editCtx.target.cancel() // Set cancelledRef — prevents auto-save on unmount
        onCancelRef.current?.()
      },
    }
    return () => {
      dialogTargetRef.current = null
    }
  }, [editCtx.target])

  return editCtx
}
