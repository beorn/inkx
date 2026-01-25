/**
 * RFC 5545 (iCalendar) and RFC 6350 (vCard) Constants
 *
 * Single source of truth for status values used in both
 * runtime validation and TypeScript types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// RFC 5545 - iCalendar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VEVENT STATUS property values (RFC 5545 Section 3.8.1.11)
 */
export const EVENT_STATUSES = ["TENTATIVE", "CONFIRMED", "CANCELLED"] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

/**
 * ATTENDEE PARTSTAT parameter values (RFC 5545 Section 3.2.12)
 */
export const ATTENDEE_STATUSES = [
  "NEEDS-ACTION",
  "ACCEPTED",
  "DECLINED",
  "TENTATIVE",
] as const
export type AttendeeStatus = (typeof ATTENDEE_STATUSES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// RFC 6350 - vCard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EMAIL TYPE parameter values (RFC 6350 Section 6.4.2)
 */
export const EMAIL_TYPES = ["home", "work", "other"] as const
export type EmailType = (typeof EMAIL_TYPES)[number]

/**
 * TEL TYPE parameter values (RFC 6350 Section 6.4.1)
 */
export const PHONE_TYPES = ["home", "work", "cell", "fax", "other"] as const
export type PhoneType = (typeof PHONE_TYPES)[number]

/**
 * ADR TYPE parameter values (RFC 6350 Section 6.3.1)
 */
export const ADDRESS_TYPES = ["home", "work", "other"] as const
export type AddressType = (typeof ADDRESS_TYPES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards / Validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and narrow a string to EventStatus
 */
export function parseEventStatus(
  v: string | undefined,
): EventStatus | undefined {
  return v && EVENT_STATUSES.includes(v as EventStatus)
    ? (v as EventStatus)
    : undefined
}

/**
 * Validate and narrow a string to AttendeeStatus
 */
export function parseAttendeeStatus(
  v: string | undefined,
): AttendeeStatus | undefined {
  return v && ATTENDEE_STATUSES.includes(v as AttendeeStatus)
    ? (v as AttendeeStatus)
    : undefined
}

/**
 * Validate and narrow a string to EmailType
 */
export function parseEmailType(v: string | undefined): EmailType | undefined {
  return v && EMAIL_TYPES.includes(v as EmailType)
    ? (v as EmailType)
    : undefined
}

/**
 * Validate and narrow a string to PhoneType
 */
export function parsePhoneType(v: string | undefined): PhoneType | undefined {
  return v && PHONE_TYPES.includes(v as PhoneType)
    ? (v as PhoneType)
    : undefined
}

/**
 * Validate and narrow a string to AddressType
 */
export function parseAddressType(
  v: string | undefined,
): AddressType | undefined {
  return v && ADDRESS_TYPES.includes(v as AddressType)
    ? (v as AddressType)
    : undefined
}
