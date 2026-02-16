import { readCredential } from "./credentials.ts"
import { writeKeychainCredential } from "./keychain.ts"
import { getAccount, setActiveAccount } from "./config.ts"

export interface SwitchResult {
  success: boolean
  accountName: string
  error?: string
}

/** Switch the active Claude Code account by writing to Keychain */
export function switchAccount(name: string): SwitchResult {
  const account = getAccount(name)
  if (!account) {
    return { success: false, accountName: name, error: "Account not found" }
  }

  if (account.provider !== "claude-oauth") {
    return {
      success: false,
      accountName: name,
      error: "Only claude-oauth accounts can be switched via Keychain",
    }
  }

  const credential = readCredential(name)
  if (!credential) {
    return {
      success: false,
      accountName: name,
      error: "No credentials found for this account",
    }
  }

  try {
    writeKeychainCredential(credential)
    setActiveAccount(name)
    return { success: true, accountName: name }
  } catch (err) {
    return {
      success: false,
      accountName: name,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
