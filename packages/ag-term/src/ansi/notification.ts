/** Terminal-owned desktop notification emission. */

import { Buffer } from "node:buffer"
import type { TerminalCaps, TerminalNotificationProtocol } from "@silvery/ansi"

const ESC = "\x1b"
const BEL = "\x07"
const ST = `${ESC}\\`
const KITTY_ENCODED_CHUNK_SIZE = 4096

/** Internal marker for synthetic streams that cannot deliver notifications. */
export const NOTIFICATION_WRITER_AVAILABLE: unique symbol = Symbol(
  "silvery.notification-writer-available",
)

export type NotificationUrgency = "low" | "normal" | "critical"

/** Protocol-neutral notification data accepted by a Term. */
export interface NotificationRequest {
  /** Stable identifier used by protocols that support replacement. */
  readonly id?: string
  readonly title?: string
  readonly body: string
  readonly urgency?: NotificationUrgency
}

export type NotificationDelivery =
  | { readonly status: "emitted"; readonly protocol: TerminalNotificationProtocol }
  | { readonly status: "unsupported"; readonly reason: "notifications" }

type Notify = (request: NotificationRequest) => NotificationDelivery

/**
 * Bind notification emission to a Term's proven capability and owned writer.
 * Internal: callers use the single public `term.notify(request)` entry.
 */
export function createNotificationEmitter(
  caps: Pick<TerminalCaps, "notifications">,
  write?: (data: string) => void,
): Notify {
  return (request) => {
    const protocol = caps.notifications
    if (protocol === false || write === undefined) {
      return { status: "unsupported", reason: "notifications" }
    }

    const sequence =
      protocol === "osc99"
        ? encodeOsc99(request)
        : protocol === "osc777"
          ? encodeOsc777(request)
          : encodeOsc9(request)
    write(sequence)
    return { status: "emitted", protocol }
  }
}

const KITTY_URGENCY: Record<NotificationUrgency, 0 | 1 | 2> = {
  low: 0,
  normal: 1,
  critical: 2,
}

function legacyText(text: string, delimiterSafe = false): string {
  const withoutControls = Array.from(text, (character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character
  }).join("")
  const withoutDelimiters = delimiterSafe ? withoutControls.replaceAll(";", ",") : withoutControls
  return withoutDelimiters.replace(/\s+/g, " ").trim()
}

function encodeOsc9(request: NotificationRequest): string {
  return `${ESC}]9;${legacyText(request.body)}${BEL}`
}

function encodeOsc777(request: NotificationRequest): string {
  const title = legacyText(request.title ?? "", true)
  const body = legacyText(request.body, true)
  return `${ESC}]777;notify;${title};${body}${BEL}`
}

function kittyIdentifier(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  if (id === "0" || !/^[A-Za-z0-9_.+-]+$/.test(id)) {
    throw new TypeError(
      "OSC 99 notification ids may contain only A-Z, a-z, 0-9, _, -, +, and .; id 0 is reserved",
    )
  }
  return id
}

function encodedChunks(text: string): readonly string[] {
  const encoded = Buffer.from(text, "utf8").toString("base64")
  if (encoded.length === 0) return [""]
  const chunks: string[] = []
  for (let offset = 0; offset < encoded.length; offset += KITTY_ENCODED_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + KITTY_ENCODED_CHUNK_SIZE))
  }
  return chunks
}

function encodeKittyPayload(
  request: NotificationRequest,
  payload: "title" | "body",
  doneAfterPayload: boolean,
): string {
  const id = kittyIdentifier(request.id)
  const chunks = encodedChunks(payload === "title" ? (request.title ?? "") : request.body)
  if (chunks.length > 1 && id === undefined) {
    throw new TypeError("Chunked OSC 99 notifications require a request id")
  }

  return chunks
    .map((chunk, index) => {
      const done = doneAfterPayload && index === chunks.length - 1
      const metadata = [
        id === undefined ? undefined : `i=${id}`,
        `d=${done ? 1 : 0}`,
        "e=1",
        `p=${payload}`,
        request.urgency === undefined ? undefined : `u=${KITTY_URGENCY[request.urgency]}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(":")
      return `${ESC}]99;${metadata};${chunk}${ST}`
    })
    .join("")
}

function encodeOsc99(request: NotificationRequest): string {
  const title = request.title === undefined ? "" : encodeKittyPayload(request, "title", false)
  return title + encodeKittyPayload(request, "body", true)
}
