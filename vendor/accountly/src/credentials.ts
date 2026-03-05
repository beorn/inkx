import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, chmodSync, renameSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Credential } from "./types.ts"

const CREDS_DIR = join(homedir(), ".config", "accountly", "credentials")

function ensureCredsDir(): void {
  if (!existsSync(CREDS_DIR)) {
    mkdirSync(CREDS_DIR, { recursive: true })
    chmodSync(CREDS_DIR, 0o700)
  }
}

function credPath(name: string): string {
  return join(CREDS_DIR, `${name}.json`)
}

/** Read credential for an account */
export function readCredential(name: string): Credential | undefined {
  const path = credPath(name)
  if (!existsSync(path)) return undefined
  const raw = readFileSync(path, "utf-8")
  return JSON.parse(raw) as Credential
}

/** Write credential for an account (mode 0600) */
export function writeCredential(name: string, credential: Credential): void {
  ensureCredsDir()
  const path = credPath(name)
  writeFileSync(path, JSON.stringify(credential, null, 2) + "\n", "utf-8")
  chmodSync(path, 0o600)
}

/** Delete credential for an account */
export function deleteCredential(name: string): boolean {
  const path = credPath(name)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

/** Rename credential file */
export function renameCredential(oldName: string, newName: string): boolean {
  const oldPath = credPath(oldName)
  if (!existsSync(oldPath)) return false
  renameSync(oldPath, credPath(newName))
  return true
}

/** Check if credential exists */
export function credentialExists(name: string): boolean {
  return existsSync(credPath(name))
}

/** Get the credentials directory path (for testing) */
export function getCredsDir(): string {
  return CREDS_DIR
}
