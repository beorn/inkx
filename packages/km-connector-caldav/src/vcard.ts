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

// Type validators - ensure parsed values are valid union members
const emailTypes = ["home", "work", "other"] as const
const phoneTypes = ["home", "work", "cell", "fax", "other"] as const
const addressTypes = ["home", "work", "other"] as const

function parseEmailType(v: string | undefined): ContactEmail["type"] {
  return v && emailTypes.includes(v as (typeof emailTypes)[number])
    ? (v as ContactEmail["type"])
    : undefined
}

function parsePhoneType(v: string | undefined): ContactPhone["type"] {
  return v && phoneTypes.includes(v as (typeof phoneTypes)[number])
    ? (v as ContactPhone["type"])
    : undefined
}

function parseAddressType(v: string | undefined): ContactAddress["type"] {
  return v && addressTypes.includes(v as (typeof addressTypes)[number])
    ? (v as ContactAddress["type"])
    : undefined
}

/**
 * Parse vCard data to Contact
 */
export function parseVCard(vcard: string): Contact | null {
  // Unfold lines
  const unfolded = vcard.replace(/\r?\n[ \t]/g, "")

  // Extract properties
  const getValue = (name: string): string | undefined => {
    const regex = new RegExp(`^${name}[;:](.*)$`, "im")
    const match = unfolded.match(regex)
    if (!match) return undefined
    // Get value after the last colon (handles parameters)
    const parts = match[1]?.split(":")
    return parts?.[parts.length - 1]?.trim()
  }

  const getValueWithParams = (
    name: string,
  ): { value: string; params: Record<string, string> } | undefined => {
    const regex = new RegExp(`^${name}([;:].*)$`, "im")
    const match = unfolded.match(regex)
    if (!match) return undefined

    const line = match[1] || ""
    const colonIndex = line.lastIndexOf(":")
    const paramStr = line.slice(0, colonIndex)
    const value = line.slice(colonIndex + 1)

    const params: Record<string, string> = {}
    const paramRegex = /;([^=;]+)=([^;:]+)/g
    let paramMatch
    while ((paramMatch = paramRegex.exec(paramStr)) !== null) {
      if (paramMatch[1] && paramMatch[2]) {
        params[paramMatch[1].toLowerCase()] = paramMatch[2]
      }
    }

    return { value, params }
  }

  const uid = getValue("UID")
  const fn = getValue("FN")

  if (!uid || !fn) return null

  const contact: Contact = {
    uid,
    fullName: fn,
  }

  // Parse structured name (N property)
  const n = getValue("N")
  if (n) {
    const parts = n.split(";")
    contact.name = {
      family: parts[0] || undefined,
      given: parts[1] || undefined,
      middle: parts[2] || undefined,
      prefix: parts[3] || undefined,
      suffix: parts[4] || undefined,
    }
  }

  // Parse emails
  const emailRegex = /^EMAIL[;:](.*)$/gim
  const emails: ContactEmail[] = []
  let match
  while ((match = emailRegex.exec(unfolded)) !== null) {
    const line = match[1] || ""
    const colonIndex = line.lastIndexOf(":")
    const value = colonIndex >= 0 ? line.slice(colonIndex + 1) : line
    const paramStr = colonIndex >= 0 ? line.slice(0, colonIndex) : ""

    const typeMatch = paramStr.match(/TYPE=([^;:,]+)/i)
    const type = parseEmailType(typeMatch?.[1]?.toLowerCase())
    const primary = paramStr.toLowerCase().includes("pref")

    if (value) {
      emails.push({ value: value.trim(), type, primary })
    }
  }
  if (emails.length > 0) {
    contact.emails = emails
  }

  // Parse phones
  const telRegex = /^TEL[;:](.*)$/gim
  const phones: ContactPhone[] = []
  while ((match = telRegex.exec(unfolded)) !== null) {
    const line = match[1] || ""
    const colonIndex = line.lastIndexOf(":")
    const value = colonIndex >= 0 ? line.slice(colonIndex + 1) : line
    const paramStr = colonIndex >= 0 ? line.slice(0, colonIndex) : ""

    const typeMatch = paramStr.match(/TYPE=([^;:,]+)/i)
    const type = parsePhoneType(typeMatch?.[1]?.toLowerCase())
    const primary = paramStr.toLowerCase().includes("pref")

    if (value) {
      phones.push({ value: value.trim(), type, primary })
    }
  }
  if (phones.length > 0) {
    contact.phones = phones
  }

  // Parse addresses
  const adrRegex = /^ADR[;:](.*)$/gim
  const addresses: ContactAddress[] = []
  while ((match = adrRegex.exec(unfolded)) !== null) {
    const line = match[1] || ""
    const colonIndex = line.lastIndexOf(":")
    const value = colonIndex >= 0 ? line.slice(colonIndex + 1) : line
    const paramStr = colonIndex >= 0 ? line.slice(0, colonIndex) : ""

    const typeMatch = paramStr.match(/TYPE=([^;:,]+)/i)
    const type = parseAddressType(typeMatch?.[1]?.toLowerCase())

    // ADR format: PO Box;Extended;Street;City;Region;Postal;Country
    const parts = value.split(";")
    addresses.push({
      type,
      street: parts[2] || undefined,
      city: parts[3] || undefined,
      region: parts[4] || undefined,
      postalCode: parts[5] || undefined,
      country: parts[6] || undefined,
    })
  }
  if (addresses.length > 0) {
    contact.addresses = addresses
  }

  // Other properties
  contact.org = getValue("ORG")
  contact.title = getValue("TITLE")
  contact.birthday = getValue("BDAY")
  contact.note = getValue("NOTE")

  // Photo (URL or inline)
  const photo = getValueWithParams("PHOTO")
  if (photo) {
    contact.photo = photo.value
  }

  return contact
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

  // Structured name
  if (contact.name) {
    const n = [
      contact.name.family || "",
      contact.name.given || "",
      contact.name.middle || "",
      contact.name.prefix || "",
      contact.name.suffix || "",
    ].join(";")
    lines.push(`N:${n}`)
  }

  // Emails
  if (contact.emails) {
    for (const email of contact.emails) {
      const type = email.type ? `;TYPE=${email.type.toUpperCase()}` : ""
      const pref = email.primary ? ";PREF=1" : ""
      lines.push(`EMAIL${type}${pref}:${email.value}`)
    }
  }

  // Phones
  if (contact.phones) {
    for (const phone of contact.phones) {
      const type = phone.type ? `;TYPE=${phone.type.toUpperCase()}` : ""
      const pref = phone.primary ? ";PREF=1" : ""
      lines.push(`TEL${type}${pref}:${phone.value}`)
    }
  }

  // Addresses
  if (contact.addresses) {
    for (const addr of contact.addresses) {
      const type = addr.type ? `;TYPE=${addr.type.toUpperCase()}` : ""
      const adr = [
        "", // PO Box
        "", // Extended
        addr.street || "",
        addr.city || "",
        addr.region || "",
        addr.postalCode || "",
        addr.country || "",
      ].join(";")
      lines.push(`ADR${type}:${adr}`)
    }
  }

  if (contact.org) {
    lines.push(`ORG:${escapeValue(contact.org)}`)
  }

  if (contact.title) {
    lines.push(`TITLE:${escapeValue(contact.title)}`)
  }

  if (contact.birthday) {
    lines.push(`BDAY:${contact.birthday}`)
  }

  if (contact.note) {
    lines.push(`NOTE:${escapeValue(contact.note)}`)
  }

  if (contact.photo) {
    if (contact.photo.startsWith("http")) {
      lines.push(`PHOTO:${contact.photo}`)
    } else {
      lines.push(`PHOTO:data:image/jpeg;base64,${contact.photo}`)
    }
  }

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
