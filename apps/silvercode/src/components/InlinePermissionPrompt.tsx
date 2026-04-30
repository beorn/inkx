/**
 * InlinePermissionPrompt — renders the FIRST pending permission for the
 * focused session as an interactive bar above the SessionPromptComposer.
 *
 * Replaces the older permission-inbox modal. Permission requests are
 * answered one at a time, in-context: each `requestPermission` call
 * resolves before the next renders. There is no queue, no SelectList of
 * pending entries, no ModalDialog that obscures which tool is being
 * approved.
 *
 * Two variants — match the legacy + ACP shapes the controller surfaces:
 *
 *   - Legacy (no `options` on the permission entry): show tool + args +
 *     compact action chips. `y` calls onApprove, `n` calls onDeny.
 *
 *   - ACP multi-option (`options[]` present): show tool + args + a
 *     <SelectList> of the agent-supplied options. Enter selects the
 *     focused option; `approved` reflects whether the option's `kind` is
 *     allow_once / allow_always (vs reject_once / reject_always).
 *
 * Esc does NOT dismiss the prompt — permissions block the agent and a
 * silent dismiss leaks a hung `requestPermission` JSON-RPC call.
 *
 * Bead: km-silvercode.permission-inline-prompt.
 */
import React, { useEffect, useMemo, useState } from "react"
import { Box, Muted, Text, useHover } from "silvery"
import { useInput } from "silvery/runtime"
import type { PermissionOptionId } from "@km/agent-harness"
import type { SessionHandle } from "../controller.ts"

type PermissionOption = {
  optionId: PermissionOptionId
  name: string
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always"
}

type PendingPermission = {
  sessionId: string
  sessionName: string
  requestId: string
  tool: string
  args: unknown
  /** ACP-style options when the agent supplies them. Empty = legacy binary flow. */
  options: PermissionOption[]
}

export function InlinePermissionPrompt({
  focused,
  sessions,
  onApprove,
  onDeny,
  onSelectOption,
}: {
  /** The focused session — the prompt only surfaces requests for this session. */
  focused?: SessionHandle
  /** All sessions — passed for parity with the old inbox API; only `focused` is used. */
  sessions: SessionHandle[]
  onApprove: (sessionId: string, requestId: string) => void
  onDeny: (sessionId: string, requestId: string) => void
  onSelectOption?: (sessionId: string, requestId: string, optionId: PermissionOptionId, approved: boolean) => void
}): React.ReactElement | null {
  // Subscribe to the focused session's store so we re-render whenever
  // its `permissions` array changes — `useMemo` alone reads at render
  // time and won't catch in-place state updates from the harness.
  // `tick` increments per store-emit; the snapshot below reads the
  // freshest state on every render that follows.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!focused) return
    return focused.store.state.subscribe(() => setTick((t) => t + 1))
  }, [focused])

  // Pull the FIRST pending permission for the focused session. We
  // intentionally ignore other sessions: each pane has its own composer
  // chrome and a permission prompt belongs above the composer of the pane
  // that made the request. Multi-pane permission UX is a follow-up bead.
  const current: PendingPermission | undefined = useMemo(() => {
    if (!focused) return undefined
    const state = focused.store.state.get()
    const first = state.permissions[0]
    if (!first) return undefined
    return {
      sessionId: focused.id,
      sessionName: focused.name,
      requestId: first.requestId,
      tool: first.tool,
      args: first.args,
      options: (first as unknown as { options?: PermissionOption[] }).options ?? [],
    }
    // `sessions` + `tick` together force a recompute on store changes
    // and on session-list changes (e.g. focus switching).
  }, [focused, sessions, tick])

  const [optionCursor, setOptionCursor] = useState(0)

  const optionItems = useMemo(() => current?.options ?? [], [current])

  const isMultiOption = optionItems.length > 0

  // Multi-option mode: Enter is owned by the inner <SelectList> (it fires
  // onSelect on the focused option). We deliberately skip Enter handling
  // here so the option doesn't get dispatched twice. y/n still work as
  // shortcuts for "select the focused option" in multi-option mode.
  useInput(
    (input, _key) => {
      if (!current) return
      if (isMultiOption) {
        if (_key.upArrow) {
          setOptionCursor((i) => Math.max(0, i - 1))
          return
        }
        if (_key.downArrow) {
          setOptionCursor((i) => Math.min(current.options.length - 1, i + 1))
          return
        }
        if (_key.return) {
          selectPermissionOption(current, optionCursor, onSelectOption, onApprove, onDeny)
          setOptionCursor(0)
          return
        }
        if (input === "y" || input === "n") {
          selectPermissionOption(current, optionCursor, onSelectOption, onApprove, onDeny)
          setOptionCursor(0)
        }
        return
      }
      // Legacy binary flow.
      if (input === "y") onApprove(current.sessionId, current.requestId)
      else if (input === "n") onDeny(current.sessionId, current.requestId)
      // No-op on key.return here too — useInput passes through to other
      // handlers, but legacy mode has no Enter binding (intentional;
      // submit must be explicit y/n).
    },
    { isActive: !!current },
  )

  if (!current) return null

  const argSummary = summarizeArgs(current.args)

  return (
    <Box flexDirection="row" width="100%" alignSelf="stretch">
      <Box width={1} flexShrink={0} backgroundColor="$warning" />
      <Box
        flexDirection="column"
        flexGrow={1}
        minWidth={0}
        backgroundColor="$bg-surface-subtle"
        paddingX={2}
        paddingY={1}
        gap={1}
      >
        <Box flexDirection="row" gap={1}>
          <Text>Allow</Text>
          <Text bold>{permissionAction(current.tool)}?</Text>
        </Box>

        {argSummary.length > 0 && (
          <Box flexDirection="row" gap={1}>
            {current.tool === "Bash" ? <Text color="$muted">$</Text> : null}
            <Text wrap="wrap">{argSummary}</Text>
          </Box>
        )}

        {isMultiOption ? (
          <Box flexDirection="column" gap={0}>
            {optionItems.map((opt, i) => (
              <ActionButton
                key={opt.optionId}
                active={i === optionCursor}
                label={opt.name}
                tone={isApproveKind(opt.kind) ? "allow" : "deny"}
                onClick={() => {
                  setOptionCursor(i)
                  selectPermissionOption(current, i, onSelectOption, onApprove, onDeny)
                }}
              />
            ))}
            <Muted>↑/↓ select</Muted>
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            <ActionButton label="Yes" tone="allow" onClick={() => onApprove(current.sessionId, current.requestId)} />
            <ActionButton label="No" tone="deny" onClick={() => onDeny(current.sessionId, current.requestId)} />
          </Box>
        )}
      </Box>
    </Box>
  )
}

