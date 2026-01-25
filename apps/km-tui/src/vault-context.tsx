/**
 * VaultContext - Dependency Injection for Storage Operations
 *
 * Provides the Vault domain object to TUI components via React Context.
 * This enables testing with mock vaults.
 *
 * @example
 * // In component
 * const vault = useVault();
 * const children = vault.getChildren(parentId);
 *
 * // In production
 * <VaultProvider vault={realVault}><Board /></VaultProvider>
 *
 * // In tests
 * <VaultProvider vault={mockVault}><Board /></VaultProvider>
 */

import React, { createContext, useContext, type ReactNode } from "react";
import type { Vault } from "@km/storage";
export type { Vault };

const VaultContext = createContext<Vault | null>(null);

/**
 * Hook to access the vault. Must be used within a VaultProvider.
 */
export function useVault(): Vault {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return ctx;
}

/**
 * Provides the vault to child components.
 */
export function VaultProvider({
  vault,
  children,
}: {
  vault: Vault;
  children: ReactNode;
}) {
  return (
    <VaultContext.Provider value={vault}>{children}</VaultContext.Provider>
  );
}

export { VaultContext };
