/**
 * vCard Parser/Formatter
 *
 * Parse and format vCard (.vcf) data.
 * Implements RFC 6350 (vCard 4.0) with RFC 2426 (vCard 3.0) compatibility.
 */

import type {
  Contact,
  ContactEmail,
  ContactPhone,
  ContactAddress,
} from "./types.ts"
import {
  parseEmailType,
  parsePhoneType,
  parseAddressType,
} from "./constants.ts"

// --- Parsing Helpers ---

/** Split a vCard line into params string and value */
function splitLine(line: string): { paramStr: string; value: string } {
  const colonIndex = line.lastIndexOf(":")
  if (colonIndex < 0) return { paramStr: "", value: line }
  return {
    paramStr: line.slice(0, colonIndex),
    value: line.slice(colonIndex + 1),
  }
}

/** Extract TYPE parameter from param string */
function extractType(paramStr: string): string | undefined {
  const match = paramStr.match(/TYPE=([^;:,]+)/i)
  return match?.[1]?.toLowerCase()
}

/** Check if param string contains PREF marker */
function isPrimary(paramStr: string): boolean {
  return paramStr.toLowerCase().includes("pref")
}

/** Parse all matches of a property into items */
function parseMultiProperty<T>(
  unfolded: string,
  propName: string,
  parser: (paramStr: string, value: string) => T | null,
): T[] {
  const regex = new RegExp(`^${propName}[;:](.*)$`, "gim")
  const items: T[] = []
  let match
  while ((match = regex.exec(unfolded)) !== null) {
    const { paramStr, value } = splitLine(match[1] || "")
    const item = parser(paramStr, value)
    if (item) items.push(item)
  }
  return items
}

/** Parse a single email entry */
function parseEmail(paramStr: string, value: string): ContactEmail | null {
  if (!value) return null
  return {
    value: value.trim(),
    type: parseEmailType(extractType(paramStr)),
    primary: isPrimary(paramStr),
  }
}

/** Parse a single phone entry */
function parsePhone(paramStr: string, value: string): ContactPhone | null {
  if (!value) return null
  return {
    value: value.trim(),
    type: parsePhoneType(extractType(paramStr)),
    primary: isPrimary(paramStr),
  }
}

/** Parse a single address entry (ADR format: PO Box;Extended;Street;City;Region;Postal;Country) */
function parseAddress(paramStr: string, value: string): ContactAddress {
  const parts = value.split(";")
  return {
    type: parseAddressType(extractType(paramStr)),
    street: parts[2] || undefined,
    city: parts[3] || undefined,
    region: parts[4] || undefined,
    postalCode: parts[5] || undefined,
    country: parts[6] || undefined,
  }
}

/** Parse structured name (N property) */
function parseName(n: string): Contact["name"] {
  const parts = n.split(";")
  return {
    family: parts[0] || undefined,
    given: parts[1] || undefined,
    middle: parts[2] || undefined,
    prefix: parts[3] || undefined,
    suffix: parts[4] || undefined,
  }
}

/**
 * Parse vCard data to Contact
 */
export function parseVCard(vcard: string): Contact | null {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, "")
  const getValue = createValueGetter(unfolded)

  const uid = getValue("UID")
  const fn = getValue("FN")
  if (!uid || !fn) return null

  const contact: Contact = { uid, fullName: fn }

  // Structured name
  const n = getValue("N")
  if (n) contact.name = parseName(n)

  // Multi-value properties
  const emails = parseMultiProperty(unfolded, "EMAIL", parseEmail)
  if (emails.length > 0) contact.emails = emails

  const phones = parseMultiProperty(unfolded, "TEL", parsePhone)
  if (phones.length > 0) contact.phones = phones

  const addresses = parseMultiProperty(unfolded, "ADR", parseAddress)
  if (addresses.length > 0) contact.addresses = addresses

  // Simple properties
  contact.org = getValue("ORG")
  contact.title = getValue("TITLE")
  contact.birthday = getValue("BDAY")
  contact.note = getValue("NOTE")

  // Photo
  const photoLine = getPropertyLine(unfolded, "PHOTO")
  if (photoLine) contact.photo = splitLine(photoLine).value

  return contact
}

/** Create a getValue function for extracting simple properties */
function createValueGetter(unfolded: string) {
  return (name: string): string | undefined => {
    const regex = new RegExp(`^${name}[;:](.*)$`, "im")
    const match = unfolded.match(regex)
    if (!match) return undefined
    const parts = match[1]?.split(":")
    return parts?.[parts.length - 1]?.trim()
  }
}

/** Get raw property line content (after property name) */
function getPropertyLine(unfolded: string, name: string): string | undefined {
  const regex = new RegExp(`^${name}([;:].*)$`, "im")
  const match = unfolded.match(regex)
  return match?.[1]
}

// --- Formatting Helpers ---

/** Format type and pref parameters */
function formatTypeParams(type?: string, primary?: boolean): string {
  const typeParam = type ? `;TYPE=${type.toUpperCase()}` : ""
  const prefParam = primary ? ";PREF=1" : ""
  return `${typeParam}${prefParam}`
}

/** Format structured name */
function formatName(name: Contact["name"]): string {
  if (!name) return ""
  return [
    name.family || "",
    name.given || "",
    name.middle || "",
    name.prefix || "",
    name.suffix || "",
  ].join(";")
}

/** Format email to vCard line */
function formatEmail(email: ContactEmail): string {
  return `EMAIL${formatTypeParams(email.type, email.primary)}:${email.value}`
}

/** Format phone to vCard line */
function formatPhone(phone: ContactPhone): string {
  return `TEL${formatTypeParams(phone.type, phone.primary)}:${phone.value}`
}

/** Format address to vCard line */
function formatAddress(addr: ContactAddress): string {
  const typeParam = addr.type ? `;TYPE=${addr.type.toUpperCase()}` : ""
  const value = [
    "", // PO Box
    "", // Extended
    addr.street || "",
    addr.city || "",
    addr.region || "",
    addr.postalCode || "",
    addr.country || "",
  ].join(";")
  return `ADR${typeParam}:${value}`
}

/** Format photo to vCard line */
function formatPhoto(photo: string): string {
  if (photo.startsWith("http")) return `PHOTO:${photo}`
  return `PHOTO:data:image/jpeg;base64,${photo}`
}

/**
 * Format Contact to vCard
 */
export function formatVCard(contact: Contact): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `UID:${contact.uid}`,
    `FN:${escapeValue(contact.fullName)}`,
  ]

  if (contact.name) lines.push(`N:${formatName(contact.name)}`)

  contact.emails?.forEach((e) => lines.push(formatEmail(e)))
  contact.phones?.forEach((p) => lines.push(formatPhone(p)))
  contact.addresses?.forEach((a) => lines.push(formatAddress(a)))

  if (contact.org) lines.push(`ORG:${escapeValue(contact.org)}`)
  if (contact.title) lines.push(`TITLE:${escapeValue(contact.title)}`)
  if (contact.birthday) lines.push(`BDAY:${contact.birthday}`)
  if (contact.note) lines.push(`NOTE:${escapeValue(contact.note)}`)
  if (contact.photo) lines.push(formatPhoto(contact.photo))

  lines.push("END:VCARD")
  return lines.join("\r\n")
}

/**
 * Escape special characters in vCard values
 */
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}