function isApproveKind(kind: PermissionOption["kind"]): boolean {
  return kind === "allow_once" || kind === "allow_always"
}

function selectPermissionOption(
  current: PendingPermission,
  optionCursor: number,
  onSelectOption: InlinePermissionPromptProps["onSelectOption"],
  onApprove: InlinePermissionPromptProps["onApprove"],
  onDeny: InlinePermissionPromptProps["onDeny"],
): void {
  const opt = current.options[optionCursor]
  if (!opt) return
  const approved = isApproveKind(opt.kind)
  if (onSelectOption) {
    onSelectOption(current.sessionId, current.requestId, opt.optionId, approved)
  } else if (approved) {
    onApprove(current.sessionId, current.requestId)
  } else {
    onDeny(current.sessionId, current.requestId)
  }
}

type InlinePermissionPromptProps = {
  onApprove: (sessionId: string, requestId: string) => void
  onDeny: (sessionId: string, requestId: string) => void
  onSelectOption?: (sessionId: string, requestId: string, optionId: PermissionOptionId, approved: boolean) => void
}

function permissionAction(tool: string): string {
  return tool === "Bash" ? "Run bash" : `Use ${tool}`
}

function ActionButton({
  active,
  label,
  onClick,
}: {
  active?: boolean
  label: string
  tone: "allow" | "deny"
  onClick: () => void
}): React.ReactElement {
  const hover = useHover()
  const armed = active === true || hover.isHovered
  const bg = armed ? "$warning" : "$bg-inverse"
  const labelColor = armed ? "$bg" : "$fg-on-inverse"
  return (
    <Box
      flexDirection="row"
      backgroundColor={bg}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      onClick={onClick}
    >
      <Text color={labelColor}> {label} </Text>
    </Box>
  )
}

/**
 * Render the args as a compact one-line preview. JSON-stringify is used
 * for unknown shapes; a few common tool shapes (Bash command, Edit/Write
 * file_path) get a friendlier rendering.
 *
 * Kept to a single short line — the prompt is meant to be scannable, not
 * a debugger. If the user needs to see the full args, the agent's own
 * tool-call surface in the message stream shows them in full.
 */
function summarizeArgs(args: unknown): string {
  if (args === null || args === undefined) return ""
  if (typeof args !== "object") return String(args)
  const obj = args as Record<string, unknown>
  if (typeof obj.command === "string") return obj.command
  if (typeof obj.file_path === "string") return obj.file_path as string
  try {
    const json = JSON.stringify(args)
    return json.length > 200 ? `${json.slice(0, 197)}...` : json
  } catch {
    return ""
  }
}
