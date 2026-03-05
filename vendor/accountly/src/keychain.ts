import { execSync } from "node:child_process"
import { userInfo } from "node:os"
import type { Credential } from "./types.ts"

const CLAUDE_CODE_SERVICE = "Claude Code-credentials"

/** Get the Keychain account name (system username) */
function getKeychainAccount(): string {
  return userInfo().username
}

/** Read the current Claude Code credential from macOS Keychain */
export function readKeychainCredential(): Credential | undefined {
  const account = getKeychainAccount()
  try {
    const result = execSync(`security find-generic-password -s "${CLAUDE_CODE_SERVICE}" -a "${account}" -w`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    return JSON.parse(result) as Credential
  } catch {
    return undefined
  }
}

/** Write a credential to the Claude Code Keychain slot */
export function writeKeychainCredential(credential: Credential): void {
  const account = getKeychainAccount()
  const json = JSON.stringify(credential)
  // Delete existing entry first (security add fails if it exists)
  try {
    execSync(`security delete-generic-password -s "${CLAUDE_CODE_SERVICE}" -a "${account}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch {
    // Entry may not exist — that's fine
  }
  // Use stdin to pass the password value to avoid shell escaping issues
  execSync(
    `security add-generic-password -s "${CLAUDE_CODE_SERVICE}" -a "${account}" -w "${json.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    { stdio: ["pipe", "pipe", "pipe"] },
  )
}

/** Check if a Keychain credential exists */
export function keychainCredentialExists(): boolean {
  const account = getKeychainAccount()
  try {
    execSync(`security find-generic-password -s "${CLAUDE_CODE_SERVICE}" -a "${account}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    })
    return true
  } catch {
    return false
  }
}
