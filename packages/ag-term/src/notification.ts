import { Buffer } from "node:buffer"
import type {
  NotificationCapabilities,
  NotificationDelivery,
  NotificationReply,
  NotificationRequest,
  NotificationTarget,
  SentNotificationDelivery,
} from "@silvery/ag/notification"
import type { TerminalNotificationProtocol } from "@silvery/ansi"
import type { Term } from "./ansi/term"

const ESC = "\x1b"
const BEL = "\x07"
const ST = `${ESC}\\`
const DEFAULT_REPLY_TIMEOUT_MS = 30_000

export interface TerminalNotificationCapabilities extends NotificationCapabilities {
  readonly protocol: TerminalNotificationProtocol | false
}

export type TerminalNotificationDelivery =
  | (SentNotificationDelivery & { readonly protocol: TerminalNotificationProtocol })
  | Exclude<NotificationDelivery, SentNotificationDelivery>

export interface TerminalNotificationTarget extends NotificationTarget {
  readonly capabilities: TerminalNotificationCapabilities
  emit(request: NotificationRequest): TerminalNotificationDelivery
}

export interface TerminalNotificationTargetOptions {
  /** Maximum time to await an OSC 99 activation reply. */
  readonly replyTimeoutMs?: number
}

type NotificationTerm = Pick<Term, "caps" | "input" | "write">

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64")
}

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0)
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}

function legacyText(text: string, delimiterSafe = false): string {
  const withoutControls = Array.from(text, (character) =>
    isControlCharacter(character) ? " " : character,
  ).join("")
  const withoutDelimiters = delimiterSafe ? withoutControls.replaceAll(";", ",") : withoutControls
  return withoutDelimiters.replace(/\s+/g, " ").trim()
}

function kittyIdentifier(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  if (id.length > 128 || /[:;]/.test(id) || Array.from(id).some(isControlCharacter)) {
    throw new TypeError("OSC 99 notification ids must be at most 128 delimiter-safe characters")
  }
  return id
}

function kittyChunk(
  id: string | undefined,
  payload: "title" | "body" | "buttons",
  value: string,
  done: boolean,
  report = false,
): string {
  const metadata = [
    id === undefined ? undefined : `i=${id}`,
    `d=${done ? 1 : 0}`,
    "e=1",
    `p=${payload}`,
    report ? "a=report" : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(":")
  return `${ESC}]99;${metadata};${base64(value)}${ST}`
}

function encodeKitty(request: NotificationRequest): string {
  const id = kittyIdentifier(request.id)
  const actions = request.actions ?? []
  const chunks: string[] = []
  if (request.title) {
    chunks.push(kittyChunk(id, "title", request.title, false))
  }
  chunks.push(kittyChunk(id, "body", request.body, actions.length === 0, request.report === true))
  if (actions.length > 0) {
    chunks.push(
      kittyChunk(id, "buttons", actions.map((action) => action.label).join("\u2028"), true, true),
    )
  }
  return chunks.join("")
}

function encodeLegacy(protocol: "osc9" | "osc777", request: NotificationRequest): string {
  if (protocol === "osc9") {
    return `${ESC}]9;${legacyText(request.body)}${BEL}`
  }
  return `${ESC}]777;notify;${legacyText(request.title ?? "", true)};${legacyText(request.body, true)}${BEL}`
}

function parseKittyReply(
  input: string,
  id: string,
  actions: readonly { readonly id: string }[],
): { result: NotificationReply; consumed: number } | null {
  const prefix = `${ESC}]99;i=${id};`
  const start = input.indexOf(prefix)
  if (start < 0) return null
  const payloadStart = start + prefix.length
  const stEnd = input.indexOf(ST, payloadStart)
  const belEnd = input.indexOf(BEL, payloadStart)
  const usesSt = stEnd >= 0 && (belEnd < 0 || stEnd < belEnd)
  const payloadEnd = usesSt ? stEnd : belEnd
  if (payloadEnd < 0) return null

  const payload = input.slice(payloadStart, payloadEnd)
  if (payload !== "" && !/^\d+$/.test(payload)) return null
  const button = Number.parseInt(payload, 10)
  const actionId = Number.isInteger(button) && button > 0 ? actions[button - 1]?.id : undefined
  return {
    result: actionId === undefined ? { type: "activated" } : { type: "activated", actionId },
    consumed: payloadEnd + (usesSt ? ST.length : BEL.length),
  }
}

/**
 * Bind the cross-target notification contract to a Term's proven protocol and
 * owned I/O. No environment inspection or fallback transport occurs here.
 */
export function createTerminalNotificationTarget(
  term: NotificationTerm,
  options: TerminalNotificationTargetOptions = {},
): TerminalNotificationTarget {
  const protocol = term.caps.notifications
  const input = protocol === "osc99" ? term.input : undefined
  const replies = protocol === "osc99" && term.caps.input && input?.active === true
  const capabilities: TerminalNotificationCapabilities = {
    notifications: protocol !== false,
    actions: replies,
    replies,
    protocol,
  }

  return {
    capabilities,
    emit(request) {
      if (protocol === false) {
        return { status: "unsupported", reason: "notifications" }
      }
      if (request.actions?.length && !capabilities.actions) {
        return { status: "unsupported", reason: "actions" }
      }
      const wantsReply = request.report === true || Boolean(request.actions?.length)
      if (wantsReply && (!capabilities.replies || !input)) {
        return { status: "unsupported", reason: "replies" }
      }

      const sequence = protocol === "osc99" ? encodeKitty(request) : encodeLegacy(protocol, request)
      if (!wantsReply) {
        term.write(sequence)
        return { status: "sent", protocol }
      }

      const id = request.id
      if (!id) throw new TypeError("OSC 99 replies require a notification id")
      if (!input) throw new Error("OSC 99 reply capability lost its input owner")
      const reply = input.probe({
        query: sequence,
        parse: (received) => parseKittyReply(received, id, request.actions ?? []),
        timeoutMs: options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS,
      })
      return { status: "sent", protocol, reply }
    },
  }
}
